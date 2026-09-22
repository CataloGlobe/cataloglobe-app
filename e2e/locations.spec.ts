import { expect, test } from "@playwright/test";
import { openBusinessPage } from "./business";

/**
 * Sedi (`/business/:businessId/locations`), viste da un amministratore su
 * un'azienda con più sedi e sedi pagate ancora libere. Copre le feature che
 * sopravvivono alla riscrittura (registro feature, §Sedi passo 2): titolo;
 * le tab Sedi | Gruppi di sedi; la griglia con una card per sede, stato e
 * riga del menù attivo; la vista lista con le sue colonne; la ricerca senza
 * risultati; il drawer «Nuova sede» aperto e chiuso senza creare niente; la
 * tabella dei gruppi. Nessuna scrittura: creare o eliminare una sede
 * consuma una sede pagata o cancella dati.
 */
test.describe("Sedi", () => {
    test.beforeEach(async ({ page }) => {
        await openBusinessPage(page, "locations", "Sedi");
    });

    test("titolo di pagina", async ({ page }) => {
        await expect(page).toHaveTitle(/^Sedi — .+ \| CataloGlobe$/);
    });

    test("header: tab Sedi e Gruppi, ricerca, vista, aggiungi", async ({ page }) => {
        await expect(page.getByRole("tab", { name: "Sedi", exact: true })).toHaveAttribute("aria-selected", "true");
        await expect(page.getByRole("tab", { name: "Gruppi di sedi" })).toBeVisible();
        await expect(page.getByRole("textbox", { name: /Cerca sede/ })).toBeVisible();
        await expect(page.getByRole("radio", { name: "Vista griglia" })).toBeVisible();
        await expect(page.getByRole("radio", { name: "Vista lista" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Aggiungi sede" })).toBeEnabled();
    });

    test("griglia: una card per sede con stato e menù attivo", async ({ page }) => {
        await page.getByRole("radio", { name: "Vista griglia" }).click();
        const main = page.getByRole("main");
        // Card della griglia: `article` sulla pagina vecchia, `listitem` di CardGrid dopo.
        const cards = main.locator('article, [role="listitem"]');
        await expect(cards.first()).toBeVisible({ timeout: 15_000 });
        expect(await cards.count()).toBeGreaterThan(1);
        const first = cards.first();
        await expect(first.getByText(/^(Pubblicata|Sospesa)/)).toBeVisible();
        await expect(first.getByText("Menu attivo ora")).toBeVisible();
        await expect(first.getByRole("button", { name: "Azioni sede" })).toBeVisible();
    });

    test("lista: le colonne della tabella", async ({ page }) => {
        await page.getByRole("radio", { name: "Vista lista" }).click();
        const main = page.getByRole("main");
        for (const header of ["Indirizzo", "Città", "Stato", "Menu attivo ora"]) {
            await expect(main.getByText(header, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
        }
        await expect(main.getByText(/^(Pubblicata|Sospesa)$/).first()).toBeVisible();
        // La preferenza torna alla griglia, così gli altri test partono uguali.
        await page.getByRole("radio", { name: "Vista griglia" }).click();
    });

    test("ricerca senza risultati", async ({ page }) => {
        await page.getByRole("textbox", { name: /Cerca sede/ }).fill("nessuna-sede-con-questo-nome");
        const main = page.getByRole("main");
        await expect(main.getByText("Nessun risultato")).toBeVisible();
        await expect(main.locator('article, [role="listitem"]')).toHaveCount(0);
    });

    test("drawer «Nuova sede»: si apre e si chiude senza creare", async ({ page }) => {
        await page.getByRole("button", { name: "Aggiungi sede" }).click();
        const dialog = page.getByRole("dialog");
        await expect(dialog.getByText("Nuova sede", { exact: true })).toBeVisible();
        await expect(dialog.getByRole("textbox", { name: /^Nome/ })).toBeVisible();
        await expect(dialog.getByRole("button", { name: "Crea sede" })).toBeVisible();
        await dialog.getByRole("button", { name: "Annulla", exact: true }).click();
        await expect(page.getByRole("dialog")).toBeHidden();
    });

    test("gruppi di sedi: la tabella", async ({ page }) => {
        await page.getByRole("tab", { name: "Gruppi di sedi" }).click();
        await expect(page).toHaveURL(/tab=groups/);
        const main = page.getByRole("main");
        await expect(main.getByText(/^(Nome gruppo|Nessun gruppo creato)$/).first()).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole("textbox", { name: /Cerca gruppo/ })).toBeVisible();
    });
});
