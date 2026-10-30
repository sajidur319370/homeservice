import { useEffect, useState } from "react";

// fetch + JSON + token + errors in one place: everything axios did for us, in ~30 lines.
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Options = { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown };
type ErrorBody = { error?: string; details?: { message: string }[] };

export async function api<T>(path: string, { method = "GET", body }: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = localStorage.getItem("token");
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;

  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    // A zod 400 says "Invalid input" plus one message per wrong field: show those.
    const err = data as ErrorBody;
    const message = err.details?.length ? err.details.map((d) => d.message).join("\n") : err.error;
    throw new ApiError(res.status, message ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}

/**
 * Loads `path` and re-loads when it changes. `null` = don't load yet.
 * Each answer is saved WITH the path it belongs to, so a slow answer for an old path
 * is never shown for the new one, and `loading` is worked out instead of stored.
 */
export function useApi<T>(path: string | null) {
  const [state, setState] = useState<{ path: string | null; data?: T; error?: string }>({ path: null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (path === null) return;
    let ignore = false; // set by the cleanup when path changes or the page closes
    api<T>(path).then(
      (data) => !ignore && setState({ path, data }),
      (err: unknown) => !ignore && setState({ path, error: errorMessage(err) }),
    );
    return () => {
      ignore = true;
    };
  }, [path, version]);

  const fresh = state.path === path;
  return {
    data: fresh ? state.data : undefined,
    error: fresh ? state.error : undefined,
    loading: path !== null && !fresh,
    reload: () => setVersion((v) => v + 1),
  };
}
