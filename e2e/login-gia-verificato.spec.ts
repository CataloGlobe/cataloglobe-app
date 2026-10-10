import { expect, test, type Page } from "@playwright/test";

/**
 * Login di chi ha già fatto l'OTP negli ultimi 30 giorni: si entra senza
 * passare nemmeno un istante da `/verify-otp` (prima la pagina del codice
 * lampeggiava e sembrava un bug). Senza codice valido si va a `/verify-otp`.
 * In entrambi i casi il codice si controlla una volta sola.
 * Tutto finto: `/auth/v1/*`, REST, edge.
 */

const USER = {
    id: "00000000-0000-4000-8000-0000000000e7",
    aud: "authenticated",
    role: "authenticated",
    email: "e2e-login-verificato@example.invalid",
    email_confirmed_at: "2026-01-01T00:00:00Z",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z"
};

function base64url(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
}

test.use({ storageState: { cookies: [], origins: [] } });

async function login(page: Page, verified: boolean) {
    const now = Math.floor(Date.now() / 1000);
    const accessToken = [
        base64url({ alg: "HS256", typ: "JWT" }),
        base64url({ sub: USER.id, aud: "authenticated", role: "authenticated", exp: now + 3600, iat: now }),
        "e2e"
    ].join(".");
    const session = { access_token: accessToken, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "e2e-refresh", user: USER };

    // Ogni cambio di pagina della SPA, per vedere se /verify-otp è passata.
    await page.addInitScript(() => {
        const seen: string[] = [];
        (window as unknown as { __paths: string[] }).__paths = seen;
        for (const name of ["pushState", "replaceState"] as const) {
            const original = history[name].bind(history);
            history[name] = (...args: Parameters<History["pushState"]>) => {
                original(...args);
                seen.push(location.pathname);
            };
        }
    });

    const counts = { sendOtp: 0, otpChecks: 0 };
    await page.route(/\/auth\/v1\/token/, route => route.fulfill({ status: 200, json: session }));
    await page.route(/\/auth\/v1\/user/, route => route.fulfill({ status: 200, json: USER }));
    await page.route(/\/rest\/v1\/otp_user_verifications/, route => {
        counts.otpChecks++;
        return route.fulfill({ status: 200, json: verified ? [{ user_id: USER.id }] : [] });
    });
    await page.route(/\/rest\/v1\/(?!otp_user_verifications)/, route => route.fulfill({ status: 200, json: [] }));
    await page.route(/\/functions\/v1\/send-otp/, route => {
        counts.sendOtp++;
        return route.fulfill({ status: 200, json: { ok: true, already_verified: verified } });
    });
    await page.route(/\/functions\/v1\/(?!send-otp)/, route => route.fulfill({ status: 200, json: {} }));

    await page.goto("/login");
    await page.getByLabel("Email").fill(USER.email);
    await page.getByRole("textbox", { name: "Password" }).fill("e2e-password-finta");
    // Solo i controlli fatti dopo il clic: quello d'avvio (senza sessione) non c'è.
    counts.otpChecks = 0;
    await page.getByRole("button", { name: "Accedi" }).click();
    return counts;
}

test("login con OTP già verificato: niente pagina del codice", async ({ page }) => {
    const counts = await login(page, true);

    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
    const paths = await page.evaluate(() => (window as unknown as { __paths: string[] }).__paths);
    expect(paths.some(p => p.startsWith("/verify-otp"))).toBe(false);
    expect(counts.sendOtp).toBe(0);
    expect(counts.otpChecks).toBe(1);
});

test("login senza codice valido: si va a /verify-otp, con un controllo solo", async ({ page }) => {
    const counts = await login(page, false);

    await page.waitForURL(/\/verify-otp/, { timeout: 15_000 });
    expect(counts.otpChecks).toBe(1);
});
