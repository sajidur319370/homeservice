import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "../auth";
import type { Role } from "../types";

// Hides a page from the wrong people. Only for a nicer UI:
// the REAL protection is requireAuth/requireRole on the server.
export default function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="muted">Loading…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!roles.includes(user.role)) return <p className="alert alert-error">You don't have access to this page.</p>;
  return children;
}
