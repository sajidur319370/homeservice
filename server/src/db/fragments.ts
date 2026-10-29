// SQL pieces used by more than one file, so every place agrees on the rules.

export const HOLD_MINUTES = 15;
const HOLD = `interval '${HOLD_MINUTES} minutes'`; // a constant, never user input

/**
 * A booking (alias `b`) BLOCKS its time if it is:
 *   - CONFIRMED or COMPLETED, OR
 *   - PENDING_PAYMENT and created less than 15 minutes ago (the payment hold).
 * Old unpaid bookings stop blocking on their own: no cron job needed.
 * Used by the slots list, booking creation AND payment confirmation.
 */
export const BLOCKING_SQL = `(b.status IN ('CONFIRMED', 'COMPLETED')
  OR (b.status = 'PENDING_PAYMENT' AND b.created_at > now() - ${HOLD}))`;

/** Work not done yet: CONFIRMED, or still inside its payment hold. */
export const OPEN_SQL = `(b.status = 'CONFIRMED'
  OR (b.status = 'PENDING_PAYMENT' AND b.created_at > now() - ${HOLD}))`;

/** true while an unpaid booking still holds its slot. */
export const HOLD_ACTIVE_SQL = `(b.status = 'PENDING_PAYMENT' AND b.created_at > now() - ${HOLD})`;

/** Average rating from sum and count; NULL when there are no reviews yet. */
export const RATING_AVG_SQL = `round(p.rating_sum::numeric / nullif(p.rating_count, 0), 1)::float`;

/** Everything a public service card needs. Never selects emails or password hashes. */
export const SERVICE_CARD_SQL = `
  SELECT s.id, s.title, s.description, s.price, s.duration_min AS "durationMin", s.area,
         s.provider_id AS "providerId", u.name AS "providerName",
         c.id AS "categoryId", c.name AS "categoryName", c.slug AS "categorySlug",
         ${RATING_AVG_SQL} AS "ratingAvg", p.rating_count AS "ratingCount"
  FROM services s
  JOIN provider_profiles p ON p.user_id = s.provider_id
  JOIN users u             ON u.id = s.provider_id
  JOIN categories c        ON c.id = s.category_id`;

/** "50%_off" → "50\%\_off", so the user's % and _ are matched literally by ILIKE. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
