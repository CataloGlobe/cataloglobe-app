import { expect, test, type Page } from "@playwright/test";

/**
 * «Buttato fuori» con la sessione ancora valida (diagnosi del 2026-10-09):
 * avvio con token scaduto e rete che non risponde per qualche secondo (dopo
 * lo stop del Mac, un cambio di rete, il riavvio del server di sviluppo):
 * l'app finiva su /login e ignorava il rinnovo riuscito subito dopo.
 * Tutto finto: sessione salvata, `/auth/v1/*`, la verifica OTP.
 */

const STORAGE_KEY = "sb-lxeawrpjfphgdspueiag-auth-token";
const USER = {
    id: "00000000-0000-4000-8000-0000000000e5",
    aud: "authenticated",
    role: "authenticated",
    email: "e2e-sessione@example.invalid",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z"
};

function base64url(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function session(expiresAt: number) {
    const accessToken = [
        base64url({ alg: "HS256", typ: "JWT" }),
        base64url({ sub: USER.id, aud: "authenticated", role: "authenticated", exp: expiresAt, iat: expiresAt - 3600 }),
        "e2e"
    ].join(".");
    return { access_token: accessToken, token_type: "bearer", expires_in: 3600, expires_at: expiresAt, refresh_token: "e2e-refresh", user: USER };
}

async function setup(page: Page, stored: ReturnType<typeof session>): Promise<void> {
    await page.addInitScript(
        ([key, value]) => {
            localStorage.setItem(key, value);
            localStorage.setItem("authRememberMe", "true");
        },
        [STORAGE_KEY, JSON.stringify(stored)] as const
    );
    await page.route(/\/auth\/v1\/user/, route => route.fulfill({ status: 200, json: USER }));
    // Verifica OTP valida: l'utente non deve passare da /verify-otp.
    await page.route(/\/rest\/v1\/otp_user_verifications/, route => route.fulfill({ status: 200, json: [{ user_id: USER.id }] }));
    await page.route(/\/rest\/v1\/(?!otp_user_verifications)/, route => route.fulfill({ status: 200, json: [] }));
    await page.route(/\/functions\/v1\//, route => route.fulfill({ status: 200, json: {} }));
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("La sessione valida non butta fuori", () => {
    test("C1: token scaduto e rete giù per qualche secondo, poi il rinnovo riesce", async ({ page }) => {
        // Il rinnovo automatico di auth-js riprova ogni 30 s: serve più del timeout di default.
        test.setTimeout(90_000);
        const now = Math.floor(Date.now() / 1000);
        await setup(page, session(now - 60));
        const networkBackAt = Date.now() + 16_000;
        await page.route(/\/auth\/v1\/token/, route =>
            Date.now() < networkBackAt ? route.abort("internetdisconnected") : route.fulfill({ status: 200, json: session(now + 3600) })
        );

        await page.goto("/workspace");
        await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
        // Tornata la rete, il rinnovo riesce e l'app riprende l'utente da sola.
        await expect(page).not.toHaveURL(/\/login/, { timeout: 50_000 });
    });

    test("utente cancellato o token revocato: il server dice «nessuna sessione» e si esce", async ({ page }) => {
        const now = Math.floor(Date.now() / 1000);
        await setup(page, session(now + 3600));
        // Registrata dopo setup: vince sulla risposta 200 di /auth/v1/user.
        await page.route(/\/auth\/v1\/user/, route =>
            route.fulfill({ status: 403, json: { code: 403, error_code: "user_not_found", msg: "User from sub claim in JWT does not exist" } })
        );

        await page.goto("/workspace");
        await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
    });
});
