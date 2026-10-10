import { expect, test, type Page } from "@playwright/test";

/**
 * Pagina `/email-confirmed` (link della mail di registrazione). Tutto finto:
 * `/auth/v1/verify` e, quando serve, una sessione già salvata.
 */

const STORAGE_KEY = "sb-lxeawrpjfphgdspueiag-auth-token";
const VERIFY_URL = "https://example.supabase.co/auth/v1/verify?token=tok-e2e&type=signup";
const LINK = `/email-confirmed?confirmation_url=${encodeURIComponent(VERIFY_URL)}`;

function base64url(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function session(email: string) {
    const now = Math.floor(Date.now() / 1000);
    const user = {
        id: "00000000-0000-4000-8000-0000000000e4",
        aud: "authenticated",
        role: "authenticated",
        email,
        app_metadata: { provider: "email" },
        user_metadata: {},
        created_at: "2026-01-01T00:00:00Z"
    };
    const accessToken = [
        base64url({ alg: "HS256", typ: "JWT" }),
        base64url({ sub: user.id, aud: "authenticated", role: "authenticated", exp: now + 3600, iat: now }),
        "e2e"
    ].join(".");
    return { access_token: accessToken, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "e2e-refresh", user };
}

async function withStoredSession(page: Page, email: string): Promise<void> {
    const value = session(email);
    await page.addInitScript(
        ([key, json]) => {
            localStorage.setItem(key, json);
            localStorage.setItem("authRememberMe", "true");
        },
        [STORAGE_KEY, JSON.stringify(value)] as const
    );
    await page.route(/\/auth\/v1\/user/, route => route.fulfill({ status: 200, json: value.user }));
}

/** Ritorna quante volte la pagina ha chiamato `/auth/v1/verify`. */
async function stubVerify(page: Page, reply: { status: number; json: unknown }): Promise<() => number> {
    let calls = 0;
    await page.route(/\/auth\/v1\/verify/, route => {
        calls += 1;
        return route.fulfill(reply);
    });
    await page.route(/\/auth\/v1\/logout/, route => route.fulfill({ status: 204, body: "" }));
    await page.route(/\/rest\/v1\//, route => route.fulfill({ status: 200, json: [] }));
    return () => calls;
}

/** La conferma ha scritto la verifica OTP (trigger su auth.users): riga presente. */
async function stubVerified(page: Page, user: { id: string }): Promise<void> {
    await page.route(/\/auth\/v1\/user/, route => route.fulfill({ status: 200, json: user }));
    await page.route(/\/rest\/v1\/otp_user_verifications/, route =>
        route.fulfill({ status: 200, json: [{ user_id: user.id }] })
    );
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Conferma email", () => {
    test("link valido: «Email confermata», poi si entra da soli, senza login né codice", async ({ page }) => {
        const value = session("nuovo@example.invalid");
        const calls = await stubVerify(page, { status: 200, json: value });
        await stubVerified(page, value.user);
        await page.goto(LINK);
        await expect(page.getByRole("heading", { name: "Email confermata" })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText(/Entri da solo tra \d s/)).toBeVisible();
        await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
        expect(calls()).toBe(1);
    });

    test("link valido: «Entra» porta dentro senza aspettare", async ({ page }) => {
        const value = session("nuovo@example.invalid");
        await stubVerify(page, { status: 200, json: value });
        await stubVerified(page, value.user);
        await page.goto(LINK);
        const entra = page.getByRole("button", { name: "Entra" });
        await entra.waitFor({ timeout: 15_000 });
        // L'attesa parte prima del clic: /dashboard poi rimanda altrove.
        await Promise.all([page.waitForURL(/\/dashboard/, { timeout: 3_000 }), entra.click()]);
    });

    test("link scaduto o già usato: lo dice e offre l'accesso", async ({ page }) => {
        await stubVerify(page, {
            status: 403,
            json: { code: 403, error_code: "otp_expired", msg: "Email link is invalid or has expired" }
        });
        await page.goto(LINK);
        await expect(page.getByRole("heading", { name: "Link scaduto o già usato" })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole("button", { name: "Accedi" })).toBeVisible();
    });

    test("altro account dentro: non dice «già verificata» e non consuma il link", async ({ page }) => {
        await withStoredSession(page, "vecchio@example.invalid");
        const calls = await stubVerify(page, { status: 200, json: session("nuovo@example.invalid") });
        await page.goto(LINK);
        await expect(page.getByRole("heading", { name: "Sei dentro con un altro account" })).toBeVisible({
            timeout: 15_000
        });
        await expect(page.getByText(/vecchio@example\.invalid/)).toBeVisible();
        expect(calls()).toBe(0);

        await stubVerified(page, session("nuovo@example.invalid").user);
        await page.getByRole("button", { name: "Esci e conferma" }).click();
        await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
        expect(calls()).toBe(1);
    });

    test("sessione aperta e nessun link: email già verificata", async ({ page }) => {
        await withStoredSession(page, "vecchio@example.invalid");
        await stubVerify(page, { status: 200, json: {} });
        await page.goto("/email-confirmed");
        await expect(page.getByRole("heading", { name: "Email già verificata" })).toBeVisible({ timeout: 15_000 });
    });
});
