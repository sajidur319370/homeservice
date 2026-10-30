import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { useApi } from "../api";
import ServiceCardView from "../components/ServiceCardView";
import { ErrorText } from "../components/small";
import { AREAS } from "../constants";
import type { Category, Page, ServiceCard } from "../types";

export default function Home() {
  // Filters live in the URL (/?q=fan&category=electrician): shareable links + Back button work.
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const page = Number(params.get("page") ?? 1);

  const categories = useApi<{ categories: Category[] }>("/categories");
  const results = useApi<Page<{ services: ServiceCard[] }>>(`/services?${params.toString()}`);

  // Change some filters; any filter change goes back to page 1.
  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [name, value] of Object.entries(changes)) {
      if (value) next.set(name, value);
      else next.delete(name);
    }
    if (!("page" in changes)) next.delete("page");
    setParams(next);
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    update({ q: q.trim() || null });
  }

  const active = params.get("category");

  return (
    <div className="stack">
      <section className="hero">
        <h1>Trusted home services in Dhaka</h1>
        <p className="muted">Electricians, plumbers, AC technicians and tutors. See real free times and book in a minute.</p>
        <form onSubmit={onSearch} className="row">
          <input className="grow" placeholder="Search: fan, AC, tap…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={params.get("area") ?? ""} onChange={(e) => update({ area: e.target.value || null })}>
            <option value="">All areas</option>
            {AREAS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          <button className="btn btn-primary">Search</button>
        </form>
      </section>

      <div className="row wrap">
        <button className={`chip ${!active ? "chip-on" : ""}`} onClick={() => update({ category: null })}>
          All
        </button>
        {categories.data?.categories.map((c) => (
          <button key={c.id} className={`chip ${active === c.slug ? "chip-on" : ""}`} onClick={() => update({ category: c.slug })}>
            {c.name}
          </button>
        ))}
      </div>

      <ErrorText>{results.error}</ErrorText>
      {results.loading && <p className="muted">Loading services…</p>}
      {results.data && results.data.services.length === 0 && <p className="muted">No services match. Try another search.</p>}

      <div className="grid">
        {results.data?.services.map((s) => (
          <ServiceCardView key={s.id} service={s} />
        ))}
      </div>

      {results.data && results.data.totalPages > 1 && (
        <div className="row center">
          <button className="btn btn-ghost" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>
            ← Previous
          </button>
          <span>
            Page {page} of {results.data.totalPages}
          </span>
          <button
            className="btn btn-ghost"
            disabled={page >= results.data.totalPages}
            onClick={() => update({ page: String(page + 1) })}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
