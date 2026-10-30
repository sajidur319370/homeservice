import { useState, type FormEvent } from "react";
import { api, errorMessage, useApi } from "../api";
import { useConfirm } from "../components/ConfirmToast";
import { useNotify } from "../components/Notify";
import { ErrorText, FieldError } from "../components/small";
import { formatTaka } from "../format";
import type { AdminCategory, AdminProvider, AdminStats } from "../types";

export default function AdminDashboard() {
  const stats = useApi<AdminStats>("/admin/stats");
  const waiting = useApi<{ providers: AdminProvider[] }>("/admin/providers?approved=false");
  const approved = useApi<{ providers: AdminProvider[] }>("/admin/providers?approved=true");
  const categories = useApi<{ categories: AdminCategory[] }>("/admin/categories");
  const [newCategory, setNewCategory] = useState("");
  const [categoryError, setCategoryError] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const notify = useNotify();
  const confirm = useConfirm();

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

  async function setApproved(p: AdminProvider, value: boolean) {
    const ok = await confirm(
      value
        ? { message: `Approve ${p.name}? Customers will see their services.`, yes: "Yes, approve", no: "Not now", tone: "ok" }
        : { message: `Suspend ${p.name}? Their services will be hidden from customers.`, yes: "Yes, suspend", no: "Keep active" },
    );
    if (!ok) return;
    await run(
      value ? `${p.name} approved` : `${p.name} suspended`,
      () => api(`/admin/providers/${p.id}/approve`, { method: "PATCH", body: { approved: value } }),
      waiting,
      approved,
      stats,
    );
  }

  async function removeCategory(c: AdminCategory) {
    // In use: say so straight away (same words as the server's 409), no "Are you sure?" first.
    if (c.serviceCount > 0) {
      notify(`Can't remove: ${c.serviceCount} service(s) use this category`, "error");
      return;
    }
    const ok = await confirm({ message: `Remove the category "${c.name}"?`, yes: "Yes, remove", no: "Keep it" });
    if (!ok) return;
    await run(`Category "${c.name}" removed`, () => api(`/categories/${c.id}`, { method: "DELETE" }), categories);
  }

  function addCategory(e: FormEvent) {
    e.preventDefault();
    const name = newCategory.trim();
    const problem = !name ? "Category name is required" : name.length < 2 ? "Name must be at least 2 characters" : undefined;
    setCategoryError(problem);
    if (problem) return;
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

      <ProviderList title="Providers waiting for approval" list={waiting.data?.providers} action="Approve" onAction={(p) => void setApproved(p, true)} />
      <ProviderList title="Approved providers" list={approved.data?.providers} action="Suspend" onAction={(p) => void setApproved(p, false)} />

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
            <button className="btn btn-ghost" onClick={() => void removeCategory(c)}>
              Remove
            </button>
          </div>
        ))}
        <form className="row" onSubmit={addCategory} noValidate>
          <input
            className="grow"
            placeholder="New category, e.g. Painter"
            aria-invalid={Boolean(categoryError)}
            value={newCategory}
            onChange={(e) => {
              setNewCategory(e.target.value);
              setCategoryError(undefined);
            }}
          />
          <button className="btn btn-primary">Add</button>
        </form>
        <FieldError>{categoryError}</FieldError>
      </div>
    </div>
  );
}

type ListProps = { title: string; list?: AdminProvider[]; action: string; onAction: (p: AdminProvider) => void };

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
          <button className="btn btn-ghost" onClick={() => onAction(p)}>
            {action}
          </button>
        </div>
      ))}
    </div>
  );
}
