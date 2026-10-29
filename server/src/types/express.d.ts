import type { AuthUser } from "../types.ts";

// Teach TypeScript that requireAuth adds `req.user` to every Express request.
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
