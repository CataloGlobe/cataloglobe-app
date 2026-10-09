import { expect, test, type Page } from "@playwright/test";

/**
 * Pagina `/verify-otp`: quando parte l'invio automatico e cosa dice un codice
 * sbagliato. Tutto finto: sessione salvata, `/auth/v1/user`, la verifica OTP
 * (nessuna) e le tre edge `status-otp`, `send-otp`, `verify-otp`.
 */

const STORAGE_KEY = "sb-lxeawrpjfphgdspueiag-auth-token";
const USER = {
    id: "00000000-0000-4000-8000-0000000000e3",
    aud: "authenticated",
    role: "authenticated",
    email: "e2e-otp@example.invalid",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z"
};

function base64url(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
}

const NO_CODE = {
    resend_available_in: 0,
    attempts_used: null,
    attempts_left: null,
    max_attempts: null,
    expires_in: null,
    locked: false
};

type EdgeReply = { status: number; json: unknown };

/** Utente loggato e non ancora verificato; ritorna le chiamate a `send-otp`. */
async function otpPage(page: Page, statusReply: EdgeReply, verifyReply?: EdgeReply): Promise<{ sends: () => number }> {
    const now = Math.floor(Date.now() / 1000);
    const accessToken = [
        base64url({ alg: "HS256", typ: "JWT" }),
        base64url({ sub: USER.id, aud: "authenticated", role: "authenticated", exp: now + 3600, iat: now }),
        "e2e"
    ].join(".");
    const session = {
        access_token: accessToken,
        token_type: "bearer",
        expires_in: 3600,
        expires_at: now + 3600,
        refresh_token: "e2e-refresh",
        user: USER
    };
    await page.addInitScript(
        ([key, value]) => {
            localStorage.setItem(key, value);
            localStorage.setItem("authRememberMe", "true");
        },
        [STORAGE_KEY, JSON.stringify(session)] as const
    );

    let sends = 0;
    await page.route(/\/auth\/v1\/user/, route => route.fulfill({ status: 200, json: USER }));
    await page.route(/\/rest\/v1\//, route => route.fulfill({ status: 200, json: [] }));
    await page.route(/\/functions\/v1\/status-otp/, route => route.fulfill(statusReply));
    await page.route(/\/functions\/v1\/send-otp/, route => {
        sends += 1;
        return route.fulfill({ status: 200, json: { ok: true } });
    });
    await page.route(/\/functions\/v1\/verify-otp/, route =>
        route.fulfill(verifyReply ?? { status: 500, json: { error: "db_error" } })
    );

    await page.goto("/verify-otp");
    await expect(page.getByText("Codice a 6 cifre")).toBeVisible({ timeout: 15_000 });
    return { sends: () => sends };
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Verifica OTP", () => {
    test("nessun codice attivo: parte un invio", async ({ page }) => {
        const otp = await otpPage(page, { status: 200, json: NO_CODE });
        await expect.poll(otp.sends).toBe(1);
        await expect(page.getByText("Codice inviato.").first()).toBeVisible();
    });

    test("codice ancora valido (ricarica, altra scheda): nessun invio nuovo", async ({ page }) => {
        const otp = await otpPage(page, {
            status: 200,
            json: { ...NO_CODE, attempts_used: 0, attempts_left: 5, max_attempts: 5, expires_in: 480 }
        });
        await expect(page.getByText(/Un codice di verifica è già stato inviato a/)).toBeVisible();
        await expect(page.getByRole("button", { name: "Invialo di nuovo" })).toBeEnabled();
        expect(otp.sends()).toBe(0);
    });

    test("status-otp in errore: la pagina non resta ferma, parte l'invio", async ({ page }) => {
        const otp = await otpPage(page, { status: 500, json: { error: "db_error" } });
        await expect.poll(otp.sends).toBe(1);
        await expect(page.getByRole("button", { name: "Invialo di nuovo" })).toBeVisible();
    });

    test("codice sbagliato: dice quanti tentativi restano", async ({ page }) => {
        await otpPage(
            page,
            { status: 200, json: { ...NO_CODE, attempts_used: 0, attempts_left: 5, max_attempts: 5, expires_in: 480 } },
            { status: 400, json: { error: "invalid_or_expired", attempts_left: 3, max_attempts: 5 } }
        );
        // Un solo campo: sei cifre e la verifica parte da sola.
        await page.locator("#otp-code").fill("123456");
        await expect(page.getByText("Codice non valido. Tentativi rimasti: 3.").first()).toBeVisible();
        // Codice sbagliato: il campo si svuota, si riscrive da capo.
        await expect(page.locator("#otp-code")).toHaveValue("");
    });
});
