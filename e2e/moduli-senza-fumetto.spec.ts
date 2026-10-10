import { expect, test } from "@playwright/test";

/**
 * I moduli non mostrano il fumetto del browser («Aggiungi un simbolo @…»):
 * il form è noValidate e l'errore sta sotto il campo, nello stile della
 * libreria. L'errore del tentativo precedente sparisce quando si corregge.
 * Tutto finto: `/auth/v1/*`.
 */

test.use({ storageState: { cookies: [], origins: [] } });

test("login: email scritta male, messaggio sotto il campo e nessuna chiamata", async ({ page }) => {
    let tokenCalls = 0;
    await page.route(/\/auth\/v1\/token/, route => {
        tokenCalls++;
        return route.fulfill({
            status: 400,
            json: { code: "invalid_credentials", error_code: "invalid_credentials", msg: "Invalid login credentials" }
        });
    });

    await page.goto("/login");
    await expect(page.locator("form").first()).toHaveAttribute("novalidate", "");

    const email = page.getByLabel("Email");
    await email.fill("s");
    await page.getByRole("textbox", { name: "Password", exact: true }).fill("una-password");
    await page.getByRole("button", { name: "Accedi", exact: true }).click();

    await expect(page.getByText("Inserisci un indirizzo email valido.")).toBeVisible();
    expect(tokenCalls).toBe(0);

    // Correggendo, il messaggio sparisce.
    await email.fill("s@esempio.it");
    await expect(page.getByText("Inserisci un indirizzo email valido.")).toBeHidden();

    // L'errore del server resta finché non si tocca un campo.
    await page.getByRole("button", { name: "Accedi", exact: true }).click();
    const banner = page.getByRole("alert").filter({ hasText: "Email o password non corretti." });
    await expect(banner).toBeVisible({ timeout: 15_000 });
    expect(tokenCalls).toBe(1);
    await page.getByRole("textbox", { name: "Password", exact: true }).fill("un-altra");
    await expect(banner).toBeHidden();
});

test("password dimenticata: email scritta male non parte", async ({ page }) => {
    let recovers = 0;
    await page.route(/\/auth\/v1\/recover/, route => {
        recovers++;
        return route.fulfill({ status: 200, json: {} });
    });

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill("lorenzo@gmail");
    await page.getByRole("button", { name: "Invia link di recupero" }).click();

    await expect(page.getByText("Inserisci un indirizzo email valido.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Controlla la tua email" })).toBeHidden();
    expect(recovers).toBe(0);
});
