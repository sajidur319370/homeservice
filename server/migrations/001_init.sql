-- 001_init.sql: the whole HomeService schema (8 tables).
-- Rule: never edit a migration that already ran somewhere. Add 002_..., 003_... instead.

CREATE EXTENSION IF NOT EXISTS btree_gist; -- lets one GiST index mix "=" on uuid with "&&" on time ranges
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- makes ILIKE '%fan%' searches use an index

-- ── People ────────────────────────────────────────────────────────────
CREATE TABLE users (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL CHECK (length(name) BETWEEN 2 AND 60),
  email         text        NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash text        NOT NULL,
  phone         text,
  role          text        NOT NULL DEFAULT 'CUSTOMER'
                            CHECK (role IN ('CUSTOMER', 'PROVIDER', 'ADMIN')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One-to-one with users: the provider's id IS their user id.
CREATE TABLE provider_profiles (
  user_id      uuid    PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  area         text    NOT NULL,
  bio          text,
  approved     boolean NOT NULL DEFAULT false,       -- an admin must approve (BR-1)
  rating_sum   integer NOT NULL DEFAULT 0 CHECK (rating_sum >= 0),
  rating_count integer NOT NULL DEFAULT 0 CHECK (rating_count >= 0)
);

-- ── Catalog ───────────────────────────────────────────────────────────
CREATE TABLE categories (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$') -- "ac-technician"
);

CREATE TABLE services (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id  uuid        NOT NULL REFERENCES provider_profiles (user_id),
  category_id  uuid        NOT NULL REFERENCES categories (id),
  title        text        NOT NULL CHECK (length(title) BETWEEN 3 AND 80),
  description  text        NOT NULL CHECK (length(description) BETWEEN 10 AND 1000),
  price        integer     NOT NULL CHECK (price BETWEEN 50 AND 100000), -- whole taka
  duration_min integer     NOT NULL CHECK (duration_min BETWEEN 30 AND 480 AND duration_min % 30 = 0),
  area         text        NOT NULL,
  active       boolean     NOT NULL DEFAULT true,  -- soft delete (BR-9)
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX services_category_idx ON services (category_id) WHERE active;
CREATE INDEX services_provider_idx ON services (provider_id);
CREATE INDEX services_area_idx     ON services (lower(area)) WHERE active;
CREATE INDEX services_search_idx   ON services USING gin ((title || ' ' || description) gin_trgm_ops);

-- Weekly working hours: at most one window per weekday.
CREATE TABLE availability (
  provider_id uuid     NOT NULL REFERENCES provider_profiles (user_id) ON DELETE CASCADE,
  weekday     smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),     -- 0 = Sunday … 5 = Friday
  start_min   smallint NOT NULL CHECK (start_min BETWEEN 0 AND 1440), -- minutes after midnight, Dhaka time
  end_min     smallint NOT NULL CHECK (end_min BETWEEN 0 AND 1440),
  PRIMARY KEY (provider_id, weekday),
  CHECK (end_min > start_min)
);

-- ── Bookings and money ────────────────────────────────────────────────
CREATE TABLE bookings (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid        NOT NULL REFERENCES users (id),
  provider_id uuid        NOT NULL REFERENCES provider_profiles (user_id),
  service_id  uuid        NOT NULL REFERENCES services (id),
  start_at    timestamptz NOT NULL,
  end_at      timestamptz NOT NULL,
  price       integer     NOT NULL CHECK (price > 0), -- snapshot of services.price (BR-5)
  address     text        NOT NULL CHECK (length(address) BETWEEN 5 AND 200),
  status      text        NOT NULL DEFAULT 'PENDING_PAYMENT'
                          CHECK (status IN ('PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED', 'CANCELLED')),
  created_at  timestamptz NOT NULL DEFAULT now(),     -- starts the 15-minute payment hold
  CHECK (end_at > start_at),

  -- Safety net under the app's row lock: two PAID bookings of one provider can never overlap.
  CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
    provider_id WITH =,
    tstzrange(start_at, end_at) WITH &&
  ) WHERE (status IN ('CONFIRMED', 'COMPLETED'))
);
CREATE INDEX bookings_provider_time_idx ON bookings (provider_id, start_at);
CREATE INDEX bookings_customer_idx      ON bookings (customer_id, start_at DESC);
CREATE INDEX bookings_service_idx       ON bookings (service_id);

CREATE TABLE payments (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      uuid        NOT NULL UNIQUE REFERENCES bookings (id),
  tran_id         text        NOT NULL UNIQUE,  -- our id for this attempt, sent to SSLCommerz
  amount          integer     NOT NULL CHECK (amount > 0),
  status          text        NOT NULL DEFAULT 'INITIATED' CHECK (status IN ('INITIATED', 'PAID', 'FAILED')),
  val_id          text,                         -- SSLCommerz validation id
  refund_required boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reviews (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid        NOT NULL UNIQUE REFERENCES bookings (id), -- one review per booking (BR-8)
  provider_id uuid        NOT NULL REFERENCES provider_profiles (user_id),
  customer_id uuid        NOT NULL REFERENCES users (id),
  rating      smallint    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     text        CHECK (length(comment) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reviews_provider_idx ON reviews (provider_id, created_at DESC);

-- ── Keep payments.updated_at correct without remembering it in every UPDATE ──
CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

CREATE TRIGGER payments_set_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
