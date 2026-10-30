import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth, type RegisterInput } from "../auth";
import { useNotify } from "../components/Notify";
import { ErrorText, Field } from "../components/small";
import { AREAS, HOME_BY_ROLE } from "../constants";
import { minLength, only, useFieldErrors, validEmail } from "../fieldErrors";

export default function Register() {
  const { register } = useAuth();
  const notify = useNotify();
  const navigate = useNavigate();
  const [form, setForm] = useState<RegisterInput>({ name: "", email: "", password: "", phone: "", role: "CUSTOMER", area: AREAS[0] });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fields = useFieldErrors<keyof RegisterInput>();

  // One change handler for every input: update just that field and hide its red message.
  const set = <K extends keyof RegisterInput>(key: K, value: RegisterInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    fields.clear(key);
  };

  function validate() {
    return only({
      name: minLength(form.name, 2, form.name.trim() ? "Name must be at least 2 characters" : "Name is required"),
      email: validEmail(form.email),
      password: form.password ? minLength(form.password, 8, "Password must be at least 8 characters") : "Password is required",
      phone: (form.phone ?? "").trim().length > 20 ? "Phone number is too long" : undefined,
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fields.check(validate())) return;
    setBusy(true);
    try {
      const body: RegisterInput = { ...form, phone: form.phone || undefined };
      if (body.role === "CUSTOMER") delete body.area;
      const user = await register(body);
      notify(`Account created. Welcome, ${user.name.split(" ")[0]}`);
      navigate(HOME_BY_ROLE[user.role], { replace: true });
    } catch (err) {
      setError(fields.fromServer(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card narrow">
      <h1>Create an account</h1>
      <form onSubmit={onSubmit} className="stack" noValidate>
        <div className="row">
          {(["CUSTOMER", "PROVIDER"] as const).map((role) => (
            <label key={role} className="radio">
              <input type="radio" name="role" checked={form.role === role} onChange={() => set("role", role)} />
              {role === "CUSTOMER" ? "I need a service" : "I provide a service"}
            </label>
          ))}
        </div>
        <Field label="Full name" error={fields.errors.name}>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" />
        </Field>
        <Field label="Email" error={fields.errors.email}>
          <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" />
        </Field>
        <Field label="Password (8+ characters)" error={fields.errors.password}>
          <input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Phone (optional)" error={fields.errors.phone}>
          <input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        {form.role === "PROVIDER" && (
          <Field label="Your area" error={fields.errors.area}>
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
