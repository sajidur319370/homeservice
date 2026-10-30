import { useState } from "react";
import { ApiError, errorMessage } from "./api";

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

/**
 * Red messages under form fields. On submit: `if (!check(validate(form))) return;`
 * When the server still says no, `fromServer(err)` puts its per-field messages under
 * the fields and returns any message that belongs to no field (for the top of the form).
 */
export function useFieldErrors<K extends string>() {
  const [errors, setErrors] = useState<FieldErrors<K>>({});

  return {
    errors,
    /** Shows these messages. true = no problems, the form can be sent. */
    check(found: FieldErrors<K>): boolean {
      setErrors(found);
      return Object.keys(found).length === 0;
    },
    /** The user is fixing this field: hide its message. */
    clear(key: K) {
      setErrors((all) => (all[key] ? { ...all, [key]: undefined } : all));
    },
    fromServer(err: unknown): string | null {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) {
        setErrors(err.fields as FieldErrors<K>);
        return null;
      }
      return errorMessage(err);
    },
  };
}

// Small rules shared by several forms. Each returns the message, or undefined when fine.
export const required = (value: string, message: string) => (value.trim() ? undefined : message);
export const minLength = (value: string, n: number, message: string) => (value.trim().length >= n ? undefined : message);
export const validEmail = (value: string) =>
  !value.trim() ? "Email is required" : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? undefined : "Enter a valid email";

/** Drops the rules that passed, so only real problems are left. */
export function only<K extends string>(all: Record<K, string | undefined>): FieldErrors<K> {
  return Object.fromEntries(Object.entries(all).filter(([, v]) => v)) as FieldErrors<K>;
}
