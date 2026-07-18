import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import scanHandler from "./api/scan";
import reportHandler from "./api/v1/report";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "basescout-api-dev",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
          if (pathname === "/api/scan") {
            void scanHandler(request, response);
            return;
          }

          if (pathname === "/api/v1/report") {
            void reportHandler(request, response);
            return;
          }

          next();
        });
      }
    }
  ]
});
