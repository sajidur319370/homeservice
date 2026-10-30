import type { Role } from "./types";

export const AREAS = ["Mirpur", "Dhanmondi", "Uttara", "Gulshan", "Banani", "Mohammadpur", "Motijheel"];

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Where each role lands after logging in.
export const HOME_BY_ROLE: Record<Role, string> = { CUSTOMER: "/", PROVIDER: "/provider", ADMIN: "/admin" };
