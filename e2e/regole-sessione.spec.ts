import { expect, test, type Page } from "@playwright/test";

/**
 * Regole di sessione decise da Lorenzo il 2026-10-09:
 * - «Esci» chiude solo questo dispositivo e non cancella la verifica OTP;
 * - «Esci da tutti i dispositivi» chiude tutto e cancella la verifica;
 * - «Ricordami» tolto: chi aveva la sessione in sessionStorage la ritrova.
 * Tutto finto: sessione salvata, `/auth/v1/*`, `/rest/v1/*`.
 */

const STORAGE_KEY = "sb-lxeawrpjfphgdspueiag-auth-token";
const USER = {
    id: "00000000-0000-4000-8000-0000000000e7",
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

function sessionJson(): string {
    const now = Math.floor(Date.now() / 1000);
    const accessToken = [
        base64url({ alg: "HS256", typ: "JWT" }),
        base64url({ sub: USER.id, aud: "authenticated", role: "authenticated", exp: now + 3600, iat: now }),
        "e2e"
    ].join(".");
    return JSON.stringify({
        access_token: accessToken,
        token_type: "bearer",
        expires_in: 3600,
        expires_at: now + 3600,
        refresh_token: "e2e-refresh",
        user: USER
    });
}

type Calls = { logoutScopes: string[]; deleteVerification: number };

async function stubBackend(page: Page): Promise<Calls> {
    const calls: Calls = { logoutScopes: [], deleteVerification: 0 };
    await page.route(/\/auth\/v1\/user/, route => route.fulfill({ status: 200, json: USER }));
    await page.route(/\/auth\/v1\/logout/, route => {
        calls.logoutScopes.push(new URL(route.request().url()).searchParams.get("scope") ?? "global");
        return route.fulfill({ status: 204, body: "" });
    });
    await page.route(/\/rest\/v1\/rpc\/delete_my_otp_verification/, route => {
        calls.deleteVerification += 1;
        return route.fulfill({ status: 204, body: "" });
    });
    await page.route(/\/rest\/v1\/otp_user_verifications/, route =>
        route.fulfill({ status: 200, json: [{ user_id: USER.id }] })
    );
    await page.route(/\/rest\/v1\/(?!otp_user_verifications|rpc\/delete_my_otp_verification)/, route =>
        route.fulfill({ status: 200, json: [] })
    );
    await page.route(/\/functions\/v1\//, route => route.fulfill({ status: 200, json: {} }));
    return calls;
}

async function storedSession(page: Page): Promise<void> {
    await page.addInitScript(
        ([key, value]) => {
            if (sessionStorage.getItem("e2e-seeded")) return;
            sessionStorage.setItem("e2e-seeded", "1");
            localStorage.setItem(key, value);
        },
        [STORAGE_KEY, sessionJson()] as const
    );
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Regole di sessione", () => {
    test("«Esci»: solo questo dispositivo, la verifica OTP resta", async ({ page }) => {
        const calls = await stubBackend(page);
        await storedSession(page);
        await page.goto("/workspace/account");
        await page.getByRole("button", { name: "Esci", exact: true }).first().click();
        await page.getByRole("button", { name: "Esci", exact: true }).last().click();
        await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
        expect(calls.logoutScopes).toEqual(["local"]);
        expect(calls.deleteVerification).toBe(0);
    });

    test("«Esci da tutti i dispositivi»: tutte le sessioni e la verifica", async ({ page }) => {
        const calls = await stubBackend(page);
        await storedSession(page);
        await page.goto("/workspace/account");
        await page.getByRole("button", { name: "Esci da tutti" }).first().click();
        await page.getByRole("button", { name: "Esci da tutti" }).last().click();
        await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
        expect(calls.logoutScopes).toEqual(["global"]);
        expect(calls.deleteVerification).toBe(1);
    });

    test("sessione in sessionStorage (vecchio «Ricordami» spento): resta dentro", async ({ page }) => {
        await stubBackend(page);
        await page.addInitScript(
            ([key, value]) => {
                if (localStorage.getItem("e2e-seeded")) return;
                localStorage.setItem("e2e-seeded", "1");
                localStorage.setItem("authRememberMe", "false");
                sessionStorage.setItem(key, value);
            },
            [STORAGE_KEY, sessionJson()] as const
        );
        await page.goto("/workspace/account");
        await expect(page.getByRole("heading", { name: "Account" })).toBeVisible({ timeout: 15_000 });
        const stored = await page.evaluate(
            key => ({ local: localStorage.getItem(key) !== null, legacy: localStorage.getItem("authRememberMe") }),
            STORAGE_KEY
        );
        expect(stored).toEqual({ local: true, legacy: null });
    });

    test("il login non ha più «Ricordami»", async ({ page }) => {
        await page.goto("/login");
        await expect(page.getByRole("button", { name: "Accedi" })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText("Ricordami")).toHaveCount(0);
    });
});
