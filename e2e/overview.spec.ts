import { expect, test, type Page } from "@playwright/test";
import { loadE2eEnv } from "./env";

/**
 * Panoramica azienda (`/business/:businessId/overview`).
 * Con `E2E_BUSINESS_ID` apre l'azienda diretta; altrimenti la prima card del
 * workspace (le `BusinessCard` sono `div[role="button"][tabindex="0"]`,
 * i bottoni veri dentro la card sono `<button>`).
 */
async function openOverview(page: Page): Promise<void> {
    const { businessId } = loadE2eEnv();
    if (businessId) {
        await page.goto(`/business/${businessId}/overview`);
        return;
    }
    await page.goto("/workspace");
    const firstCard = page.locator('div[role="button"][tabindex="0"]').first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();
    await page.waitForURL(/\/business\/[0-9a-f-]+\/overview$/);
}

test.describe("Panoramica", () => {
    test.beforeEach(async ({ page }) => {
        await openOverview(page);
    });

    test("titolo di pagina", async ({ page }) => {
        // Titolo finale: «Panoramica — {azienda} | CataloGlobe» (MainLayout).
        // Prima che il tenant sia caricato è «Panoramica | CataloGlobe» per
        // ~500 ms: agganciare quello verificherebbe uno stato transitorio.
        await expect(page).toHaveTitle(/^Panoramica — .+ \| CataloGlobe$/);
    });

    test("sidebar con voce Panoramica attiva", async ({ page }) => {
        const nav = page.getByRole("navigation", { name: "Menu principale" });
        await expect(nav).toBeVisible();
        const link = nav.getByRole("link", { name: "Panoramica" });
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute("aria-current", "page");
        for (const label of ["Sedi", "Prodotti", "Programmazione"]) {
            await expect(nav.getByRole("link", { name: label })).toBeVisible();
        }
    });

    test("card presenti", async ({ page }) => {
        await expect(page.getByText("Statistiche rapide", { exact: true })).toBeVisible();
        for (const label of ["Sedi", "Prodotti", "Programmi", "Contenuti in evidenza"]) {
            await expect(page.getByText(label, { exact: true }).last()).toBeVisible();
        }
        await expect(page.getByText("Azioni rapide", { exact: true })).toBeVisible();
    });
});
