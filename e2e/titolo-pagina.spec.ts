import { expect, test } from "@playwright/test";
import { SLUG, stubPublicPage } from "./publicPageStub";

/**
 * La pagina pubblica ha un solo h1, col nome del locale (SEO e lettori di
 * schermo). Vale per la pagina di oggi e per il redesign: la spec gira in
 * tutti e due i modi, `bash scripts/e2e.sh e2e/titolo-pagina.spec.ts` e
 * `VITE_PUBLIC_REDESIGN=true bash scripts/e2e.sh e2e/titolo-pagina.spec.ts`.
 * Pagina servita da stub (`publicPageStub.ts`), senza login.
 */

test.use({ storageState: { cookies: [], origins: [] } });

for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 }
]) {
    test(`un solo h1, col nome del locale (${viewport.width} px)`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await stubPublicPage(page, { ordering: false, venueInfo: true });
        await page.goto(`/${SLUG}`);
        await page.getByText("Antipasti 1", { exact: true }).waitFor();

        const h1 = page.locator("h1");
        await expect(h1).toHaveCount(1);
        await expect(h1).toHaveText("Sede e2e barra");
    });
}
