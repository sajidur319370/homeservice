// Integration tests: the real app + a real (TEST) database.
// Needs DATABASE_URL etc. in server/.env.test, then: npm run test:setup && npm test
// Without DATABASE_URL these tests are skipped and only the unit tests run.
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";

const hasDb = Boolean(process.env.DATABASE_URL);

describe("HomeService API", { skip: !hasDb && "no DATABASE_URL (see .env.test)" }, () => {
  let base = "";
  let close = async () => {};
  const tokens: Record<string, string> = {};

  type Res = { status: number; body: any };
  async function call(method: string, path: string, opts: { token?: string; body?: unknown } = {}): Promise<Res> {
    const headers: Record<string, string> = {};
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${base}/api${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  }

  async function login(email: string) {
    const res = await call("POST", "/auth/login", { body: { email, password: "password123" } });
    assert.equal(res.status, 200);
    return res.body.token as string;
  }

  // First free slots for a service in the next 14 days (skips Fridays automatically).
  async function freeSlots(providerId: string, serviceId: string): Promise<string[]> {
    for (let i = 1; i <= 14; i++) {
      const date = new Date(Date.now() + i * 86_400_000 + 6 * 3_600_000).toISOString().slice(0, 10);
      const res = await call("GET", `/providers/${providerId}/slots?serviceId=${serviceId}&date=${date}`);
      if (res.body.slots?.length) return res.body.slots;
    }
    throw new Error("No free slot in the next 14 days. Re-seed the test database.");
  }

  before(async () => {
    const { app } = await import("../src/app.ts");
    const { pool } = await import("../src/db/client.ts");
    const server = app.listen(0); // any free port
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
    close = async () => {
      await new Promise((resolve) => server.close(resolve));
      await pool.end();
    };

    tokens.customer = await login("customer@homeservice.dev");
    tokens.rahim = await login("rahim@homeservice.dev");
  });

  after(() => close());

  test("health check answers", async () => {
    const res = await call("GET", "/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });

  test("wrong password → 401 with a generic message", async () => {
    const res = await call("POST", "/auth/login", { body: { email: "customer@homeservice.dev", password: "nope-nope" } });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, "Wrong email or password");
  });

  test("search hides the unapproved provider's service", async () => {
    const res = await call("GET", "/services");
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 5);
    assert.ok(!res.body.services.some((s: { title: string }) => s.title === "Switchboard installation"));
  });

  test("auth rules: no token → 401, wrong role → 403", async () => {
    assert.equal((await call("GET", "/bookings/me")).status, 401);
    const asCustomer = await call("POST", "/services", { token: tokens.customer, body: {} });
    assert.equal(asCustomer.status, 403);
  });

  test("booking a taken slot → 409; pay (mock) → CONFIRMED", async () => {
    const { body } = await call("GET", "/services?q=fan");
    const service = body.services[0];
    const [startAt] = await freeSlots(service.providerId, service.id);
    const booking = { serviceId: service.id, startAt, address: "House 1, Road 2, Mirpur" };

    const first = await call("POST", "/bookings", { token: tokens.customer, body: booking });
    assert.equal(first.status, 201);
    assert.equal(first.body.booking.status, "PENDING_PAYMENT");
    assert.equal(first.body.booking.price, 500); // price snapshot

    const again = await call("POST", "/bookings", { token: tokens.customer, body: booking });
    assert.equal(again.status, 409);

    const pay = await call("POST", `/payments/init/${first.body.booking.id}`, { token: tokens.customer });
    assert.equal(pay.status, 200);
    assert.match(pay.body.url, /\/payment\/success$/);

    const mine = await call("GET", "/bookings/me", { token: tokens.customer });
    const saved = mine.body.bookings.find((b: { id: string }) => b.id === first.body.booking.id);
    assert.equal(saved.status, "CONFIRMED");
    assert.equal(saved.paymentStatus, "PAID");
  });

  test("5 simultaneous bookings for one slot → exactly one wins", async () => {
    const { body } = await call("GET", "/services?q=wiring");
    const service = body.services[0];
    const [startAt] = await freeSlots(service.providerId, service.id);

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        call("POST", "/bookings", {
          token: tokens.customer,
          body: { serviceId: service.id, startAt, address: "House 1, Road 2, Mirpur" },
        }),
      ),
    );
    const codes = results.map((r) => r.status).sort();
    assert.deepEqual(codes, [201, 409, 409, 409, 409]);
  });

  test("complete → review → a second review is refused", async () => {
    const mine = await call("GET", "/bookings/me", { token: tokens.rahim });
    const job = mine.body.bookings.find(
      (b: { status: string; startAt: string }) => b.status === "CONFIRMED" && new Date(b.startAt) < new Date(),
    );
    assert.ok(job, "seeded job from yesterday should exist");

    assert.equal((await call("PATCH", `/bookings/${job.id}/complete`, { token: tokens.rahim })).status, 200);

    const bad = await call("POST", "/reviews", { token: tokens.customer, body: { bookingId: job.id, rating: 9 } });
    assert.equal(bad.status, 400);

    const ok = await call("POST", "/reviews", { token: tokens.customer, body: { bookingId: job.id, rating: 4 } });
    assert.equal(ok.status, 201);

    const twice = await call("POST", "/reviews", { token: tokens.customer, body: { bookingId: job.id, rating: 4 } });
    assert.equal(twice.status, 409);

    const card = await call("GET", "/services?q=fan");
    assert.equal(card.body.services[0].ratingAvg, 4.5); // (5 + 4) / 2
    assert.equal(card.body.services[0].ratingCount, 2);
  });

  test("admin categories carry a service count; a used category can't be removed", async () => {
    const admin = await login("admin@homeservice.dev");
    assert.equal((await call("GET", "/admin/categories", { token: tokens.customer })).status, 403);

    const res = await call("GET", "/admin/categories", { token: admin });
    assert.equal(res.status, 200);
    const electrician = res.body.categories.find((c: { name: string }) => c.name === "Electrician");
    assert.equal(electrician.serviceCount, 3); // the unapproved provider's service counts too

    const del = await call("DELETE", `/categories/${electrician.id}`, { token: admin });
    assert.equal(del.status, 409);
    assert.equal(del.body.error, "Can't remove: 3 service(s) use this category");
  });
});
