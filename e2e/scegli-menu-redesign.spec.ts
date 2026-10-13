import { expect, test, type Page } from "@playwright/test";
import { SLUG, stubPublicPage } from "./publicPageStub";
import type { StyleConfig } from "./publicPageStub";

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

async function openPage(
    page: Page,
    opts: { menus?: "two" | "one"; query?: string; ordering?: boolean; cover?: string; styleConfig?: StyleConfig; reservationsPage?: boolean } = {}
) {
    // Mercoledì a mezzogiorno e mezzo: con gli orari dello stub la sede è aperta.
    await page.clock.setFixedTime(new Date("2026-10-14T12:30:00+02:00"));
    await stubPublicPage(page, { ordering: opts.ordering ?? false, venueInfo: true, reservations: true, menus: opts.menus ?? "two", cover: opts.cover, styleConfig: opts.styleConfig, reservationsPage: opts.reservationsPage });
    await page.goto(`/${SLUG}${opts.query ?? ""}`);
}

const chooser = (page: Page) => page.getByRole("region", { name: "Scegli il menu" });
const card = (page: Page, name: string) => chooser(page).getByRole("button", { name: new RegExp(`^${name},`) });
/** Durante il passaggio (View Transitions) i clic andrebbero alle fotografie: si aspetta la fine. */
const afterPassage = (page: Page) => expect(page.locator("html")).not.toHaveAttribute("data-menu-passage");
async function pickCard(page: Page, name: string) {
    await card(page, name).click();
    await expect(chooser(page)).toHaveCount(0);
    await afterPassage(page);
}

test("con due menu adesso: la scelta, poi il menu toccato; indietro torna alla scelta", async ({ page }) => {
    await openPage(page);
    const region = chooser(page);
    await expect(region.getByRole("heading", { level: 1, name: "Scegli il menu" })).toBeVisible();
    // Prima apertura: la cascata resta tale anche dopo l'idratazione, e il fuoco non salta sul titolo.
    await expect(region).toHaveAttribute("data-entrance", "rise");
    await expect(region.getByRole("heading", { level: 1 })).not.toBeFocused();
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

    await pickCard(page, "Carta dei vini");
    await expect(page).toHaveURL(/[?&]menu=carta-dei-vini/);
    // Il fuoco passa al selettore del menu, non resta sul body.
    await expect(page.getByRole("button", { name: /^Menu: Carta dei vini/ })).toBeFocused();
    await expect(page.getByText("Secondi 1", { exact: true })).toBeVisible();
    await expect(page.getByText("Antipasti 1", { exact: true })).toHaveCount(0);
    expect(await underInert("Altre opzioni")).toBe(false);

    // Indietro del browser senza animazione sua (qui, col mouse): la scelta rientra da sinistra.
    await page.goBack();
    await expect(chooser(page)).toBeVisible();
    await expect(chooser(page)).toHaveAttribute("data-entrance", "back");
    await expect(page).not.toHaveURL(/menu=/);
});

test("sede che prenota sulla pagina /prenota: «Prenota un tavolo» nella scelta porta lì", async ({ page }) => {
    await openPage(page, { reservationsPage: true });
    await chooser(page).getByRole("button", { name: "Prenota un tavolo" }).click();
    await expect(page).toHaveURL(new RegExp(`/${SLUG}/prenota`));
});

test("stile senza il nome del catalogo: il selettore del menu nell'isola c'è lo stesso", async ({ page }) => {
    await openPage(page, { query: "?menu=menu-pranzo", styleConfig: { header: { showCatalogName: false } } });
    await expect(page.getByRole("button", { name: "Menu: Menu pranzo, 1 di 2. Cambia menu" })).toBeVisible();
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
    await pickCard(page, "Menu pranzo");
    await page.getByRole("button", { name: "Aggiungi alla selezione" }).first().click();
    const cart = page.getByRole("button", { name: /^Il tuo ordine/ });
    await expect(cart).toContainText("1");

    await page.goBack();
    await pickCard(page, "Carta dei vini");
    await expect(page.getByText("Secondi 1", { exact: true })).toBeVisible();
    await expect(cart).toContainText("1");
});

test("dal menu: il nome nell'isola apre «Menu disponibili ora», si cambia menu; «Tutti i menu» torna alla scelta", async ({ page }) => {
    await openPage(page);
    await pickCard(page, "Carta dei vini");
    await expect(page.getByText("Secondi 1", { exact: true })).toBeVisible();

    const dialog = page.getByRole("dialog");
    await page.getByRole("button", { name: "Menu: Carta dei vini, 2 di 2. Cambia menu" }).click();
    await expect(dialog.getByRole("heading", { name: "Menu disponibili ora" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^Carta dei vini/ })).toHaveAttribute("aria-current", "true");
    await expect(dialog.getByRole("button", { name: /^Menu pranzo/ })).not.toHaveAttribute("aria-current");
    await dialog.getByRole("button", { name: /^Menu pranzo/ }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/[?&]menu=menu-pranzo/);
    await expect(page.getByText("Antipasti 1", { exact: true })).toBeVisible();
    await expect(page.getByText("Secondi 1", { exact: true })).toHaveCount(0);

    // Dal ⋯: «Cambia menu · Ora: Menu pranzo» porta allo stesso elenco, poi «Tutti i menu».
    await page.getByRole("button", { name: "Altre opzioni" }).click();
    await dialog.getByRole("button", { name: /^Cambia menu/ }).click();
    await expect(dialog.getByRole("heading", { name: "Menu disponibili ora" })).toBeVisible();
    await dialog.getByRole("button", { name: /^Tutti i menu/ }).click();
    await expect(chooser(page)).toBeVisible();
    // Il passaggio parte subito col foglio dentro, non dopo la sua chiusura; la scelta entra ferma.
    await expect(chooser(page)).toHaveAttribute("data-entrance", "still");
    await expect(page).not.toHaveURL(/menu=/);
    await expect(dialog).toHaveCount(0);
});

test("il cambio dal foglio non si accumula nella cronologia: indietro torna alla scelta", async ({ page }) => {
    await openPage(page);
    await pickCard(page, "Carta dei vini");
    await page.getByRole("button", { name: /^Menu: Carta dei vini/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: /^Menu pranzo/ }).click();
    await expect(page.getByText("Antipasti 1", { exact: true })).toBeVisible();
    await page.goBack();
    await expect(chooser(page)).toBeVisible();
});

test.describe("telefono stretto", () => {
    test.use({ viewport: { width: 320, height: 700 } });

    test("nell'isola il nome del menu resta intero: lo stato dice solo la parola e «2 di 2» esce", async ({ page }) => {
        // Con la copertina l'isola si stacca dai bordi: è il caso più stretto (l'immagine può anche mancare).
        await openPage(page, { query: "?menu=carta-dei-vini", cover: "/e2e-copertina.jpg" });
        const selector = page.getByRole("button", { name: /^Menu: Carta dei vini/ });
        await expect(selector).toHaveAttribute("data-senza-conto", "");
        const name = selector.locator("i");
        await expect(name).toHaveText("Carta dei vini");
        expect(await name.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
        await expect(selector.locator("xpath=following-sibling::button[1]")).toHaveText("Aperto");
    });
});

test.describe("desktop", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("colonna centrale da 640 px, card dei menu affiancate; il selettore apre il foglio sotto di sé", async ({ page }) => {
        await openPage(page);
        // A cascata d'entrata finita.
        await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== "running"));
        const pranzo = await card(page, "Menu pranzo").boundingBox();
        const vini = await card(page, "Carta dei vini").boundingBox();
        expect(pranzo && vini).toBeTruthy();
        expect(Math.abs(pranzo!.y - vini!.y)).toBeLessThan(2);
        expect(vini!.x + vini!.width - pranzo!.x).toBeLessThanOrEqual(641);

        await pickCard(page, "Menu pranzo");
        await page.getByRole("button", { name: /^Menu: Menu pranzo/ }).click();
        await expect(page.getByRole("dialog").getByRole("heading", { name: "Menu disponibili ora" })).toBeVisible();
    });
});
