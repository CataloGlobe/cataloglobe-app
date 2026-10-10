import { expect, test } from "@playwright/test";

/**
 * Password trapelata in registrazione: Supabase («password trapelate» acceso)
 * risponde `weak_password` con `reasons: ["pwned"]` anche a password che
 * passano i controlli del client. Il messaggio sta sotto il campo e dice il
 * motivo vero, non «almeno 8 caratteri». Tutto finto: `/auth/v1/signup`.
 */

test.use({ storageState: { cookies: [], origins: [] } });

test("password trapelata: messaggio vero sotto il campo", async ({ page }) => {
    let signups = 0;
    await page.route(/\/auth\/v1\/signup/, route => {
        signups++;
        return route.fulfill({
            status: 422,
            json: {
                code: 422,
                error_code: "weak_password",
                msg: "Password is known to be weak and easy to guess, please choose a different one.",
                weak_password: { reasons: ["pwned"] }
            }
        });
    });

    await page.goto("/sign-up");
    await page.getByLabel("Nome", { exact: false }).first().fill("Mario");
    await page.getByLabel("Cognome", { exact: false }).fill("Rossi");
    await page.locator("input[type=email]").fill("mario@example.invalid");
    await page.locator("input[type=password]").nth(0).fill("Test_1234");
    await page.locator("input[type=password]").nth(1).fill("Test_1234");
    await page.getByRole("checkbox").first().check();
    await page.locator("button[type=submit]").click();

    await expect(page.getByText("Questa password è comparsa in fughe di dati di altri siti: scegline un'altra.")).toBeVisible({
        timeout: 15_000
    });
    await expect(page.getByText(/almeno 8 caratteri/)).toHaveCount(0);
    expect(signups).toBe(1);
    await expect(page).toHaveURL(/\/sign-up/);
});
