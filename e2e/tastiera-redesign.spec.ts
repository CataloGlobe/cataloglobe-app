import { expect, test } from "@playwright/test";
import { SLUG, stubPublicPage } from "./publicPageStub";

/**
 * Tastiera nella pagina pubblica: una riga del menu si apre da tastiera (pulsante
 * nascosto col nome del piatto, Invio e spazio), la scheda prende il fuoco, Esc
 * chiude e il fuoco torna alla riga. I fogli lasciano la pagina sotto `inert`.
 *
 * Solo col redesign acceso: `VITE_PUBLIC_REDESIGN=true bash scripts/e2e.sh
 * e2e/tastiera-redesign.spec.ts`; senza il flag la spec si salta da sola.
 */

test.use({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } });
test.skip(process.env.VITE_PUBLIC_REDESIGN !== "true", "solo con VITE_PUBLIC_REDESIGN=true");

test("una riga del menu si apre da tastiera e il fuoco torna alla riga", async ({ page }) => {
    await stubPublicPage(page, { details: true });
    await page.goto(`/${SLUG}`);
    await page.getByText("Antipasti 1", { exact: true }).waitFor();
    test.skip((await page.getByRole("button", { name: "Altre opzioni" }).count()) === 0, "pagina senza redesign");

    const row = page.getByRole("button", { name: "Antipasti 2", exact: true });
    await row.focus();
    await expect(row).toBeFocused();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Antipasti 2" });
    await expect(dialog).toBeVisible();
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest("[role=dialog]"))).toBe(true);
    await expect(page.locator("main").first()).toHaveAttribute("inert", "");

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(row).toBeFocused();

    // Anche lo spazio apre la riga.
    await page.keyboard.press(" ");
    await expect(dialog).toBeVisible();
});
