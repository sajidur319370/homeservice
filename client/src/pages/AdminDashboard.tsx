import { useState, type FormEvent } from "react";
import { api, errorMessage, useApi } from "../api";
import { useNotify } from "../components/Notify";
import { ErrorText } from "../components/small";
import { formatTaka } from "../format";
import type { AdminProvider, AdminStats, Category } from "../types";

export default function AdminDashboard() {
  const stats = useApi<AdminStats>("/admin/stats");
  const waiting = useApi<{ providers: AdminProvider[] }>("/admin/providers?approved=false");
  const approved = useApi<{ providers: AdminProvider[] }>("/admin/providers?approved=true");
  const categories = useApi<{ categories: Category[] }>("/categories");
  const [newCategory, setNewCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const notify = useNotify();

  async function run(done: string, request: () => Promise<unknown>, ...toReload: { reload: () => void }[]) {
    setError(null);
    try {
      await request();
      notify(done);
      toReload.forEach((r) => r.reload());
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const setApproved = (id: string, value: boolean) =>
    run(value ? "Provider approved" : "Provider suspended", () => api(`/admin/providers/${id}/approve`, { method: "PATCH", body: { approved: value } }), waiting, approved, stats);

  function addCategory(e: FormEvent) {
    e.preventDefault();
    void run("Category added", () => api("/categories", { method: "POST", body: { name: newCategory } }), categories).then(() => setNewCategory(""));
  }

  const s = stats.data;
  const tiles: [string, string | number][] = s
    ? [
        ["Customers", s.usersByRole.CUSTOMER ?? 0],
        ["Providers", s.usersByRole.PROVIDER ?? 0],
        ["Waiting approval", s.pendingProviders],
        ["Confirmed", s.bookingsByStatus.CONFIRMED ?? 0],
        ["Completed", s.bookingsByStatus.COMPLETED ?? 0],
        ["Revenue", formatTaka(s.revenue)],
      ]
    : [];

  return (
    <div className="stack">
      <h1>Admin</h1>
      <ErrorText>{error ?? stats.error}</ErrorText>

      <div className="tiles">
        {tiles.map(([label, value]) => (
          <div key={label} className="card tile">
            <span className="muted">{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      <ProviderList title="Providers waiting for approval" list={waiting.data?.providers} action="Approve" onAction={(id) => void setApproved(id, true)} />
      <ProviderList title="Approved providers" list={approved.data?.providers} action="Suspend" onAction={(id) => void setApproved(id, false)} />

      <div className="card stack">
        <h2>Refunds to process</h2>
        {s?.refunds.length === 0 && <p className="muted">None 🎉</p>}
        {s?.refunds.map((r) => (
          <div key={r.id} className="row between">
            <span>
              {r.customerName} ({r.customerEmail}) · {r.tranId}
            </span>
            <strong>{formatTaka(r.amount)}</strong>
          </div>
        ))}
      </div>

      <div className="card stack">
        <h2>Categories</h2>
        {categories.data?.categories.map((c) => (
          <div key={c.id} className="row between">
            <span>{c.name}</span>
            <button className="btn btn-ghost" onClick={() => void run("Category removed", () => api(`/categories/${c.id}`, { method: "DELETE" }), categories)}>
              Remove
            </button>
          </div>
        ))}
        <form className="row" onSubmit={addCategory}>
          <input className="grow" placeholder="New category, e.g. Painter" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
          <button className="btn btn-primary" disabled={newCategory.trim().length < 2}>
            Add
          </button>
        </form>
      </div>
    </div>
  );
}

type ListProps = { title: string; list?: AdminProvider[]; action: string; onAction: (id: string) => void };

function ProviderList({ title, list, action, onAction }: ListProps) {
  return (
    <div className="card stack">
      <h2>{title}</h2>
      {list?.length === 0 && <p className="muted">None</p>}
      {list?.map((p) => (
        <div key={p.id} className="row between">
          <span>
            <strong>{p.name}</strong> <span className="muted">{p.email} · {p.area} · {p.serviceCount} services</span>
          </span>
          <button className="btn btn-ghost" onClick={() => onAction(p.id)}>
            {action}
          </button>
        </div>
      ))}
    </div>
  );
}
