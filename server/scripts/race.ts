// Fires 5 booking requests for the SAME slot at the SAME moment.
// Usage: API running in another terminal, then:  npm run race
// Against production:  API_URL=https://your-app.onrender.com/api npm run race
const API = process.env.API_URL ?? "http://localhost:5000/api";

type Res = { status: number; body: any };

async function json(path: string, init: RequestInit = {}): Promise<Res> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const login = await json("/auth/login", {
  method: "POST",
  body: JSON.stringify({ email: "customer@homeservice.dev", password: "password123" }),
});
const token: string = login.body.token;

const { body } = await json("/services?q=fan");
const service = body.services[0];

// Find the first free slot in the next 14 days.
let startAt: string | undefined;
for (let i = 1; i <= 14 && !startAt; i++) {
  const date = new Date(Date.now() + i * 86_400_000 + 6 * 3_600_000).toISOString().slice(0, 10);
  const slots = await json(`/providers/${service.providerId}/slots?serviceId=${service.id}&date=${date}`);
  startAt = slots.body.slots?.[0];
}

console.log(`Firing 5 simultaneous bookings: "${service.title}" at ${startAt}`);

const results = await Promise.all(
  Array.from({ length: 5 }, () =>
    json("/bookings", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ serviceId: service.id, startAt, address: "House 1, Road 2, Mirpur" }),
    }),
  ),
);

const codes = results.map((r) => r.status);
console.log("Status codes:", codes.join(", "));
console.log(`✅ created: ${codes.filter((c) => c === 201).length}   ⛔ 409: ${codes.filter((c) => c === 409).length}`);
