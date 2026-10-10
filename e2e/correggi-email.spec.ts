import { expect, test } from "@playwright/test";

/**
 * «Email sbagliata? Correggila» su /check-email: si torna alla registrazione
 * con nome, cognome, email e telefono già scritti; la password no.
 */

test.use({ storageState: { cookies: [], origins: [] } });

test("Correggila riporta il modulo compilato, senza password", async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(() => {
        sessionStorage.setItem("cg.signupEmail", "mario@example.co");
        sessionStorage.setItem(
            "cg.signupDraft",
            JSON.stringify({ firstName: "Mario", lastName: "Rossi", email: "mario@example.co", phone: "3331234567" })
        );
    });
    await page.goto("/check-email");
    await expect(page.getByText("mario@example.co")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Correggila" }).click();
    await page.waitForURL(/\/sign-up/);

    await expect(page.getByLabel("Nome", { exact: false }).first()).toHaveValue("Mario");
    await expect(page.getByLabel("Cognome", { exact: false })).toHaveValue("Rossi");
    await expect(page.locator("input[type=email]")).toHaveValue("mario@example.co");
    await expect(page.locator("input[type=email]")).toBeFocused();
    await expect(page.locator("input[type=tel]")).toHaveValue("3331234567");
    await expect(page.locator("input[type=password]").first()).toHaveValue("");
});
