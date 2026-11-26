import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.svg",
        "brand/favicon-32.png",
        "brand/favicon-48.png",
        "brand/apple-touch-icon.png",
        "brand/pwa-192.png",
        "brand/pwa-512.png",
      ],
      manifest: {
        name: "Feylore",
        short_name: "Feylore",
        description: "Personal library and media",
        theme_color: "#141318",
        background_color: "#141318",
        display: "standalone",
        icons: [
          {
            src: "favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
          },
          {
            src: "brand/pwa-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "brand/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^\/api\/v1\/(?!files\/).*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "feylore-api-cache",
              networkTimeoutSeconds: 10,
            },
          },
        ],
      },
    }),
  ],
  root: "src/web",
  publicDir: "public",
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "src/shared"),
      "@web": path.resolve(import.meta.dirname, "src/web"),
    },
  },
  optimizeDeps: {
    // Per-icon subpath imports are already ESM; pre-bundling hundreds of
    // entry points triggers Vite dep-optimizer bugs (exportsData undefined).
    exclude: ["@solar-icons/react"],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
