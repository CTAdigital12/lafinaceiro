import { createRoot } from "react-dom/client";
import "./index.css";
import { mostrarFalhaDeBoot } from "@/lib/bootFallback";

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
  import("./App.tsx")
    .then(({ default: App }) => {
      createRoot(document.getElementById("root")!).render(<App />);
    })
    // O App entra por import DINÂMICO: é o que permite este `.catch`. Com
    // import estático o erro acontece antes desta linha existir.
    .catch((erro) => mostrarFalhaDeBoot(erro, document.getElementById("root")));
}
