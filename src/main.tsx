import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Redirect any visitor still landing on the legacy Lovable host to the
// production custom domain. Done before React mounts so we don't even
// flash the login page on the wrong origin.
if (
  typeof window !== "undefined" &&
  window.location.hostname === "lafinaceiro.lovable.app"
) {
  const target =
    "https://lafinanceiro.ia.br" +
    window.location.pathname +
    window.location.search +
    window.location.hash;
  window.location.replace(target);
} else {
  createRoot(document.getElementById("root")!).render(<App />);
}
