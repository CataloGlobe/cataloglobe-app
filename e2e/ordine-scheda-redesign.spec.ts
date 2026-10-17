import { expect, test, type Page } from "@playwright/test";
import { SLUG, stubPublicPage } from "./publicPageStub";

/**
 * Scheda prodotto in modo ordine nel foglio unico del redesign (spec §7), col
 * QR del tavolo: formati e aggiunte da toccare, regola viva oltre il massimo,
 * quantità e nota, pulsante in fondo che porta a ciò che manca, poi
 * «Aggiunto · nome» con «Annulla». Anche il + della lista dà lo stesso avviso.
 * Stub senza login; il tavolo è la sessione finta di `publicPageStub`.
 */

test.use({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } });

async function openPage(page: Page): Promise<void> {
    await stubPublicPage(page, { ordering: true, details: true });
    await page.goto(`/${SLUG}`);
    await page.getByText("Antipasti 1", { exact: true }).waitFor();
    test.skip((await page.getByRole("button", { name: "Altre opzioni" }).count()) === 0, "pagina senza redesign");
}

const cart = (page: Page) => page.getByRole("button", { name: /^Il tuo ordine/ });
const notice = (page: Page, name: string) => page.getByRole("status").filter({ hasText: `Aggiunto · ${name}` });
const undo = (page: Page, name: string) => page.getByRole("button", { name: `Annulla l'aggiunta di ${name}` });

test("dalla scheda: formato, aggiunte col limite, quantità e nota, poi Aggiunto e Annulla", async ({ page }) => {
    await openPage(page);
    await page.getByText("Primi 1", { exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Primi 1" });
    await expect(dialog).toBeVisible();

    // Senza formato il pulsante porta al formato, non aggiunge.
    const action = page.getByRole("button", { name: "Scegli il formato" });
    await action.click();
    await expect(dialog.getByText("Scegline una per continuare")).toBeVisible();
    await expect(dialog.getByRole("radio", { name: /^Normale/ })).toBeFocused();

    await dialog.getByRole("radio", { name: /^Grande/ }).check();
    await expect(page.getByRole("button", { name: /^Aggiungi · 16,00/ })).toBeVisible();
    await expect(dialog.getByText("Scegline una per continuare")).toHaveCount(0);

    // Fino a 3: la quarta non passa e la regola lo dice.
    for (const name of ["Aggiunta 2", "Aggiunta 3", "Aggiunta 4"]) {
        await dialog.getByRole("checkbox", { name: new RegExp(`^${name}`) }).check();
    }
    await dialog.getByRole("checkbox", { name: /^Aggiunta 5/ }).click();
    await expect(dialog.getByRole("checkbox", { name: /^Aggiunta 5/ })).not.toBeChecked();
    await expect(dialog.getByText("Hai scelto 3: togline una per cambiare")).toBeVisible();
    await dialog.getByRole("checkbox", { name: /^Aggiunta 4/ }).uncheck();
    await expect(page.getByRole("button", { name: /^Aggiungi · 19,00/ })).toBeVisible();

    await dialog.getByRole("button", { name: "Aumenta" }).click();
    await expect(page.getByRole("button", { name: /^Aggiungi · 38,00/ })).toBeVisible();

    await dialog.getByRole("button", { name: "Aggiungi una nota" }).click();
    await dialog.getByRole("textbox", { name: "Nota per la cucina" }).fill("ben cotto");

    await page.getByRole("button", { name: /^Aggiungi · 38,00/ }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(notice(page, "Primi 1")).toBeVisible();
    await expect(cart(page)).toHaveAccessibleName("Il tuo ordine (2)");

    await undo(page, "Primi 1").click();
    await expect(cart(page)).toHaveAccessibleName("Il tuo ordine");
    await expect(notice(page, "Primi 1")).toHaveCount(0);
    await expect(undo(page, "Primi 1")).not.toBeVisible();
});

test("il + della lista aggiunge subito e dà lo stesso avviso", async ({ page }) => {
    await openPage(page);
    await page.getByRole("button", { name: "Aggiungi alla selezione" }).first().click();
    await expect(notice(page, "Antipasti 1")).toBeVisible();
    await expect(cart(page)).toHaveAccessibleName("Il tuo ordine (1)");
    await expect(undo(page, "Antipasti 1")).toBeVisible();

    // Va via da solo.
    await expect(notice(page, "Antipasti 1")).toHaveCount(0, { timeout: 8000 });
    await expect(undo(page, "Antipasti 1")).not.toBeVisible();
    await expect(cart(page)).toHaveAccessibleName("Il tuo ordine (1)");
});

test("il numero sulla riga apre «− n +»: più, meno, cestino; si richiude da solo o toccando fuori", async ({ page }) => {
    await openPage(page);
    const row = page.getByRole("listitem").filter({ has: page.getByText("Antipasti 1", { exact: true }) });
    await row.getByRole("button", { name: "Aggiungi alla selezione" }).click();
    await expect(cart(page)).toHaveAccessibleName("Il tuo ordine (1)");

    // Il numero non aggiunge: apre il gruppo, con un pezzo il «−» è il cestino.
    await row.getByRole("button", { name: "Nell'ordine: 1" }).click();
    const group = row.getByRole("group");
    await expect(group).toHaveAccessibleName("Nell'ordine: 1");
    await expect(cart(page)).toHaveAccessibleName("Il tuo ordine (1)");
    await group.getByRole("button", { name: "Aumenta quantità" }).click();
    await expect(cart(page)).toHaveAccessibleName("Il tuo ordine (2)");
    await group.getByRole("button", { name: "Diminuisci quantità" }).click();
    await expect(cart(page)).toHaveAccessibleName("Il tuo ordine (1)");
    await group.getByRole("button", { name: "Rimuovi" }).click();
    await expect(row.getByRole("button", { name: "Aggiungi alla selezione" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Dopo 3 secondi senza tocchi torna il numero.
    await row.getByRole("button", { name: "Aggiungi alla selezione" }).click();
    await row.getByRole("button", { name: "Nell'ordine: 1" }).click();
    await expect(group).toBeVisible();
    await expect(group).toHaveCount(0, { timeout: 5000 });
    await expect(row.getByRole("button", { name: "Nell'ordine: 1" })).toBeVisible();

    // Esc lo richiude anche se il fuoco non è nel gruppo.
    await row.getByRole("button", { name: "Nell'ordine: 1" }).click();
    await expect(group).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(group).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Toccando fuori si richiude subito.
    await row.getByRole("button", { name: "Nell'ordine: 1" }).click();
    await expect(group).toBeVisible();
    await page.getByRole("heading", { name: "Antipasti", exact: true }).click();
    await expect(group).toHaveCount(0);
});

test("piatto con scelte: il + apre la scheda", async ({ page }) => {
    await openPage(page);
    const row = page.getByRole("listitem").filter({ has: page.getByText("Primi 1", { exact: true }) });
    await row.getByRole("button", { name: "Aggiungi alla selezione" }).click();
    await expect(page.getByRole("dialog", { name: "Primi 1" })).toBeVisible();
    // Non aggiunge da solo: il piatto entra nell'ordine solo dalla scheda.
    await expect(row.getByRole("button", { name: /^Nell'ordine/ })).toHaveCount(0);
});

test("tavolo in manutenzione: si apre la scheda del redesign, con «Ordinazioni sospese» spento", async ({ page }) => {
    await stubPublicPage(page, { ordering: true, details: true });
    await page.goto(`/${SLUG}?maintenance=table_maintenance`);
    await page.getByText("Antipasti 1", { exact: true }).waitFor();
    test.skip((await page.getByRole("button", { name: "Altre opzioni" }).count()) === 0, "pagina senza redesign");

    await page.getByText("Primi 1", { exact: true }).click();
    // Il foglio del redesign (SheetHost, con `data-size`), non quello della scheda di oggi.
    const sheet = page.locator("[role=dialog][data-size]");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("heading", { name: "Primi 1" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Ordinazioni sospese" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Scegli il formato" })).toHaveCount(0);
});
