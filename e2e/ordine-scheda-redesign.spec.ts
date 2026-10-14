import { expect, test, type Page } from "@playwright/test";
import { SLUG, stubPublicPage } from "./publicPageStub";

/**
 * Scheda prodotto in modo ordine nel foglio unico del redesign (spec §7), col
 * QR del tavolo: formati e aggiunte da toccare, regola viva oltre il massimo,
 * quantità e nota, pulsante in fondo che porta a ciò che manca, poi
 * «Aggiunto · nome» con «Annulla». Anche il + della lista dà lo stesso avviso.
 * Stub senza login; il tavolo è la sessione finta di `publicPageStub`.
 *
 * Solo col redesign acceso: `VITE_PUBLIC_REDESIGN=true bash scripts/e2e.sh
 * e2e/ordine-scheda-redesign.spec.ts`; senza il flag la spec si salta da sola.
 */

test.use({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } });
test.skip(process.env.VITE_PUBLIC_REDESIGN !== "true", "solo con VITE_PUBLIC_REDESIGN=true");

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
