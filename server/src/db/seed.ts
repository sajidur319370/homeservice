// Demo data. Usage: npm run db:seed   (safe to repeat: it wipes everything first)
import { hashPassword } from "../lib/password.ts";
import { addMinutes, dhakaToUtc, utcToDhaka } from "../lib/time.ts";
import { pool, query, queryOne, withTransaction, type Db } from "./client.ts";

const CATEGORIES = ["Electrician", "Plumber", "AC Technician", "Tutor"];
const WORK_DAYS = [6, 0, 1, 2, 3, 4]; // Saturday–Thursday. Friday (5) off.
const NINE_AM = 9 * 60;
const SIX_PM = 18 * 60;

type SeedService = { title: string; category: string; price: number; durationMin: number; description: string };
type SeedProvider = { name: string; email: string; area: string; approved: boolean; bio: string; services: SeedService[] };

const PROVIDERS: SeedProvider[] = [
  {
    name: "Rahim Uddin", email: "rahim@homeservice.dev", area: "Mirpur", approved: true,
    bio: "Licensed electrician, 10 years of experience.",
    services: [
      { title: "Fan & light repair", category: "Electrician", price: 500, durationMin: 60, description: "Repair or replace ceiling fans, lights and switches." },
      { title: "House wiring check", category: "Electrician", price: 1200, durationMin: 90, description: "Full safety check of your home wiring and DB box." },
    ],
  },
  {
    name: "Jamal Hossain", email: "jamal@homeservice.dev", area: "Uttara", approved: true,
    bio: "Plumber for kitchens and bathrooms.",
    services: [
      { title: "Leaking tap & pipe fix", category: "Plumber", price: 400, durationMin: 60, description: "Fix leaking taps, pipes and basin connections." },
    ],
  },
  {
    name: "Tanvir Ahmed", email: "tanvir@homeservice.dev", area: "Gulshan", approved: true,
    bio: "AC servicing for all brands.",
    services: [
      { title: "AC full servicing", category: "AC Technician", price: 1500, durationMin: 90, description: "Cleaning, gas pressure check and performance test." },
    ],
  },
  {
    name: "Salma Begum", email: "salma@homeservice.dev", area: "Dhanmondi", approved: true,
    bio: "Math and physics tutor for SSC/HSC.",
    services: [
      { title: "SSC math tutoring", category: "Tutor", price: 800, durationMin: 60, description: "One-to-one math class at your home." },
    ],
  },
  {
    name: "Karim Mia", email: "pending@homeservice.dev", area: "Banani", approved: false,
    bio: "New electrician, waiting for approval.",
    services: [
      { title: "Switchboard installation", category: "Electrician", price: 700, durationMin: 60, description: "Install a new switchboard with sockets." },
    ],
  },
];

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

async function insertUser(name: string, email: string, role: string, passwordHash: string, db: Db = pool) {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id`,
    [name, email, passwordHash, role],
    db,
  );
  return row!.id;
}

await withTransaction(async (tx) => {
  // CASCADE empties every table that points at users or categories.
  await tx.query("TRUNCATE users, categories CASCADE");

  const hash = await hashPassword("password123");
  await insertUser("Admin", "admin@homeservice.dev", "ADMIN", hash, tx);
  const customerId = await insertUser("Nadia Islam", "customer@homeservice.dev", "CUSTOMER", hash, tx);

  const categoryIds = new Map<string, string>();
  for (const name of CATEGORIES) {
    const row = await queryOne<{ id: string }>(
      "INSERT INTO categories (name, slug) VALUES ($1, $2) RETURNING id",
      [name, slug(name)],
      tx,
    );
    categoryIds.set(name, row!.id);
  }

  let rahimFanService = { providerId: "", serviceId: "", price: 0 };

  for (const p of PROVIDERS) {
    const providerId = await insertUser(p.name, p.email, "PROVIDER", hash, tx);
    await query(
      "INSERT INTO provider_profiles (user_id, area, bio, approved) VALUES ($1, $2, $3, $4)",
      [providerId, p.area, p.bio, p.approved],
      tx,
    );
    for (const weekday of WORK_DAYS) {
      await query(
        "INSERT INTO availability (provider_id, weekday, start_min, end_min) VALUES ($1, $2, $3, $4)",
        [providerId, weekday, NINE_AM, SIX_PM],
        tx,
      );
    }
    for (const s of p.services) {
      const row = await queryOne<{ id: string }>(
        `INSERT INTO services (provider_id, category_id, title, description, price, duration_min, area)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [providerId, categoryIds.get(s.category), s.title, s.description, s.price, s.durationMin, p.area],
        tx,
      );
      if (s.title === "Fan & light repair") rahimFanService = { providerId, serviceId: row!.id, price: s.price };
    }
  }

  // Two demo jobs for Nadia with Rahim, both at 10:00 AM Dhaka time:
  //   yesterday → CONFIRMED + paid (Rahim can "Mark complete", then Nadia can review)
  //   last week → COMPLETED + paid + ★5 review
  const daysAgo = (n: number) => utcToDhaka(new Date(Date.now() - n * 86_400_000)).dateStr;
  const jobs = [
    { dateStr: daysAgo(1), status: "CONFIRMED" },
    { dateStr: daysAgo(7), status: "COMPLETED" },
  ];
  for (const job of jobs) {
    const startAt = dhakaToUtc(job.dateStr, 10 * 60);
    const booking = await queryOne<{ id: string }>(
      `INSERT INTO bookings (customer_id, provider_id, service_id, start_at, end_at, price, address, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [customerId, rahimFanService.providerId, rahimFanService.serviceId, startAt, addMinutes(startAt, 60),
        rahimFanService.price, "House 12, Road 3, Mirpur 10", job.status, addMinutes(startAt, -24 * 60)],
      tx,
    );
    await query(
      "INSERT INTO payments (booking_id, tran_id, amount, status, val_id) VALUES ($1, $2, $3, 'PAID', 'SEED')",
      [booking!.id, `SEED-${job.dateStr}`, rahimFanService.price],
      tx,
    );
    if (job.status === "COMPLETED") {
      await query(
        "INSERT INTO reviews (booking_id, provider_id, customer_id, rating, comment) VALUES ($1, $2, $3, 5, $4)",
        [booking!.id, rahimFanService.providerId, customerId, "Quick and tidy work. Fan is silent now!"],
        tx,
      );
      await query(
        "UPDATE provider_profiles SET rating_sum = 5, rating_count = 1 WHERE user_id = $1",
        [rahimFanService.providerId],
        tx,
      );
    }
  }
});

const counts = await query<{ table: string; count: number }>(`
  SELECT 'users' AS table, count(*)::int AS count FROM users
  UNION ALL SELECT 'services', count(*)::int FROM services
  UNION ALL SELECT 'availability', count(*)::int FROM availability
  UNION ALL SELECT 'bookings', count(*)::int FROM bookings`);
console.table(counts);
console.log("🌱 Seeded. Every demo password is: password123");
await pool.end();
