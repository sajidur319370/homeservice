import jwt from "jsonwebtoken";
import { env } from "../config/env.ts";
import { isRole, type AuthUser } from "../types.ts";

export function signToken(user: AuthUser): string {
  return jwt.sign({ role: user.role }, env.JWT_SECRET, {
    subject: user.id,
    expiresIn: "7d",
    algorithm: "HS256",
  });
}

// Throws if the signature is wrong, the token expired, or the payload looks odd.
export function verifyToken(token: string): AuthUser {
  const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
  if (typeof payload === "string" || !payload.sub || !isRole(payload.role)) {
    throw new Error("Malformed token");
  }
  return { id: payload.sub, role: payload.role };
}
