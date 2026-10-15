import { expect, test } from "@playwright/test";
import { SLUG, stubPublicPage } from "./publicPageStub";

/**
 * Foglio unico del locale nel redesign della pagina pubblica (PR 3): ⋯,
 * Informazioni, Orari e Lingua sono pagine della stessa pila, a spinta.
 * Pagina servita da stub (`publicPageStub.ts`, `venueInfo`), senza login.
 */

test.use({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ page }) => {
    // Mercoledì a mezzogiorno e mezzo: con gli orari dello stub la sede è aperta.
    await page.clock.setFixedTime(new Date("2026-10-14T12:30:00+02:00"));
    await stubPublicPage(page, { ordering: false, venueInfo: true });
    await page.goto(`/${SLUG}`);
    await page.getByText("Antipasti 1", { exact: true }).waitFor();
    const island = page.getByRole("button", { name: "Altre opzioni" });
    test.skip((await island.count()) === 0, "pagina senza redesign (server riusato senza il flag)");
});

test("⋯ spinge Info e orari e poi gli Orari, Esc torna indietro e il fuoco torna al ⋯", async ({ page }) => {
    const more = page.getByRole("button", { name: "Altre opzioni" }).first();
    const dialog = page.getByRole("dialog");

    // Da tastiera, così il fuoco parte dal ⋯ anche su WebKit.
    await more.focus();
    await page.keyboard.press("Enter");
    await expect(dialog.getByRole("heading", { name: "Altro" })).toBeVisible();

    await dialog.getByRole("button", { name: /Info e orari/ }).click();
    await expect(dialog.getByRole("heading", { name: "Info e orari" })).toBeVisible();
    // Spinta normale: solo «‹», senza il nome della madre (mockup v38).
    await expect(dialog.getByRole("button", { name: "Indietro" })).toBeVisible();
    await expect(dialog.getByRole("link", { name: /02 1234567/ })).toBeVisible();

    await dialog.getByRole("button", { name: /Orari della settimana/ }).click();
    await expect(dialog.getByRole("heading", { name: "Orari della settimana" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Indietro" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog.getByRole("heading", { name: "Info e orari" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog.getByRole("heading", { name: "Altro" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(more).toBeFocused();
});

test("la pillola dello stato apre Orari con «‹ Info e orari» sotto", async ({ page }) => {
    const dialog = page.getByRole("dialog");
    await page.getByRole("button", { name: "Aperto", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "Orari della settimana" })).toBeVisible();

    // Link diretto a una figlia: la madre si nomina.
    await dialog.getByRole("button", { name: "Torna a Info e orari" }).click();
    await expect(dialog.getByRole("heading", { name: "Info e orari" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^Torna a/ })).toHaveCount(0);

    await dialog.getByRole("button", { name: "Chiudi" }).click();
    await expect(dialog).toHaveCount(0);
});

test("il nome del locale nell'isola apre Info e orari", async ({ page }) => {
    const dialog = page.getByRole("dialog");
    await page.getByRole("button", { name: /Informazioni sede/ }).first().click();
    await expect(dialog.getByRole("heading", { name: "Info e orari" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Indietro" })).toHaveCount(0);
});

test("la lingua si sceglie dalla bandiera o dal ⋯", async ({ page }) => {
    const dialog = page.getByRole("dialog");
    await page.getByRole("button", { name: "Seleziona lingua" }).click();
    await expect(dialog.getByRole("heading", { name: "Lingua" })).toBeVisible();
    await expect(dialog.getByRole("option", { name: /Italiano/ })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    await page.getByRole("button", { name: "Altre opzioni" }).first().click();
    await dialog.getByRole("button", { name: /Lingua/ }).click();
    await expect(dialog.getByRole("button", { name: "Indietro" })).toBeVisible();
    await dialog.getByRole("option", { name: /English/ }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/${SLUG}/en$`));
});

test("su uno schermo basso la sfumatura dice che c'è altro sotto", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 500 });
    const dialog = page.getByRole("dialog");
    await page.getByRole("button", { name: "Altre opzioni" }).first().click();
    await expect(dialog.getByRole("heading", { name: "Altro" })).toBeVisible();

    const scroller = dialog.locator("[data-more]").first();
    await expect(scroller).toHaveAttribute("data-more", "true");
    await scroller.evaluate(el => el.scrollTo(0, el.scrollHeight));
    await expect(scroller).toHaveAttribute("data-more", "false");
});

test("a locale chiuso la pillola è corta, con la frase intera come descrizione", async ({ page }) => {
    // Mercoledì alle 23:30: chiuso, riapre domani alle 12:00.
    await page.clock.setFixedTime(new Date("2026-10-14T23:30:00+02:00"));
    await page.reload();
    await page.getByText("Antipasti 1", { exact: true }).waitFor();
    const pill = page.getByRole("button", { name: "Chiuso · domani 12:00", exact: true });
    await expect(pill).toHaveAccessibleDescription("Chiuso · apre domani alle 12:00");
    // Il testo sta nella pillola senza tagliarsi.
    const clipped = await pill.locator("span").nth(1).evaluate(el => el.scrollWidth > el.clientWidth);
    expect(clipped).toBe(false);
});
