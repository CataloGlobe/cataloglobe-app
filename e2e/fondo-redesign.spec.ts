import { expect, test } from "@playwright/test";
import { SLUG, stubPublicPage } from "./publicPageStub";

/**
 * Fondo della pagina pubblica nel redesign (PR 8a, spec §10): voto, Oggi,
 * Informazioni utili (Allergeni e Caratteristiche nel foglio unico), Contatti,
 * firma e link legali; su desktop tre colonne. Pagina servita da stub, senza login.
 */

test.use({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ page }) => {
    // Mercoledì a mezzogiorno e mezzo: con gli orari dello stub la sede è aperta.
    await page.clock.setFixedTime(new Date("2026-10-14T12:30:00+02:00"));
    await stubPublicPage(page, { ordering: false, venueInfo: true, allergens: true, details: true });
    await page.goto(`/${SLUG}`);
    await page.getByText("Antipasti 1", { exact: true }).waitFor();
    test.skip((await page.getByRole("button", { name: "Altre opzioni" }).count()) === 0, "pagina senza redesign");
});

// Il <footer> sta dentro <main>: non è un «contentinfo», si trova dal testo.
const footer = (page: import("@playwright/test").Page) => page.locator("footer", { hasText: "Fine del menu" });

test("Oggi apre gli Orari, il voto apre il foglio col voto già scelto", async ({ page }) => {
    const end = footer(page);
    await end.scrollIntoViewIfNeeded();
    await expect(end.getByText("Fine del menu")).toBeVisible();
    await expect(end.getByRole("heading", { name: "Com'è andata?" })).toBeVisible();

    const dialog = page.getByRole("dialog");
    await end.getByRole("button", { name: /Oggi 12:00–23:00/ }).click();
    await expect(dialog.getByRole("heading", { name: "Orari della settimana" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Torna a Info e orari" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    await end.getByRole("button", { name: "4 stelle" }).click();
    await expect(dialog.getByText("Molto bene · 4 su 5")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "4 stelle" })).toHaveAttribute("aria-pressed", "true");
});

test("Allergeni e Caratteristiche nel foglio, coi piatti che li contengono", async ({ page }) => {
    const end = footer(page);
    await end.scrollIntoViewIfNeeded();
    const dialog = page.getByRole("dialog");

    await end.getByRole("button", { name: /^Allergeni/ }).click();
    await expect(dialog.getByRole("heading", { name: "Allergeni" })).toBeVisible();
    await expect(dialog.getByRole("listitem").filter({ hasText: "Glutine" })).toContainText("In 12 piatti");
    await expect(dialog.getByRole("listitem").filter({ hasText: "Latte" })).toContainText("In 8 piatti");
    await expect(dialog.getByRole("listitem").filter({ hasText: "Uova" })).toContainText("Non presente in questo menu");

    await dialog.getByRole("button", { name: "Filtra per allergeni" }).click();
    await expect(dialog.getByRole("heading", { name: "Filtri" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Indietro" })).toBeVisible();
    await dialog.getByRole("button", { name: "Chiudi" }).click();
    await expect(dialog).toHaveCount(0);

    await end.getByRole("button", { name: /^Caratteristiche/ }).click();
    await expect(dialog.getByRole("heading", { name: "Caratteristiche" })).toBeVisible();
    await expect(dialog.getByRole("listitem").filter({ hasText: "Vegetariano" })).toContainText("In 1 piatto");
});

test("Contatti: telefono e indicazioni, firma e link legali", async ({ page }) => {
    const end = footer(page);
    await expect(end.getByRole("link", { name: /Telefono/ })).toHaveAttribute("href", "tel:+39021234567");
    await expect(end.getByRole("link", { name: /Indirizzo/ })).toHaveAttribute("href", /google\.com\/maps/);
    await expect(end.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/legal/privacy");
    await expect(end.getByRole("link", { name: "Termini" })).toHaveAttribute("href", "/legal/termini");
});

test("su desktop Orari, Informazioni utili e Contatti stanno su tre colonne", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const end = footer(page);
    await end.scrollIntoViewIfNeeded();
    const boxes = await Promise.all(
        ["Orari", "Informazioni utili", "Contatti"].map(name =>
            end.getByRole("region", { name }).boundingBox()
        )
    );
    const [hours, info, contacts] = boxes.map(box => box!);
    expect(Math.abs(hours.y - info.y)).toBeLessThan(2);
    expect(Math.abs(info.y - contacts.y)).toBeLessThan(2);
    expect(hours.x).toBeLessThan(info.x);
    expect(info.x).toBeLessThan(contacts.x);
});

test("su un desktop stretto due colonne, e Contatti va sotto", async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 900 });
    const end = footer(page);
    await end.scrollIntoViewIfNeeded();
    const [hours, info, contacts] = await Promise.all(
        ["Orari", "Informazioni utili", "Contatti"].map(async name => (await end.getByRole("region", { name }).boundingBox())!)
    );
    expect(Math.abs(hours.y - info.y)).toBeLessThan(2);
    expect(contacts.y).toBeGreaterThan(hours.y + hours.height);
    expect(Math.abs(contacts.x - hours.x)).toBeLessThan(2);
});

test("Lingua da «Altre opzioni»: la pagina passa in inglese e torna in italiano", async ({ page }) => {
    const dialog = page.getByRole("dialog");
    await page.getByRole("button", { name: "Altre opzioni" }).click();
    await dialog.getByRole("button", { name: /^Lingua/ }).click();
    await expect(dialog.getByRole("option", { name: /Italiano/ })).toHaveAttribute("aria-selected", "true");
    await dialog.getByRole("option", { name: /English/ }).click();

    await expect(page).toHaveURL(new RegExp(`/${SLUG}/en$`));
    await expect(page.getByRole("button", { name: "More options" })).toBeVisible();
    await expect(page.locator("footer", { hasText: "End of the menu" })).toHaveCount(1);

    await page.getByRole("button", { name: "More options" }).click();
    await dialog.getByRole("button", { name: /^Language/ }).click();
    await expect(dialog.getByRole("option", { name: /English/ })).toHaveAttribute("aria-selected", "true");
    await dialog.getByRole("option", { name: /Italiano/ }).click();
    await expect(page).toHaveURL(new RegExp(`/${SLUG}$`));
    await expect(page.getByRole("button", { name: "Altre opzioni" })).toBeVisible();
});
