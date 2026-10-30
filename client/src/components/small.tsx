// Tiny presentational pieces used on several pages.
import type { ReactNode } from "react";
import type { BookingStatus } from "../types";

export function Stars({ value, count }: { value: number | null; count: number }) {
  if (!count || value === null) return <span className="muted">New</span>;
  return (
    <span className="stars" title={`${value} out of 5`}>
      ★ {value.toFixed(1)} <span className="muted">({count})</span>
    </span>
  );
}

const STATUS: Record<BookingStatus, { label: string; tone: string }> = {
  PENDING_PAYMENT: { label: "Waiting for payment", tone: "amber" },
  CONFIRMED: { label: "Confirmed", tone: "teal" },
  COMPLETED: { label: "Completed", tone: "green" },
  CANCELLED: { label: "Cancelled", tone: "grey" },
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  const s = STATUS[status];
  return <span className={`badge badge-${s.tone}`}>{s.label}</span>;
}

// <label> + input + error message, so every form looks the same.
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  if (!children) return null;
  return <p className="alert alert-error">{children}</p>;
}
