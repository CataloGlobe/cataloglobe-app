import { expect, test, type Locator, type Page } from "@playwright/test";
import { CATEGORIES, SLUG, featured, stubPublicPage, type FeaturedSlots } from "./publicPageStub";

/**
 * «In evidenza» nella pagina pubblica: vive solo nei caroselli in pagina.
 * Nessun pulsante in barra né in header; oltre 4 contenuti per slot il
 * carosello chiude con «Vedi tutti», che apre l'unica sheet «In evidenza»
 * (elenco → dettaglio con freccia indietro). Tap su una card del carosello =
 * stessa sheet, direttamente sul dettaglio, senza freccia.
 * Pagina servita da stub (`publicPageStub.ts`), senza login.
 */

test.use({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } });

function items(n: number, from = 1) {
    return Array.from({ length: n }, (_, i) =>
        featured({ id: `feat-${from + i}`, title: `Contenuto ${from + i}` })
    );
}

async function openPage(page: Page, slots: FeaturedSlots): Promise<void> {
    await stubPublicPage(page, { ordering: false, featured: slots });
    await page.goto(`/${SLUG}`);
    await expect(page.getByText(`${CATEGORIES[0]} 1`, { exact: true }).first()).toBeVisible({
        timeout: 15_000,
    });
}

function seeAll(page: Page): Locator {
    return page.getByRole("button", { name: /^Vedi tutti i contenuti in evidenza/ });
}

function carousel(page: Page): Locator {
    return page.getByRole("list", { name: "Contenuti in evidenza" }).first();
}

function sheet(page: Page): Locator {
    return page.getByRole("dialog", { name: "In evidenza" });
}

function backButton(page: Page): Locator {
    return sheet(page).getByRole("button", { name: "Torna all'elenco" });
}

test("nessun pulsante «In evidenza» nella barra inferiore", async ({ page }) => {
    await openPage(page, { before_catalog: items(5) });
    const bar = page.getByRole("navigation", { name: "Navigazione", exact: true });
    await expect(bar).toBeVisible();
    await expect(bar.getByRole("button", { name: "In evidenza" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "In evidenza", exact: true })).toHaveCount(0);
});

test("nessun pulsante «In evidenza» nell'header desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openPage(page, { before_catalog: items(5) });
    // L'header c'è (il trigger recensioni resta), «In evidenza» no.
    await expect(page.getByRole("button", { name: "Dicci la tua" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "In evidenza", exact: true })).toHaveCount(0);
});

test("con 4 contenuti nessuna card «Vedi tutti»", async ({ page }) => {
    await openPage(page, { before_catalog: items(4) });
    await expect(carousel(page).getByRole("listitem")).toHaveCount(4);
    await expect(seeAll(page)).toHaveCount(0);
});

test("con 5 contenuti: 4 card + «Vedi tutti» col totale di oggi, deduplicato", async ({ page }) => {
    // Prima del catalogo 5, dopo 2 (uno è un doppione): 6 contenuti diversi.
    await openPage(page, {
        before_catalog: items(5),
        after_catalog: [...items(1, 6), featured({ id: "feat-1", title: "Contenuto 1" })],
    });
    await expect(carousel(page).getByRole("listitem")).toHaveCount(5);
    // Solo lo slot con più di 4 contenuti chiude con la card.
    await expect(seeAll(page)).toHaveCount(1);
    await expect(seeAll(page)).toHaveAccessibleName("Vedi tutti i contenuti in evidenza (6)");
    await expect(seeAll(page)).toContainText("6");
    // I puntini contano anche la card finale.
    await expect(page.getByRole("tab", { name: /^Contenuto \d di 5$/ })).toHaveCount(5);
});

test("«Vedi tutti» → elenco → dettaglio → indietro → chiudi", async ({ page }) => {
    await openPage(page, { before_catalog: items(6) });
    await seeAll(page).scrollIntoViewIfNeeded();
    await seeAll(page).click();

    const dialog = sheet(page);
    await expect(dialog).toBeVisible();
    const list = dialog.getByRole("list", { name: "In evidenza" });
    await expect(list.getByRole("listitem")).toHaveCount(6);
    await expect(backButton(page)).toHaveCount(0);

    // Elenco scrollato: il dettaglio riparte dall'alto.
    const scroller = dialog.locator('[class*="infoSheetContent"]');
    await scroller.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await list.getByRole("listitem").last().click();
    await expect(dialog.getByRole("heading", { name: "Contenuto 6" })).toBeVisible();
    await expect(backButton(page)).toBeVisible();
    expect(await scroller.evaluate(el => el.scrollTop)).toBe(0);
    // Il vecchio link testuale nel corpo non c'è più.
    await expect(dialog.getByText("Torna alla lista")).toHaveCount(0);

    await backButton(page).click();
    await expect(list.getByRole("listitem")).toHaveCount(6);
    await expect(backButton(page)).toHaveCount(0);
    expect(await scroller.evaluate(el => el.scrollTop)).toBe(0);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
});

test("card del carosello → dettaglio senza freccia indietro", async ({ page }) => {
    await openPage(page, { before_catalog: items(5) });
    await carousel(page).getByRole("listitem").first().click();

    const dialog = sheet(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Contenuto 1" })).toBeVisible();
    await expect(backButton(page)).toHaveCount(0);
    await expect(dialog.getByRole("list", { name: "In evidenza" })).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
});

test("CTA visibile senza scroll anche con una descrizione lunga", async ({ page }) => {
    const long = Array.from({ length: 40 }, () => "Una serata lunga da raccontare.").join(" ");
    await openPage(page, {
        before_catalog: [
            featured({
                id: "feat-cta",
                title: "Serata lunga",
                description: long,
                cta_text: "Prenota ora",
                cta_url: "https://example.com/prenota",
            }),
        ],
    });
    // Un solo contenuto: card singola, senza carosello attorno.
    await page.getByRole("listitem").filter({ hasText: "Serata lunga" }).click();

    const dialog = sheet(page);
    await expect(dialog.getByRole("heading", { name: "Serata lunga" })).toBeVisible();
    // Il contenuto scorre, la CTA no: sta nel footer della sheet.
    const scroller = dialog.locator('[class*="infoSheetContent"]');
    expect(await scroller.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    const cta = dialog.getByRole("link", { name: "Prenota ora" });
    await expect(cta).toBeInViewport({ ratio: 1 });
});
