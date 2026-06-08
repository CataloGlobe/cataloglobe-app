import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            "/api": {
                target: "http://localhost:3001",
                changeOrigin: true,
            },
        },
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes("/node_modules/react-dom/") || id.includes("/node_modules/scheduler/")) return "vendor-react";
                    if (id.includes("/node_modules/react/") || id.includes("/node_modules/react-router")) return "vendor-react";
                    if (id.includes("/node_modules/@supabase/supabase-js/")) return "vendor-supabase";
                    if (id.includes("/node_modules/framer-motion/")) return "vendor-motion";
                },
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
});
