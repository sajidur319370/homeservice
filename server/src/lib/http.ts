import type { Request } from "express";

// Throw this anywhere: throw new HttpError(404, "Service not found")
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// A URL parameter as a plain string: param(req, "id") for "/bookings/:id".
export function param(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string") throw new HttpError(400, `Missing ${name}`);
  return value;
}
