import { expect, test, type Page } from "@playwright/test";

/**
 * Avvio dell'app e sessione (`AuthProvider.init`). Tre casi:
 * - nessuna sessione salvata → `/login`;
 * - il server rifiuta la sessione (403) → `/login`;
 * - il server non risponde (504) → la sessione salvata resta, e il check OTP
 *   dice «Impossibile verificare la tua sessione» invece di mandare a `/login`.
 *
 * Tutto finto: la sessione salvata (non scaduta) e `/auth/v1/user`. Lo stato
 * del server di auth non si sceglie, e questi casi non devono dipendere da lui.
 */

const PROTECTED = "/workspace";
const STORAGE_KEY = "sb-lxeawrpjfphgdspueiag-auth-token";

function base64url(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/** Sessione salvata come la scrive supabase-js, valida per un'ora. */
async function storedSession(page: Page): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const user = {
        id: "00000000-0000-4000-8000-0000000000e2",
        aud: "authenticated",
        role: "authenticated",
        email: "e2e-bootstrap@example.invalid",
        app_metadata: { provider: "email" },
        user_metadata: {},
        created_at: "2026-01-01T00:00:00Z"
    };
    const accessToken = [
        base64url({ alg: "HS256", typ: "JWT" }),
        base64url({ sub: user.id, aud: "authenticated", role: "authenticated", exp: now + 3600, iat: now }),
        "e2e"
    ].join(".");
    const session = {
        access_token: accessToken,
        token_type: "bearer",
        expires_in: 3600,
        expires_at: now + 3600,
        refresh_token: "e2e-refresh",
        user
    };
    await page.addInitScript(
        ([key, value]) => {
            localStorage.setItem(key, value);
            localStorage.setItem("authRememberMe", "true");
        },
        [STORAGE_KEY, JSON.stringify(session)] as const
    );
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Avvio e sessione", () => {
    test("nessuna sessione salvata: si va al login", async ({ page }) => {
        await page.goto(PROTECTED);
        await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 });
        await expect(page.getByRole("button", { name: "Accedi" })).toBeVisible();
    });

    test("sessione rifiutata dal server (403): si va al login", async ({ page }) => {
        await storedSession(page);
        await page.route(/\/auth\/v1\/user/, route =>
            route.fulfill({
                status: 403,
                json: { code: 403, error_code: "session_not_found", msg: "Session from session_id claim in JWT does not exist" }
            })
        );
        await page.goto(PROTECTED);
        await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 });
    });

    test("server di auth che non risponde (504): la sessione resta, l'OTP dice che non sa", async ({ page }) => {
        await storedSession(page);
        await page.route(/\/auth\/v1\/user/, route => route.fulfill({ status: 504, json: { message: "upstream timeout" } }));
        await page.goto(PROTECTED);
        await expect(page.getByText("Impossibile verificare la tua sessione.", { exact: false })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole("button", { name: "Riprova" })).toBeVisible();
        await expect(page).not.toHaveURL(/\/login/);
    });
});
