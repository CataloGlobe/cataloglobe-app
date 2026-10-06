import { defineConfig, devices } from "@playwright/test";

/**
 * E2E della landing prerenderizzata: girano sulla build (`npm run build`),
 * non sul dev server, perché in dev `/` è renderizzata dal client e l'HTML
 * prerenderizzato non esiste. `vite preview` serve `dist/index.html` su `/`.
 * Niente login né Supabase: `submit-lead` è intercettato.
 *
 *   npm run build && npm run test:landing-build
 */
export default defineConfig({
    testDir: "./e2e/landing-build",
    fullyParallel: true,
    workers: 2,
    forbidOnly: !!process.env.CI,
    reporter: process.env.CI ? "github" : "list",
    outputDir: "./test-results/landing-build",
    use: {
        baseURL: "http://localhost:4176",
        locale: "it-IT",
        trace: "retain-on-failure"
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    webServer: {
        command: "npx vite preview --port 4176 --strictPort",
        url: "http://localhost:4176",
        reuseExistingServer: !process.env.CI,
        timeout: 30_000
    }
});
