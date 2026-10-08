import { expect, type Page } from "@playwright/test";
import { loadE2eEnv } from "./env";

/**
 * Apre una pagina dell'azienda di test. Con `E2E_BUSINESS_ID` va diretto;
 * altrimenti entra dalla prima card del workspace (il bottone «Entra» della
 * `BusinessCard`, T17) e poi segue la sidebar.
 */
export async function openBusinessPage(page: Page, path: string, sidebarLabel: string): Promise<void> {
    const { businessId } = loadE2eEnv();
    if (businessId) {
        await page.goto(`/business/${businessId}/${path}`);
        return;
    }
    await page.goto("/workspace");
    const firstCard = page.getByRole("button", { name: /^Entra in / }).first();
    // Il workspace carica tenant e inviti prima di rendere le card: con più
    // worker in parallelo i 5 s di default non bastano sempre.
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    await firstCard.click();
    // L'ingresso nell'azienda è la Panoramica, o la sede quando è una sola
    // (D1): da lì si passa alla Panoramica, che ha la sidebar dell'azienda.
    await page.waitForURL(/\/business\/[0-9a-f-]+\/(overview|locations\/[0-9a-f-]+\/[a-z-]+)$/);
    if (!/\/overview$/.test(page.url())) {
        await page.goto(page.url().replace(/\/locations\/.*$/, "/overview"));
    }
    // L'URL cambia prima che il layout dell'azienda sia montato (route lazy in
    // transizione): finché non lo è, la sidebar dell'azienda non c'è ancora.
    // Si aspetta la voce «Panoramica».
    const nav = page.getByRole("navigation", { name: "Menu principale" });
    await expect(nav.getByRole("link", { name: "Panoramica" })).toBeVisible({ timeout: 15_000 });
    await nav.getByRole("link", { name: sidebarLabel }).click();
    await page.waitForURL(new RegExp(`/business/[0-9a-f-]+/${path}$`));
}

/**
 * Come `openBusinessPage`, ma arriva alla pagina dal link diretto: serve
 * quando la voce non è in sidebar (senza il permesso di lettura `navModel`
 * la nasconde, e resta da provare il blocco della pagina).
 */
export async function openBusinessPageByUrl(page: Page, path: string): Promise<void> {
    await openBusinessPage(page, "overview", "Panoramica");
    await page.goto(page.url().replace(/\/business\/([0-9a-f-]+)\/.*$/, `/business/$1/${path}`));
}
