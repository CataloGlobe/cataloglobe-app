import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vite.dev/config/
// SSR pubblico (stage 4a): tre build distinte, lo script `build` SPA resta
// IDENTICO (stessa config di sempre quando mode/isSsrBuild non sono quelli SSR):
//   - `vite build`                                        → SPA, dist/ (invariato)
//   - `vite build --ssr src/entry-server.tsx --outDir dist/server`
//                                                         → bundle server (isSsrBuild)
//   - `vite build --mode public-client`                   → bundle hydration client,
//                                                           dist/public + manifest
export default defineConfig(({ mode, isSsrBuild }) => ({
    plugins: [react()],
    // Asset client SSR serviti da dist/public → URL pubblici /public/assets/*.
    ...(mode === "public-client" ? { base: "/public/" } : {}),
    server: {
        proxy: {
            "/api": {
                target: "http://localhost:3001",
                changeOrigin: true,
            },
        },
    },
    build: {
        ...(mode === "public-client"
            ? {
                  outDir: "dist/public",
                  manifest: true,
              }
            : {}),
        rollupOptions: {
            ...(mode === "public-client"
                ? { input: path.resolve(__dirname, "./src/entry-client.tsx") }
                : {}),
            output: {
                // manualChunks solo sui build client: sul bundle server SSR lo
                // split vendor non serve (singolo modulo importato dalla function)
                ...(isSsrBuild
                    ? {}
                    : {
                          manualChunks(id: string) {
                              if (id.includes("/node_modules/react-dom/") || id.includes("/node_modules/scheduler/")) return "vendor-react";
                              if (id.includes("/node_modules/react/") || id.includes("/node_modules/react-router")) return "vendor-react";
                              if (id.includes("/node_modules/@supabase/supabase-js/")) return "vendor-supabase";
                              if (id.includes("/node_modules/framer-motion/")) return "vendor-motion";
                          },
                      }),
            },
        },
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
            "@context": path.resolve(__dirname, "./src/context"),
            "@components": path.resolve(__dirname, "./src/components"),
            "@pages": path.resolve(__dirname, "./src/pages"),
            "@layouts": path.resolve(__dirname, "./src/layouts"),
            "@services": path.resolve(__dirname, "./src/services"),
            "@styles": path.resolve(__dirname, "./src/styles"),
            "@utils": path.resolve(__dirname, "./src/utils"),
            "@types": path.resolve(__dirname, "./src/types"),
            "@assets": path.resolve(__dirname, "./src/assets")
        }
    }
}));
