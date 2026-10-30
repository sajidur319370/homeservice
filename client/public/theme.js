// Runs in <head> BEFORE React, so the page never flashes the wrong theme.
// A separate file, not an inline <script>: the server's CSP (default-src 'self') blocks inline scripts.
// Saved choice wins; otherwise follow the operating system.
try {
  const saved = localStorage.getItem("theme");
  const dark = saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = dark ? "dark" : "light";
} catch {
  document.documentElement.dataset.theme = "light"; // storage blocked (private mode): just use light
}
