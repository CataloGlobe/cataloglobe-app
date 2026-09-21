import { expect, type Page } from "@playwright/test";
import { loadE2eEnv } from "./env";

/**
 * Apre una pagina dell'azienda di test. Con `E2E_BUSINESS_ID` va diretto;
 * altrimenti entra dalla prima card del workspace (le `BusinessCard` sono
 * `div[role="button"][tabindex="0"]`) e poi segue la sidebar.
 */
export async function openBusinessPage(page: Page, path: string, sidebarLabel: string): Promise<void> {
    const { businessId } = loadE2eEnv();
    if (businessId) {
        await page.goto(`/business/${businessId}/${path}`);
        return;
    }
    await page.goto("/workspace");
    const firstCard = page.locator('div[role="button"][tabindex="0"]').first();
    // Il workspace carica tenant e inviti prima di rendere le card: con più
    // worker in parallelo i 5 s di default non bastano sempre.
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    await firstCard.click();
    await page.waitForURL(/\/business\/[0-9a-f-]+\/overview$/);
    await page.getByRole("navigation", { name: "Menu principale" }).getByRole("link", { name: sidebarLabel }).click();
    await page.waitForURL(new RegExp(`/business/[0-9a-f-]+/${path}$`));
}
