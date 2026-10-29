import type { Request, RequestHandler } from "express";
import { HttpError } from "../lib/http.ts";
import { verifyToken } from "../lib/jwt.ts";
import type { AuthUser, Role } from "../types.ts";

// 401 if there's no valid token. Otherwise sets req.user = { id, role }.
export const requireAuth: RequestHandler = (req, _res, next) => {
  const [type, token] = (req.headers.authorization ?? "").split(" ");
  if (type !== "Bearer" || !token) throw new HttpError(401, "Please log in");

  try {
    req.user = verifyToken(token); // checks signature AND expiry
  } catch {
    throw new HttpError(401, "Your session expired, please log in again");
  }
  next();
};

// Use AFTER requireAuth. 403 if the user's role isn't in the list.
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new HttpError(403, "You are not allowed to do this");
    }
    next();
  };
}

// Inside a handler protected by requireAuth: the typed logged-in user (no `req.user!`).
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw new HttpError(401, "Please log in");
  return req.user;
}
