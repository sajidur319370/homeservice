import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { errorMessage } from "../api";
import { useAuth, type RegisterInput } from "../auth";
import { ErrorText, Field } from "../components/small";
import { AREAS, HOME_BY_ROLE } from "../constants";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<RegisterInput>({ name: "", email: "", password: "", phone: "", role: "CUSTOMER", area: AREAS[0] });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // One change handler for every input: update just that field.
  const set = <K extends keyof RegisterInput>(key: K, value: RegisterInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: RegisterInput = { ...form, phone: form.phone || undefined };
      if (body.role === "CUSTOMER") delete body.area;
      const user = await register(body);
      navigate(HOME_BY_ROLE[user.role], { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card narrow">
      <h1>Create an account</h1>
      <form onSubmit={onSubmit} className="stack">
        <div className="row">
          {(["CUSTOMER", "PROVIDER"] as const).map((role) => (
            <label key={role} className="radio">
              <input type="radio" name="role" checked={form.role === role} onChange={() => set("role", role)} />
              {role === "CUSTOMER" ? "I need a service" : "I provide a service"}
            </label>
          ))}
        </div>
        <Field label="Full name">
          <input value={form.name} onChange={(e) => set("name", e.target.value)} required minLength={2} />
        </Field>
        <Field label="Email">
          <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
        </Field>
        <Field label="Password (8+ characters)">
          <input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} required minLength={8} />
        </Field>
        <Field label="Phone (optional)">
          <input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        {form.role === "PROVIDER" && (
          <Field label="Your area">
            <select value={form.area} onChange={(e) => set("area", e.target.value)}>
              {AREAS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </Field>
        )}
        <ErrorText>{error}</ErrorText>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>
      <p>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
