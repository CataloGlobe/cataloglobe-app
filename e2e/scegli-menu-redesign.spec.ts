import { expect, test, type Page } from "@playwright/test";
import { SLUG, stubPublicPage } from "./publicPageStub";

/**
 * «Scegli il menu» nel redesign (PR 9, spec §12, mockup v38): con più menu adesso
 * una pagina prima del menu; il menu scelto sta in `?menu=` e si cambia senza
 * ricaricare. Elenco dei menu dallo stub (`menus`), come lo manderà il giudice.
 *
 * Solo col redesign acceso: `VITE_PUBLIC_REDESIGN=true bash scripts/e2e.sh
 * e2e/scegli-menu-redesign.spec.ts`.
 */

test.use({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } });
test.skip(process.env.VITE_PUBLIC_REDESIGN !== "true", "solo con VITE_PUBLIC_REDESIGN=true");

async function openPage(page: Page, opts: { menus?: "two" | "one"; query?: string; ordering?: boolean } = {}) {
    // Mercoledì a mezzogiorno e mezzo: con gli orari dello stub la sede è aperta.
    await page.clock.setFixedTime(new Date("2026-10-14T12:30:00+02:00"));
    await stubPublicPage(page, { ordering: opts.ordering ?? false, venueInfo: true, reservations: true, menus: opts.menus ?? "two" });
    await page.goto(`/${SLUG}${opts.query ?? ""}`);
}

const chooser = (page: Page) => page.getByRole("region", { name: "Scegli il menu" });
const card = (page: Page, name: string) => chooser(page).getByRole("button", { name: new RegExp(`^${name},`) });

test("con due menu adesso: la scelta, poi il menu toccato; indietro torna alla scelta", async ({ page }) => {
    await openPage(page);
    const region = chooser(page);
    await expect(region.getByRole("heading", { level: 1, name: "Scegli il menu" })).toBeVisible();
    await expect(region.getByText("A quest'ora ce ne sono 2.", { exact: false })).toBeVisible();
    // Card: nome, orario e piatti; le categorie solo per chi legge con la voce.
    await expect(card(page, "Menu pranzo")).toHaveAccessibleName("Menu pranzo, 12:00-15:00, 2 categorie, 16 piatti. Apri il menu");
    await expect(card(page, "Menu pranzo")).toContainText("12:00-15:00 · 16 piatti");
    await expect(card(page, "Carta dei vini")).toBeVisible();
    // Più tardi: non si tocca, dice da quando.
    await expect(region.getByRole("heading", { name: "Più tardi" })).toBeVisible();
    await expect(region.getByRole("listitem").filter({ hasText: "Dessert e caffè" })).toContainText("dalle 15:00");
    await expect(region.getByRole("button", { name: /Dessert e caffè/ })).toHaveCount(0);
    // Il menu sotto è inerte: barra e isola non si raggiungono.
    const underInert = (name: string) => page.getByRole("button", { name }).first().evaluate(el => el.closest("[inert]") !== null);
    expect(await underInert("Altre opzioni")).toBe(true);

    await card(page, "Carta dei vini").click();
    await expect(page).toHaveURL(/[?&]menu=carta-dei-vini/);
    await expect(region).toHaveCount(0);
    await expect(page.getByText("Secondi 1", { exact: true })).toBeVisible();
    await expect(page.getByText("Antipasti 1", { exact: true })).toHaveCount(0);
    expect(await underInert("Altre opzioni")).toBe(false);

    await page.goBack();
    await expect(chooser(page)).toBeVisible();
    await expect(page).not.toHaveURL(/menu=/);
});

test("link diretto: un menu di adesso si apre subito; sconosciuto o di più tardi torna alla scelta", async ({ page }) => {
    await openPage(page, { query: "?menu=menu-pranzo" });
    await expect(page.getByText("Antipasti 1", { exact: true })).toBeVisible();
    await expect(page.getByText("Secondi 1", { exact: true })).toHaveCount(0);
    await expect(chooser(page)).toHaveCount(0);

    await page.goto(`/${SLUG}?menu=inesistente`);
    await expect(chooser(page)).toBeVisible();
    await page.goto(`/${SLUG}?menu=dessert-e-caffe`);
    await expect(chooser(page)).toBeVisible();
});

test("un solo menu adesso: niente scelta, dritti nel menu", async ({ page }) => {
    await openPage(page, { menus: "one" });
    await expect(page.getByText("Antipasti 1", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Altre opzioni" })).toBeVisible();
    await expect(chooser(page)).toHaveCount(0);
});

test("dalla scelta: Info e orari e Prenota aprono il foglio sopra, la scelta resta", async ({ page }) => {
    await openPage(page);
    const dialog = page.getByRole("dialog");
    await chooser(page).getByRole("button", { name: /^Info e orari/ }).click();
    await expect(dialog.getByRole("heading", { name: "Info e orari" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(chooser(page)).toBeVisible();

    await chooser(page).getByRole("button", { name: "Prenota un tavolo" }).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(chooser(page)).toBeVisible();
});

test("il carrello resta cambiando menu", async ({ page }) => {
    await openPage(page, { ordering: true });
    await card(page, "Menu pranzo").click();
    await page.getByRole("button", { name: "Aggiungi alla selezione" }).first().click();
    const cart = page.getByRole("button", { name: /^Il tuo ordine/ });
    await expect(cart).toContainText("1");

    await page.goBack();
    await card(page, "Carta dei vini").click();
    await expect(page.getByText("Secondi 1", { exact: true })).toBeVisible();
    await expect(cart).toContainText("1");
});
