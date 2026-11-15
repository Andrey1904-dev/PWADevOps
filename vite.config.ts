import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"] },
  base: repo && !repo.endsWith(".github.io") ? `/${repo}/` : "/",
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: "supabase", test: /node_modules\/@supabase\// }],
        },
      },
    },
  },
  plugins: [
    {
      name: "release-marker",
      transformIndexHtml(html) {
        return html.replace(
          "</head>",
          `<meta name="devops-build" content="${process.env.GITHUB_SHA || "local"}"/></head>`,
        );
      },
    },
    react(),
    tailwind(),
    VitePWA({
      registerType: "prompt",
      manifest: {
        name: "DEVOPS QUEST",
        short_name: "DEVOPS QUEST",
        lang: "ru",
        display: "standalone",
        background_color: "#0b1016",
        theme_color: "#0b1016",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg}"],
        navigateFallback: "index.html",
        runtimeCaching: [],
      },
    }),
  ],
});
