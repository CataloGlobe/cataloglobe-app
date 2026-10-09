import { expect, test } from "@playwright/test";

/**
 * `/verify-otp` partita prima che il client sappia che l'utente è già
 * verificato: `send-otp` risponde `already_verified` senza mandare il codice
 * e la pagina fa entrare. Tutto finto: sessione, `/auth/v1/*`, edge, verifica.
 */

const STORAGE_KEY = "sb-lxeawrpjfphgdspueiag-auth-token";
const USER = {
    id: "00000000-0000-4000-8000-0000000000e6",
    aud: "authenticated",
    role: "authenticated",
    email: "e2e-verificato@example.invalid",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z"
};

function base64url(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
}

test.use({ storageState: { cookies: [], origins: [] } });

test("utente già verificato: nessun codice, si entra", async ({ page }) => {
    const now = Math.floor(Date.now() / 1000);
    const accessToken = [
        base64url({ alg: "HS256", typ: "JWT" }),
        base64url({ sub: USER.id, aud: "authenticated", role: "authenticated", exp: now + 3600, iat: now }),
        "e2e"
    ].join(".");
    const session = { access_token: accessToken, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "e2e-refresh", user: USER };
    await page.addInitScript(
        ([key, value]) => {
            localStorage.setItem(key, value);
            localStorage.setItem("authRememberMe", "true");
        },
        [STORAGE_KEY, JSON.stringify(session)] as const
    );

    // Il client all'avvio non vede ancora la verifica; il server sì.
    let verifiedOnServer = false;
    await page.route(/\/auth\/v1\/user/, route => route.fulfill({ status: 200, json: USER }));
    await page.route(/\/rest\/v1\/otp_user_verifications/, route =>
        route.fulfill({ status: 200, json: verifiedOnServer ? [{ user_id: USER.id }] : [] })
    );
    await page.route(/\/rest\/v1\/(?!otp_user_verifications)/, route => route.fulfill({ status: 200, json: [] }));
    await page.route(/\/functions\/v1\/status-otp/, route =>
        route.fulfill({ status: 200, json: { resend_available_in: 0, attempts_left: null, max_attempts: null, expires_in: null, locked: false } })
    );
    await page.route(/\/functions\/v1\/send-otp/, route => {
        verifiedOnServer = true;
        return route.fulfill({ status: 200, json: { ok: true, already_verified: true } });
    });
    await page.route(/\/functions\/v1\/(?!status-otp|send-otp)/, route => route.fulfill({ status: 200, json: {} }));

    await page.goto("/verify-otp");
    await expect(page).not.toHaveURL(/\/verify-otp/, { timeout: 15_000 });
    await expect(page.getByText("Codice inviato.")).toHaveCount(0);
});
