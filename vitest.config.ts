import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        include: ["src/tests/**/*.test.ts", "supabase/functions/_shared/**/*.test.ts"]
    },
    resolve: {
        alias: {
            // Stessi alias di vite.config.ts: senza, un test non può importare
            // un modulo che usa (anche indirettamente) @components, @utils, ...
            "@": path.resolve(__dirname, "./src"),
            "@context": path.resolve(__dirname, "./src/context"),
            "@components": path.resolve(__dirname, "./src/components"),
            "@pages": path.resolve(__dirname, "./src/pages"),
            "@layouts": path.resolve(__dirname, "./src/layouts"),
            "@services": path.resolve(__dirname, "./src/services"),
            "@styles": path.resolve(__dirname, "./src/styles"),
            "@utils": path.resolve(__dirname, "./src/utils"),
            "@types": path.resolve(__dirname, "./src/types"),
            "@assets": path.resolve(__dirname, "./src/assets"),
            "@shared": path.resolve(__dirname, "./supabase/functions/_shared")
        }
    }
});
