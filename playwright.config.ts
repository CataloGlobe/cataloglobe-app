import { defineConfig, devices } from "@playwright/test";
import { E2E_STORAGE_STATE } from "./e2e/env";

/**
 * E2E (lotto 1b). Server Vite su 5174 avviato da Playwright (riusato se già
 * in ascolto). Login una volta sola in `global-setup.ts`, sessione salvata in
 * storageState e riusata da ogni test.
 *
 * `vercel dev` (3001) NON è avviato: nessuna pagina coperta oggi chiama `/api`.
 * Aggiungere un secondo `webServer` solo quando un test lo richiede.
 */
export default defineConfig({
    testDir: "./e2e",
    globalSetup: "./e2e/global-setup.ts",
    fullyParallel: true,
    // Due, non il default (metà dei core): ogni test avvia l'app contro il
    // Supabase vero (sessione, azienda, permessi) e con quattro processi il
    // bootstrap sforava i 15 s degli e2e di Programmazione (24/09/2026).
    workers: 2,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? "github" : "list",
    outputDir: "./test-results",
    use: {
        baseURL: "http://localhost:5174",
        storageState: E2E_STORAGE_STATE,
        locale: "it-IT",
        viewport: { width: 1280, height: 800 },
        trace: "retain-on-failure",
        screenshot: "only-on-failure"
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    webServer: {
        command: "npm run dev -- --port 5174 --strictPort",
        url: "http://localhost:5174",
        reuseExistingServer: !process.env.CI,
        timeout: 60_000
    }
});
