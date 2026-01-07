import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
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
            "@types": path.resolve(__dirname, "./src/types")
        }
    }
});
