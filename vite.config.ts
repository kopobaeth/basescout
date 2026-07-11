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
          if (request.url?.startsWith("/api/scan")) {
            void scanHandler(request, response);
            return;
          }

          next();
        });
      }
    }
  ]
});
