import { expect, test, type Locator, type Page } from "@playwright/test";
import { SLUG, stubPublicPage } from "./publicPageStub";

/**
 * Barra in basso del redesign, telefono 390×844: tutto o niente, con le stesse
 * regole della pagina di oggi (hook condiviso `useBottomBarAutoHide`, regole
 * pure in `bottomBarVisibility.ts`). Si nasconde scorrendo giù, ricompare
 * scorrendo su, in cima, a fine pagina, all'aggiunta al carrello e alla
 * chiusura di un foglio; sopra la soglia del telefono non c'è.
 * Prende il posto di `bottom-bar.spec.ts` il giorno dell'accensione.
 *
 * Solo col redesign acceso: `VITE_PUBLIC_REDESIGN=true bash scripts/e2e.sh
 * e2e/barra-redesign.spec.ts`; senza il flag la spec si salta da sola.
 */

test.use({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } });
test.skip(process.env.VITE_PUBLIC_REDESIGN !== "true", "solo con VITE_PUBLIC_REDESIGN=true");

/** Il contenitore della barra: resta nel DOM anche nascosto (inert + aria-hidden),
 *  quindi lo si cerca dal pulsante dell'ordine, non per ruolo. */
const barWrap = (page: Page): Locator => page.locator("div:has(> button[aria-label^='Il tuo ordine'])");
const cart = (page: Page) => page.getByRole("button", { name: /^Il tuo ordine/ });

async function expectBarShown(page: Page): Promise<void> {
    await expect(barWrap(page)).not.toHaveAttribute("data-hidden", /.*/);
    await expect(cart(page)).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navigazione", exact: true })).toBeVisible();
}

async function expectBarHidden(page: Page): Promise<void> {
    await expect(barWrap(page)).toHaveAttribute("data-hidden", "true");
    await expect(barWrap(page)).toHaveAttribute("inert", "");
    await expect(cart(page)).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Navigazione", exact: true })).toHaveCount(0);
}

/** Scroll a passi (eventi distinti, come un dito), fino a `to`. */
async function scrollTo(page: Page, to: number, step = 40): Promise<void> {
    await page.evaluate(
        async ([target, s]) => {
            const frame = () => new Promise(r => requestAnimationFrame(() => r(null)));
            let y = window.scrollY;
            while (Math.abs(target - y) > 0) {
                y = target > y ? Math.min(target, y + s) : Math.max(target, y - s);
                window.scrollTo(0, y);
                await frame();
            }
            await frame();
        },
        [to, step] as const
    );
}

async function openPage(page: Page): Promise<void> {
    await stubPublicPage(page, { ordering: true, story: true });
    await page.goto(`/${SLUG}`);
    await page.getByText("Antipasti 1", { exact: true }).waitFor();
    test.skip((await page.getByRole("button", { name: "Altre opzioni" }).count()) === 0, "pagina senza redesign");
    // Fine dell'animazione di entrata della barra.
    await page.waitForTimeout(500);
}

test("cima, giù, su, fine pagina", async ({ page }) => {
    await openPage(page);
    await expectBarShown(page);

    // Entro 120px dalla cima resta visibile anche scorrendo giù.
    await scrollTo(page, 110, 10);
    await expectBarShown(page);

    await scrollTo(page, 900);
    await expectBarHidden(page);

    // 8px su non bastano, 12 sì.
    await scrollTo(page, 892, 4);
    await expectBarHidden(page);
    await scrollTo(page, 880, 4);
    await expectBarShown(page);

    await scrollTo(page, 1400);
    await expectBarHidden(page);
    const end = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    await scrollTo(page, end, 200);
    await expectBarShown(page);

    await scrollTo(page, 1400, 200);
    await scrollTo(page, 60, 400);
    await expectBarShown(page);
});

test("un foglio aperto la tiene com'è, chiuso la fa ricomparire", async ({ page }) => {
    await openPage(page);
    await scrollTo(page, 1200);
    await expectBarHidden(page);

    await page.getByText("Secondi 4", { exact: true }).first().click();
    const sheet = page.getByRole("dialog", { name: "Secondi 4" });
    await expect(sheet).toBeVisible();
    await expectBarHidden(page);

    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expectBarShown(page);
    // Si riparte da lì: dopo la ricomparsa basta scorrere giù per nasconderla.
    await scrollTo(page, (await page.evaluate(() => window.scrollY)) + 200);
    await expectBarHidden(page);
});

test("l'aggiunta al carrello la fa ricomparire, col conto", async ({ page }) => {
    await openPage(page);
    await scrollTo(page, 1200);
    await expectBarHidden(page);

    // Il + della lista aggiunge subito, senza foglio.
    const plus = page.getByRole("button", { name: "Aggiungi alla selezione" });
    await plus.nth((await plus.count()) - 1).click();
    await expectBarShown(page);
    await expect(cart(page)).toHaveAccessibleName("Il tuo ordine (1)");
});

test.describe("sopra la soglia del telefono", () => {
    test.use({ viewport: { width: 1024, height: 800 } });

    test("la barra non c'è e scorrendo non riceve data-hidden", async ({ page }) => {
        await openPage(page);
        await scrollTo(page, 1200);
        await expect(barWrap(page)).toBeHidden();
        await expect(barWrap(page)).not.toHaveAttribute("data-hidden", /.*/);
    });
});
