import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "../lib/http.ts";

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "Route not found" });
};

// Database rules turned into friendly answers.
// Codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
const PG_ERRORS: Record<string, [status: number, message: string]> = {
  "23505": [409, "Already exists"], //                       unique_violation
  "23503": [400, "Related record not found"], //             foreign_key_violation
  "23514": [400, "A value is not allowed"], //               check_violation
  "23P01": [409, "That time overlaps another booking"], //   exclusion_violation
  "22P02": [400, "Invalid id or value"], //                  invalid_text_representation (bad uuid)
};

// Express knows this is an error handler because it has 4 parameters.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Invalid input",
      details: err.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })),
    });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  const pg = PG_ERRORS[String(err?.code)];
  if (pg) {
    res.status(pg[0]).json({ error: pg[1] });
    return;
  }

  // express.json() errors (broken JSON, body too large) carry a 4xx status.
  if (typeof err?.status === "number" && err.status >= 400 && err.status < 500) {
    res.status(err.status).json({ error: "Invalid request body" });
    return;
  }

  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
};
