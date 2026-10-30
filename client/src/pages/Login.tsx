import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useAuth } from "../auth";
import { useNotify } from "../components/Notify";
import { ErrorText, Field } from "../components/small";
import { HOME_BY_ROLE } from "../constants";
import { only, required, useFieldErrors, validEmail } from "../fieldErrors";

const DEMO = [
  { label: "Customer", email: "customer@homeservice.dev" },
  { label: "Provider", email: "rahim@homeservice.dev" },
  { label: "Admin", email: "admin@homeservice.dev" },
];

export default function Login() {
  const { login } = useAuth();
  const notify = useNotify();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from; // page that sent us here

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fields = useFieldErrors<"email" | "password">();

  async function submit(emailValue: string, passwordValue: string) {
    setBusy(true);
    setError(null);
    try {
      const user = await login(emailValue, passwordValue);
      notify(`Welcome back, ${user.name.split(" ")[0]}`);
      navigate(from ?? HOME_BY_ROLE[user.role], { replace: true });
    } catch (err) {
      setError(fields.fromServer(err));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const ok = fields.check(
      only({ email: validEmail(email), password: required(password, "Password is required") }),
    );
    if (ok) void submit(email, password);
  }

  return (
    <div className="card narrow">
      <h1>Log in</h1>
      <form onSubmit={onSubmit} className="stack" noValidate>
        <Field label="Email" error={fields.errors.email}>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              fields.clear("email");
            }}
            autoComplete="email"
          />
        </Field>
        <Field label="Password" error={fields.errors.password}>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              fields.clear("password");
            }}
            autoComplete="current-password"
          />
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
