import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import scanHandler from "./api/scan";

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
            void scanHandler(request, response);
            return;
          }

          next();
        });
      }
    }
  ]
});
