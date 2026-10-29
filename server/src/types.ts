// String unions instead of TypeScript `enum`: Node's type stripping can't run enums,
// and the same strings are used in the database CHECK constraints.
export const ROLES = ["CUSTOMER", "PROVIDER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export type BookingStatus = "PENDING_PAYMENT" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
export type PaymentStatus = "INITIATED" | "PAID" | "FAILED";

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

// Who is logged in. Comes from the JWT, never from the request body.
export type AuthUser = { id: string; role: Role };
