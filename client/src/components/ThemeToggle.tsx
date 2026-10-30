import { useState } from "react";

type Theme = "light" | "dark";

// public/theme.js already set <html data-theme> before React started; we read it and flip it.
const current = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(current);
  const next: Theme = theme === "dark" ? "light" : "dark";

  function toggle() {
    document.documentElement.dataset.theme = next; // the CSS variables switch instantly
    try {
      localStorage.setItem("theme", next); // remembered for the next visit
    } catch {
      // storage blocked (private mode): the switch still works for this visit
    }
    setTheme(next);
  }

  return (
    <button className="btn btn-ghost theme-toggle" onClick={toggle} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
