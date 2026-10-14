import { expect, test, type Page } from "@playwright/test";
import { SLUG, stubPublicPage } from "./publicPageStub";

/**
 * Copertina dell'isola nel redesign (D14): con la copertina accesa nello stile
 * ma senza foto della sede, niente blocco vuoto e isola come senza copertina;
 * con la foto, la copertina c'è solo se lo stile la accende.
 * Prende il posto di `header-senza-cover.spec.ts` il giorno dell'accensione
 * (l'header piatto della pagina di oggi nel redesign non esiste).
 *
 * Solo col redesign acceso: `VITE_PUBLIC_REDESIGN=true bash scripts/e2e.sh
 * e2e/copertina-redesign.spec.ts`; senza il flag la spec si salta da sola.
 */

test.use({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } });
test.skip(process.env.VITE_PUBLIC_REDESIGN !== "true", "solo con VITE_PUBLIC_REDESIGN=true");

async function openPage(page: Page, showCoverImage: boolean, cover?: string): Promise<void> {
    await stubPublicPage(page, { ordering: false, cover, styleConfig: { header: { showCoverImage } } });
    await page.goto(`/${SLUG}`);
    await page.getByText("Antipasti 1", { exact: true }).waitFor();
    test.skip((await page.getByRole("button", { name: "Altre opzioni" }).count()) === 0, "pagina senza redesign");
}

const island = (page: Page) => page.locator("header[data-compact]");
const coverImage = (page: Page) => page.locator('img[role="presentation"][fetchpriority="high"]');

test("copertina accesa ma senza foto: niente blocco vuoto, isola senza copertina", async ({ page }) => {
    await openPage(page, true);
    await expect(island(page)).toBeVisible();
    await expect(island(page)).not.toHaveAttribute("data-cover", /.*/);
    await expect(coverImage(page)).toHaveCount(0);
});

test("con la foto: copertina solo se lo stile la accende", async ({ page }) => {
    await openPage(page, true, "/e2e-copertina.jpg");
    await expect(island(page)).toHaveAttribute("data-cover", "true");
    await expect(coverImage(page)).toHaveCount(1);

    await openPage(page, false, "/e2e-copertina.jpg");
    await expect(island(page)).not.toHaveAttribute("data-cover", /.*/);
    await expect(coverImage(page)).toHaveCount(0);
});
