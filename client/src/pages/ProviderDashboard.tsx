import { useState, type FormEvent } from "react";
import { api, errorMessage, useApi } from "../api";
import { useConfirm } from "../components/ConfirmToast";
import HoursEditor from "../components/HoursEditor";
import { useNotify } from "../components/Notify";
import { ErrorText, Field } from "../components/small";
import { AREAS } from "../constants";
import { minLength, only, required, useFieldErrors } from "../fieldErrors";
import { formatTaka } from "../format";
import type { Category, MyService, ProviderMe } from "../types";

const EMPTY = { title: "", description: "", categoryId: "", price: "500", durationMin: "60", area: AREAS[0] ?? "" };

export default function ProviderDashboard() {
  const me = useApi<{ profile: ProviderMe }>("/providers/me");
  const mine = useApi<{ services: MyService[] }>("/services/mine");
  const categories = useApi<{ categories: Category[] }>("/categories");
  const confirm = useConfirm();
  const notify = useNotify();

  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const fields = useFieldErrors<keyof typeof EMPTY>();

  const set = (key: keyof typeof EMPTY, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    fields.clear(key);
  };

  function validate() {
    const price = Number(form.price);
    return only({
      title: form.title.trim() ? minLength(form.title, 3, "Title must be at least 3 characters") : "Title is required",
      description: form.description.trim()
        ? minLength(form.description, 10, "Description must be at least 10 characters")
        : "Description is required",
      categoryId: required(form.categoryId, "Choose a category"),
      price: !form.price.trim()
        ? "Price is required"
        : !Number.isInteger(price) || price < 50 || price > 100_000
          ? "Price must be a whole number from ৳50 to ৳1,00,000"
          : undefined,
      durationMin: undefined,
      area: required(form.area, "Choose an area"),
    });
  }

  async function addService(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fields.check(validate())) return;
    try {
      await api("/services", {
        method: "POST",
        body: { ...form, price: Number(form.price), durationMin: Number(form.durationMin) },
      });
      setForm(EMPTY);
      notify("Service added");
      mine.reload();
    } catch (err) {
      setError(fields.fromServer(err));
    }
  }

  async function remove(id: string) {
    const ok = await confirm({ message: "Remove this service? Customers won't see it any more.", yes: "Yes, remove", no: "Keep it" });
    if (!ok) return;
    setError(null);
    try {
      await api(`/services/${id}`, { method: "DELETE" });
      notify("Service removed");
      mine.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const profile = me.data?.profile;

  return (
    <div className="stack">
      <h1>Provider dashboard</h1>
      {profile && !profile.approved && (
        <p className="alert">⏳ Your account is waiting for admin approval. Customers can't see your services yet.</p>
      )}

      {/* key: re-create the editor once the saved hours arrive */}
      {profile && <HoursEditor key={profile.id} initial={profile.availability} />}

      <div className="card stack">
        <h2>My services</h2>
        {mine.data?.services.length === 0 && <p className="muted">No services yet. Add one below.</p>}
        {mine.data?.services.map((s) => (
          <div key={s.id} className="row between service-row">
            <div>
              <strong>{s.title}</strong>
              <div className="muted">
                {s.categoryName} · {s.durationMin} min · {formatTaka(s.price)} · {s.area}
              </div>
            </div>
            <button
              className="btn btn-ghost"
              disabled={s.openBookings > 0}
              title={s.openBookings > 0 ? "Has an open booking" : undefined}
              onClick={() => void remove(s.id)}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <form className="card stack" onSubmit={addService} noValidate>
        <h2>Add a service</h2>
        <Field label="Title" error={fields.errors.title}>
          <input value={form.title} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <Field label="Description" error={fields.errors.description}>
          <textarea value={form.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <div className="row wrap">
          <Field label="Category" error={fields.errors.categoryId}>
            <select value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
              <option value="">Choose…</option>
              {categories.data?.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Price (৳)" error={fields.errors.price}>
            <input type="number" min={50} step={50} value={form.price} onChange={(e) => set("price", e.target.value)} />
          </Field>
          <Field label="Duration" error={fields.errors.durationMin}>
            <select value={form.durationMin} onChange={(e) => set("durationMin", e.target.value)}>
              {[30, 60, 90, 120, 180, 240].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </Field>
          <Field label="Area" error={fields.errors.area}>
            <select value={form.area} onChange={(e) => set("area", e.target.value)}>
              {AREAS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </Field>
        </div>
        <ErrorText>{error}</ErrorText>
        <button className="btn btn-primary">Add service</button>
      </form>
    </div>
  );
}
