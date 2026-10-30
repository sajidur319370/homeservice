import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { api, ApiError, errorMessage, useApi } from "../api";
import { useAuth } from "../auth";
import { useNotify } from "../components/Notify";
import { ErrorText, Field, Stars } from "../components/small";
import { dayLabel, formatDateTime, formatTaka, formatTime, next14Days } from "../format";
import type { Page, Review, ServiceCard } from "../types";

export default function ServiceDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const notify = useNotify();
  const days = next14Days();

  const [date, setDate] = useState<string | null>(null); // nothing picked yet: times appear after a date
  const [picked, setPicked] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, error: loadError } = useApi<{ service: ServiceCard }>(`/services/${id}`);
  const service = data?.service;
  const slots = useApi<{ slots: string[] }>(
    service && date ? `/providers/${service.providerId}/slots?serviceId=${service.id}&date=${date}` : null,
  );

  // Reset the picked time in the click that changes the day, not in an effect.
  function pickDay(day: string) {
    setDate(day);
    setPicked(null);
  }

  async function book() {
    if (!service || !picked) return;
    setBusy(true);
    setError(null);
    try {
      await api("/bookings", { method: "POST", body: { serviceId: service.id, startAt: picked, address } });
      notify("Booked! Pay within 15 minutes to confirm it");
      navigate("/bookings");
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && err.status === 409) {
        setPicked(null); // someone else just took it: show fresh times
        slots.reload();
      }
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <ErrorText>{loadError}</ErrorText>;
  if (!service) return <p className="muted">Loading…</p>;

  return (
    <div className="stack">
      <Link to="/">← All services</Link>
      <div className="card">
        <div className="row between">
          <span className="badge badge-teal">{service.categoryName}</span>
          <Stars value={service.ratingAvg} count={service.ratingCount} />
        </div>
        <h1>{service.title}</h1>
        <p>{service.description}</p>
        <p className="muted">
          by {service.providerName} · {service.area} · {service.durationMin} min · <strong>{formatTaka(service.price)}</strong>
        </p>
      </div>

      <div className="card stack">
        <h2>Pick a date</h2>
        <div className="row wrap">
          {days.map((d) => (
            <button key={d} className={`chip ${d === date ? "chip-on" : ""}`} onClick={() => pickDay(d)}>
              {dayLabel(d)}
            </button>
          ))}
        </div>

        {date && (
          <>
            <h2>Pick a time</h2>
            <ErrorText>{slots.error}</ErrorText>
            {slots.loading && <p className="muted">Loading free times…</p>}
            {slots.data?.slots.length === 0 && <p className="muted">No free times on this day. Try another date.</p>}
            <div className="row wrap">
              {slots.data?.slots.map((s) => (
                <button key={s} className={`chip ${s === picked ? "chip-on" : ""}`} onClick={() => setPicked(s)}>
                  {formatTime(s)}
                </button>
              ))}
            </div>
          </>
        )}

        {!user && (
          <p className="alert">
            <Link to="/login" state={{ from: `/services/${service.id}` }}>
              Log in
            </Link>{" "}
            as a customer to book.
          </p>
        )}
        {user && user.role !== "CUSTOMER" && <p className="alert">Only customers can book services.</p>}
        {user?.role === "CUSTOMER" && picked && (
          <div className="stack">
            <Field label="Your address">
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="House, road, area" />
            </Field>
            <ErrorText>{error}</ErrorText>
            <button className="btn btn-primary" disabled={busy || address.trim().length < 5} onClick={() => void book()}>
              {busy ? "Booking…" : `Book ${formatDateTime(picked)} · ${formatTaka(service.price)}`}
            </button>
            <p className="muted">The time is held for you for 15 minutes while you pay.</p>
          </div>
        )}
      </div>

      <ReviewList providerId={service.providerId} />
    </div>
  );
}

function ReviewList({ providerId }: { providerId: string }) {
  const [page, setPage] = useState(1);
  const { data } = useApi<Page<{ reviews: Review[] }>>(`/providers/${providerId}/reviews?page=${page}`);
  if (!data || data.total === 0) return null;

  return (
    <div className="card stack">
      <h2>Reviews ({data.total})</h2>
      {data.reviews.map((r) => (
        <div key={r.id} className="review">
          <strong>{"★".repeat(r.rating)}</strong> <span className="muted">{r.customerName}</span>
          {r.comment && <p>{r.comment}</p>}
        </div>
      ))}
      {data.totalPages > 1 && (
        <div className="row">
          <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ←
          </button>
          <button className="btn btn-ghost" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>
            →
          </button>
        </div>
      )}
    </div>
  );
}
