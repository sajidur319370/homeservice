import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { errorMessage } from "../api";
import { useAuth } from "../auth";
import { ErrorText, Field } from "../components/small";
import { HOME_BY_ROLE } from "../constants";

const DEMO = [
  { label: "Customer", email: "customer@homeservice.dev" },
  { label: "Provider", email: "rahim@homeservice.dev" },
  { label: "Admin", email: "admin@homeservice.dev" },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from; // page that sent us here

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(emailValue: string, passwordValue: string) {
    setBusy(true);
    setError(null);
    try {
      const user = await login(emailValue, passwordValue);
      navigate(from ?? HOME_BY_ROLE[user.role], { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submit(email, password);
  }

  return (
    <div className="card narrow">
      <h1>Log in</h1>
      <form onSubmit={onSubmit} className="stack">
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </Field>
        <Field label="Password">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </Field>
        <ErrorText>{error}</ErrorText>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>

      <p className="muted">Try a demo account (password123):</p>
      <div className="row">
        {DEMO.map((d) => (
          <button key={d.email} className="btn btn-ghost" disabled={busy} onClick={() => void submit(d.email, "password123")}>
            {d.label}
          </button>
        ))}
      </div>
      <p>
        New here? <Link to="/register">Create an account</Link>
      </p>
    </div>
  );
}
