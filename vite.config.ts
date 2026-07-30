import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basePaintActivityHandler from "./api/basepaint-activity";
import basePaintArtistHandler from "./api/basepaint-artist";
import basePaintCanvasHandler from "./api/basepaint-canvas";
import basePaintHandler from "./api/basepaint";
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

          if (pathname === "/api/basepaint") {
            void basePaintHandler(request, response);
            return;
          }

          if (pathname === "/api/basepaint-activity") {
            void basePaintActivityHandler(request, response);
            return;
          }

          if (pathname === "/api/basepaint-artist") {
            void basePaintArtistHandler(request, response);
            return;
          }

          if (pathname === "/api/basepaint-canvas") {
            void basePaintCanvasHandler(request, response);
            return;
          }

          next();
        });
      }
    }
  ]
});
