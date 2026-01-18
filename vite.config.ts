import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const buildDate = new Date();
  const buildVersion = `${buildDate.getFullYear()}.${String(buildDate.getMonth() + 1).padStart(2, '0')}.${String(buildDate.getDate()).padStart(2, '0')}`;
  const buildTime = `${String(buildDate.getHours()).padStart(2, '0')}${String(buildDate.getMinutes()).padStart(2, '0')}`;

  return {
    server: {
      host: "::",
      port: 8080,
    },
    define: {
      __APP_VERSION__: JSON.stringify(buildVersion),
      __BUILD_TIME__: JSON.stringify(buildTime),
      __BUILD_TIMESTAMP__: JSON.stringify(buildDate.toISOString()),
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
