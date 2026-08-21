import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Config separada da vite.config.ts pra evitar carregar o VitePWA
// (que não é necessário em testes e adiciona ruído).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // As edge functions rodam em Deno, mas os helpers puros de `_shared`
    // (sem API do Deno) são testáveis aqui — e a checagem de `aal` do
    // add-member depende de um deles ser fail-closed.
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "supabase/functions/**/*.{test,spec}.ts",
    ],
  },
});
