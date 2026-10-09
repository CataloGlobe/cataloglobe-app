import { expect, test } from "@playwright/test";

/**
 * Registrazione e conferma, attriti senza scelte di prodotto (2026-10-09):
 * - R6: l'invito al team sopravvive al giro login → registrazione;
 * - R7: login con email non confermata manda il codice e porta a scriverlo;
 * - R8: `/check-email` tiene l'email dopo un ricaricamento.
 * Tutto finto: `/auth/v1/*`, nessun account vero.
 */

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Registrazione, attriti", () => {
    test("R6: l'invito resta in memoria passando da «Registrati»", async ({ page }) => {
        await page.route(/\/auth\/v1\//, route => route.fulfill({ status: 401, json: { message: "no session" } }));
        await page.goto("/invite/tok-e2e");
        await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
        await page.getByRole("link", { name: "Registrati" }).click();
        await expect(page).toHaveURL(/\/sign-up/);
        const saved = await page.evaluate(() => localStorage.getItem("cg.pendingRedirect"));
        expect(JSON.parse(saved ?? "{}").path).toBe("/invite/tok-e2e");
    });

    test("R7: email non confermata, reinvio del link dal login", async ({ page }) => {
        let resends = 0;
        await page.route(/\/auth\/v1\/token/, route =>
            route.fulfill({ status: 400, json: { code: 400, error_code: "email_not_confirmed", msg: "Email not confirmed" } })
        );
        await page.route(/\/auth\/v1\/resend/, route => {
            resends += 1;
            return route.fulfill({ status: 200, json: {} });
        });
        await page.goto("/login");
        await page.locator("input[type=email]").fill("nuovo@example.invalid");
        await page.locator("input[type=password]").fill("Password-e2e-1");
        await page.getByRole("button", { name: "Accedi" }).click();
        await page.getByRole("button", { name: "Mandami il codice di conferma" }).click();
        // Mail nuova con codice e link: si va dove si scrive il codice.
        await page.waitForURL(/\/check-email/);
        await expect(page.getByText("nuovo@example.invalid")).toBeVisible();
        expect(resends).toBe(1);
    });

    test("R8: /check-email tiene l'email dopo un ricaricamento", async ({ page }) => {
        await page.goto("/login");
        await page.evaluate(() => sessionStorage.setItem("cg.signupEmail", "nuovo@example.invalid"));
        await page.goto("/check-email");
        await expect(page.getByText("nuovo@example.invalid")).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole("button", { name: /invia di nuovo/i })).toBeVisible();
    });
});
