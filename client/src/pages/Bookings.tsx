import { useState } from "react";
import { api, errorMessage, useApi } from "../api";
import { useAuth } from "../auth";
import { useConfirm } from "../components/ConfirmToast";
import { ErrorText, StatusBadge } from "../components/small";
import { formatDateTime, formatTaka } from "../format";
import type { Booking } from "../types";

export default function Bookings() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const isCustomer = user?.role === "CUSTOMER";
  const { data, error, loading, reload } = useApi<{ bookings: Booking[] }>("/bookings/me");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Run one button's request, then reload the list.
  async function act(id: string, request: () => Promise<unknown>) {
    setBusyId(id);
    setActionError(null);
    try {
      await request();
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function pay(id: string) {
    setBusyId(id);
    setActionError(null);
    try {
      const { url } = await api<{ url: string }>(`/payments/init/${id}`, { method: "POST" });
      window.location.assign(url); // full-page redirect to the gateway (or straight to the result in mock mode)
    } catch (err) {
      setActionError(errorMessage(err));
      setBusyId(null);
    }
  }

  return (
    <div className="stack">
      <h1>{isCustomer ? "My bookings" : "My jobs"}</h1>
      <ErrorText>{error ?? actionError}</ErrorText>
      {loading && <p className="muted">Loading…</p>}
      {data?.bookings.length === 0 && <p className="muted">Nothing here yet.</p>}

      {data?.bookings.map((b) => {
        const started = new Date(b.startAt) <= new Date();
        const busy = busyId === b.id;
        return (
          <div key={b.id} className="card stack">
            <div className="row between">
              <h3>{b.serviceTitle}</h3>
              <StatusBadge status={b.status} />
            </div>
            <p>
              {formatDateTime(b.startAt)} · {formatTaka(b.price)} · {b.address}
            </p>
            <p className="muted">
              {isCustomer ? `Provider: ${b.providerName} ${b.providerPhone ?? ""}` : `Customer: ${b.customerName} ${b.customerPhone ?? ""}`}
            </p>
            {b.status === "PENDING_PAYMENT" && !b.holdActive && (
              <p className="muted">The 15-minute hold expired. This time may be taken; please book again.</p>
            )}
            {b.refundRequired && <p className="alert">💸 Refund pending</p>}
            {b.reviewRating && <p>You rated {"★".repeat(b.reviewRating)}</p>}

            <div className="row">
              {isCustomer && b.status === "PENDING_PAYMENT" && b.holdActive && (
                <button className="btn btn-primary" disabled={busy} onClick={() => void pay(b.id)}>
                  Pay {formatTaka(b.price)}
                </button>
              )}
              {isCustomer && (b.status === "PENDING_PAYMENT" || b.status === "CONFIRMED") && !started && (
                <button
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={async () => {
                    if (await confirm({ message: "Cancel this booking?", yes: "Yes, cancel", no: "Keep it" })) {
                      void act(b.id, () => api(`/bookings/${b.id}/cancel`, { method: "PATCH" }));
                    }
                  }}
                >
                  Cancel
                </button>
              )}
              {!isCustomer && b.status === "CONFIRMED" && started && (
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => void act(b.id, () => api(`/bookings/${b.id}/complete`, { method: "PATCH" }))}
                >
                  Mark complete
                </button>
              )}
            </div>

            {isCustomer && b.status === "COMPLETED" && !b.reviewRating && (
              <ReviewForm bookingId={b.id} onDone={reload} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ReviewForm({ bookingId, onDone }: { bookingId: string; onDone: () => void }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    try {
      await api("/reviews", { method: "POST", body: { bookingId, rating, comment: comment.trim() || undefined } });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="stack review-form">
      <strong>How was it?</strong>
      <div className="row">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} className={`star ${n <= rating ? "star-on" : ""}`} onClick={() => setRating(n)} aria-label={`${n} stars`}>
            ★
          </button>
        ))}
      </div>
      <textarea placeholder="Optional comment" maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
      <ErrorText>{error}</ErrorText>
      <button className="btn btn-primary" disabled={rating === 0} onClick={() => void submit()}>
        Send review
      </button>
    </div>
  );
}
