import { expect, test, type Page } from "@playwright/test";

/**
 * Workspace come porta (T17): niente sidebar, saluto col nome, card delle
 * attività con «Entra», abbonamento nella card, account dal menu
 * dell'avatar. I vecchi indirizzi (`/workspace/settings`, `/workspace/billing`)
 * reindirizzano. Solo lettura: nessuna attività viene creata o toccata.
 */

async function openWorkspace(page: Page): Promise<void> {
    await page.goto("/workspace");
    await expect(page.getByRole("button", { name: /^Entra in / }).first()).toBeVisible({ timeout: 15_000 });
}

async function horizontalOverflow(page: Page): Promise<number> {
    return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe("Workspace", () => {
    test("WS1: saluto con l'ora del giorno e «Nuova attività» accanto", async ({ page }) => {
        await openWorkspace(page);
        const main = page.getByRole("main");
        await expect(main.getByRole("heading", { level: 1 })).toHaveText(/^(Buongiorno|Buon pomeriggio|Buonasera)/);
        await expect(main.getByRole("button", { name: "Nuova attività" }).first()).toBeVisible();
    });

    test("WS1-WS2: la card dice sedi, menù, prodotti e l'abbonamento", async ({ page }) => {
        await openWorkspace(page);
        const card = page.getByRole("main").getByRole("article").first();
        for (const label of [/^sed[ei]$/, /^menù$/, /^prodott[oi]$/]) {
            await expect(card.getByText(label)).toBeVisible();
        }
        await expect(card.getByText(/^(Attivo|In prova|Pagamento in ritardo|Disdetto|Sospeso|Da attivare)$/)).toBeVisible();
    });

    test("WS3: niente sidebar né voce Abbonamento; l'avatar porta ad Account", async ({ page }) => {
        await openWorkspace(page);
        await expect(page.getByRole("navigation", { name: "Menu principale" })).toHaveCount(0);
        await expect(page.getByRole("link", { name: "Abbonamento", exact: true })).toHaveCount(0);
        await page.getByRole("button", { name: "Profilo utente" }).click();
        await page.getByRole("menuitem", { name: "Account" }).click();
        await expect(page).toHaveURL(/\/workspace\/account$/);
    });

    test("WS2-WS3: i vecchi indirizzi reindirizzano", async ({ page }) => {
        await page.goto("/workspace/settings");
        await expect(page).toHaveURL(/\/workspace\/account$/);
        await page.goto("/workspace/billing");
        await expect(page).toHaveURL(/\/workspace$/);
    });

    test("WS4: Account, una card con profilo, Password, Esci ed Elimina account", async ({ page }) => {
        await page.goto("/workspace/account");
        const main = page.getByRole("main");
        await expect(main.getByRole("link", { name: "Le tue attività" })).toBeVisible({ timeout: 15_000 });
        await expect(main.getByRole("button", { name: "Modifica profilo" })).toBeVisible();
        await expect(main.getByRole("button", { name: "Cambia password" })).toBeVisible();
        await expect(main.getByRole("button", { name: "Esci", exact: true })).toBeVisible();
        await expect(
            main.getByText("Viene eliminato dopo 30 giorni; fino ad allora puoi recuperarlo accedendo di nuovo.")
        ).toBeVisible();
        await expect(main.getByRole("button", { name: "Elimina account" })).toBeVisible();
    });

    test("WS6: a 375 nessuno scorrimento orizzontale, nel Workspace e in Account", async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 800 });
        await openWorkspace(page);
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
        await page.goto("/workspace/account");
        await expect(page.getByRole("button", { name: "Modifica profilo" })).toBeVisible({ timeout: 15_000 });
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
        // Profilo centrato: «Modifica profilo» a tutta larghezza della card.
        const button = (await page.getByRole("button", { name: "Modifica profilo" }).boundingBox())!;
        expect(button.width).toBeGreaterThan(375 - 2 * 16 - 2 * 16 - 4);
    });
});
