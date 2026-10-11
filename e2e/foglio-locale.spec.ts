import { expect, test } from "@playwright/test";
import { SLUG, stubPublicPage } from "./publicPageStub";

/**
 * Foglio unico del locale nel redesign della pagina pubblica (PR 3): ⋯,
 * Informazioni, Orari e Lingua sono pagine della stessa pila, a spinta.
 * Pagina servita da stub (`publicPageStub.ts`, `venueInfo`), senza login.
 *
 * Solo col redesign acceso: `VITE_PUBLIC_REDESIGN=true bash scripts/e2e.sh
 * e2e/foglio-locale.spec.ts`. Il server di Vite eredita la variabile; se ne
 * gira già uno sulla 5174 senza il flag, Playwright riusa quello e la spec
 * si salta da sola.
 */

test.use({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } });
test.skip(process.env.VITE_PUBLIC_REDESIGN !== "true", "solo con VITE_PUBLIC_REDESIGN=true");

test.beforeEach(async ({ page }) => {
    // Mercoledì a mezzogiorno e mezzo: con gli orari dello stub la sede è aperta.
    await page.clock.setFixedTime(new Date("2026-10-14T12:30:00+02:00"));
    await stubPublicPage(page, { ordering: false, venueInfo: true });
    await page.goto(`/${SLUG}`);
    await page.getByText("Antipasti 1", { exact: true }).waitFor();
    const island = page.getByRole("button", { name: "Altre opzioni" });
    test.skip((await island.count()) === 0, "pagina senza redesign (server riusato senza il flag)");
});

test("⋯ spinge Informazioni e Orari, Esc torna indietro e il fuoco torna al ⋯", async ({ page }) => {
    const more = page.getByRole("button", { name: "Altre opzioni" }).first();
    const dialog = page.getByRole("dialog");

    // Da tastiera, così il fuoco parte dal ⋯ anche su WebKit.
    await more.focus();
    await page.keyboard.press("Enter");
    await expect(dialog.getByRole("heading", { name: "Opzioni" })).toBeVisible();

    await dialog.getByRole("button", { name: /Informazioni/ }).click();
    await expect(dialog.getByRole("heading", { name: "Informazioni" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Torna a Opzioni" })).toBeVisible();
    await expect(dialog.getByRole("link", { name: /02 1234567/ })).toBeVisible();

    await dialog.getByRole("button", { name: /Orari di apertura/ }).click();
    await expect(dialog.getByRole("heading", { name: "Orari di apertura" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Torna a Informazioni" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog.getByRole("heading", { name: "Informazioni" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog.getByRole("heading", { name: "Opzioni" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(more).toBeFocused();
});

test("la pillola dello stato apre Orari con Informazioni sotto", async ({ page }) => {
    const dialog = page.getByRole("dialog");
    await page.getByRole("button", { name: "Aperto", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "Orari di apertura" })).toBeVisible();

    await dialog.getByRole("button", { name: "Torna a Informazioni" }).click();
    await expect(dialog.getByRole("heading", { name: "Informazioni" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^Torna a/ })).toHaveCount(0);

    await dialog.getByRole("button", { name: "Chiudi" }).click();
    await expect(dialog).toHaveCount(0);
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
    await expect(dialog.getByRole("button", { name: "Torna a Opzioni" })).toBeVisible();
    await dialog.getByRole("option", { name: /English/ }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/${SLUG}/en$`));
});

test("su uno schermo basso la sfumatura dice che c'è altro sotto", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 500 });
    const dialog = page.getByRole("dialog");
    await page.getByRole("button", { name: "Altre opzioni" }).first().click();
    await expect(dialog.getByRole("heading", { name: "Opzioni" })).toBeVisible();

    const scroller = dialog.locator("[data-more]").first();
    await expect(scroller).toHaveAttribute("data-more", "true");
    await scroller.evaluate(el => el.scrollTo(0, el.scrollHeight));
    await expect(scroller).toHaveAttribute("data-more", "false");
});
