import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter"; // self-hosted font: bundled by Vite, so the strict CSP still works
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
