import { chromium, type FullConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { E2E_STORAGE_STATE, loadE2eEnv } from "./env";

/**
 * Login una volta sola con email + password e salvataggio della sessione
 * Supabase (localStorage, "Ricordami" attivo) in `e2e/.auth/user.json`.
 *
 * Vincolo noto: dopo il login l'app impone la verifica OTP via email
 * (`ProtectedRoute` → `/verify-otp`), superabile solo a mano. La verifica vale
 * 30 giorni per utente (`otp_user_verifications.expires_at`): l'utente E2E va
 * verificato manualmente una volta, poi il setup passa senza OTP finché la
 * riga non scade. Se scade, il setup fallisce con messaggio esplicito.
 */
export default async function globalSetup(config: FullConfig) {
    const { email, password } = loadE2eEnv();
    const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:5174";

    const browser = await chromium.launch();
    const page = await browser.newPage({ baseURL, locale: "it-IT" });
    try {
        await page.goto("/login");
        // Nome accessibile (l'asterisco `required` è aria-hidden): `getByLabel`
        // esatto confronterebbe il testo "Password *" e non troverebbe nulla.
        await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
        await page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
        await page.getByRole("button", { name: "Accedi" }).click();

        // Login ok → /verify-otp (OtpRoute) → se già verificato, redirect /workspace.
        await page.waitForURL(/\/(verify-otp|workspace|business\/)/, { timeout: 30_000 });
        await page.waitForLoadState("networkidle");

        if (/\/verify-otp/.test(page.url())) {
            // Attesa breve: OtpRoute rimanda a /workspace se la verifica è valida.
            const left = await page
                .waitForURL(/\/(workspace|business\/)/, { timeout: 15_000 })
                .then(() => true)
                .catch(() => false);
            if (!left) {
                throw new Error(
                    `L'utente ${email} è fermo su /verify-otp: verifica OTP assente o scaduta ` +
                        "(vale 30 giorni). Fai il login a mano una volta e riesegui."
                );
            }
        }

        const banner = page.getByText("Credenziali non valide");
        if (await banner.isVisible().catch(() => false)) {
            throw new Error("Login E2E rifiutato: credenziali non valide.");
        }

        mkdirSync(path.dirname(E2E_STORAGE_STATE), { recursive: true });
        await page.context().storageState({ path: E2E_STORAGE_STATE });
    } finally {
        await browser.close();
    }
}
