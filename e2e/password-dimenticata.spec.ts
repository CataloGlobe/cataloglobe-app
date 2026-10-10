import { expect, test } from "@playwright/test";

/**
 * «Password dimenticata»: dopo l'invio la pagina dice a quale email, permette
 * di rimandarla dopo 30 s e di correggere l'indirizzo senza riscriverlo.
 * Nessuna mail vera: `/auth/v1/recover` è finto.
 */

const EMAIL = "e2e-recupero@example.invalid";

test.use({ storageState: { cookies: [], origins: [] } });

test("invio, reinvio dopo l'attesa, correzione dell'email", async ({ page }) => {
    let recovers = 0;
    await page.route(/\/auth\/v1\/recover/, route => {
        recovers++;
        return route.fulfill({ status: 200, json: {} });
    });
    await page.clock.install();

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByRole("button", { name: "Invia link di recupero" }).click();

    await expect(page.getByRole("heading", { name: "Controlla la tua email" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(EMAIL)).toBeVisible();
    expect(recovers).toBe(1);

    const resend = page.getByRole("button", { name: "invia di nuovo" });
    await expect(resend).toBeDisabled();
    await page.clock.runFor(31_000);
    await expect(resend).toBeEnabled();
    await resend.click();
    await expect(page.getByText("Mandata di nuovo.")).toBeVisible();
    expect(recovers).toBe(2);

    await page.getByRole("button", { name: "Correggila" }).click();
    await expect(page.getByLabel("Email")).toHaveValue(EMAIL);
});
