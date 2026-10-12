import { expect, test, type Page } from "@playwright/test";
import { CATEGORIES, SLUG, stubPublicPage } from "./publicPageStub";

/**
 * Header compatto della pagina pubblica senza immagine di copertina
 * (Notion P1 «Correggere l'header compatto senza immagine», demo del 2026-10-06).
 * Senza foto sotto, l'header parte già nello stato finale dello scroll: a tutta
 * larghezza, attaccato in cima, senza raggio, e non cambia al primo scroll.
 * Pagina servita da stub (`publicPageStub.ts`, `cover_image: null`), senza login.
 */

test.use({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } });

async function headerShape(page: Page) {
    return page.locator('header[data-flat="true"]').evaluate(el => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
            x: Math.round(r.x),
            y: Math.round(r.y),
            width: Math.round(r.width),
            radius: cs.borderTopLeftRadius,
            inlineStyle: el.getAttribute("style"),
        };
    });
}

test("senza cover l'header è piatto da subito e resta uguale scorrendo", async ({ page }) => {
    await stubPublicPage(page, { ordering: false, styleConfig: { header: { showCoverImage: false } } });
    await page.goto(`/${SLUG}`);
    await expect(page.getByText(`${CATEGORIES[0]} 1`, { exact: true }).first()).toBeVisible({
        timeout: 15_000,
    });

    const atRest = await headerShape(page);
    expect(atRest).toEqual({ x: 0, y: 0, width: 390, radius: "0px", inlineStyle: null });

    await page.evaluate(() => window.scrollTo(0, 300));
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

    const scrolled = await headerShape(page);
    expect(scrolled).toEqual(atRest);
});

test("copertina accesa ma senza foto: in pubblico niente blocco vuoto, header piatto (D14)", async ({ page }) => {
    await stubPublicPage(page, { ordering: false, styleConfig: { header: { showCoverImage: true } } });
    await page.goto(`/${SLUG}`);
    await expect(page.getByText(`${CATEGORIES[0]} 1`, { exact: true }).first()).toBeVisible({
        timeout: 15_000,
    });

    // Lo stub ha `cover_image: null`: la copertina è accesa nello stile ma la foto manca.
    await expect(page.locator('header[data-cover="true"]')).toHaveCount(0);
    const atRest = await headerShape(page);
    expect(atRest).toEqual({ x: 0, y: 0, width: 390, radius: "0px", inlineStyle: null });
});
