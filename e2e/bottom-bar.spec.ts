import { expect, test, type Locator, type Page } from "@playwright/test";
import { CATEGORIES, SLUG, stubPublicPage } from "./publicPageStub";

/**
 * Bottom bar della pagina pubblica, mobile 390×844: tutto o niente.
 * Si nasconde scorrendo giù, ricompare scorrendo su, in cima, a fine pagina,
 * all'aggiunta al carrello, alla chiusura di una sheet e al ritorno sulla
 * scheda; gli scroll programmatici (tap su categoria) non contano.
 * Regole pure in `bottomBarVisibility.ts`; qui il cablaggio sul DOM vero.
 * Pagina servita da stub (`publicPageStub.ts`), senza login.
 */

test.use({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } });

/** Il wrapper della barra: resta nel DOM anche nascosto (inert + aria-hidden). */
function barWrap(page: Page): Locator {
    return page.locator('[class*="barWrap"]');
}

async function expectBarShown(page: Page): Promise<void> {
    await expect(barWrap(page)).not.toHaveAttribute("data-hidden", /.*/);
    await expect(page.getByRole("navigation", { name: "Navigazione", exact: true })).toBeVisible();
}

async function expectBarHidden(page: Page): Promise<void> {
    await expect(barWrap(page)).toHaveAttribute("data-hidden", "true");
    await expect(barWrap(page)).toHaveAttribute("inert", "");
    await expect(page.getByRole("navigation", { name: "Navigazione", exact: true })).toHaveCount(0);
    // Anche lo scrim sparisce: nessun pezzo resta visibile da solo.
    await expect(page.locator('[data-blur][data-hidden]')).toHaveCount(1);
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

async function openPage(page: Page, ordering: boolean): Promise<void> {
    await stubPublicPage(page, { ordering });
    await page.goto(`/${SLUG}`);
    await expect(page.getByText(`${CATEGORIES[0]} 1`, { exact: true }).first()).toBeVisible({
        timeout: 15_000,
    });
    // Fine dell'animazione di entrata della barra.
    await page.waitForTimeout(500);
}

function cartButton(page: Page): Locator {
    return page.getByRole("button", { name: /^Il tuo ordine/ });
}

for (const variant of ["senza ordinazione", "ordinazione, carrello vuoto"] as const) {
    test.describe(`scroll — ${variant}`, () => {
        const ordering = variant !== "senza ordinazione";

        test("cima, giù, su, fine pagina", async ({ page }) => {
            await openPage(page, ordering);
            await expectBarShown(page);
            await expect(cartButton(page)).toHaveCount(ordering ? 1 : 0);

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

        test("sheet aperta congela, chiusa fa ricomparire", async ({ page }) => {
            await openPage(page, ordering);
            await scrollTo(page, 1200);
            await expectBarHidden(page);

            await page.getByText(`${CATEGORIES[1]} 4`, { exact: true }).first().click();
            const sheet = page.getByRole("dialog").last();
            await expect(sheet).toBeVisible();
            await expectBarHidden(page);

            await page.keyboard.press("Escape");
            await expect(sheet).toBeHidden();
            await expectBarShown(page);
            // Il rilascio del body-lock non falsa la posizione: si riparte da lì.
            await scrollTo(page, (await page.evaluate(() => window.scrollY)) + 120);
            await expectBarHidden(page);
        });

        test("tap su categoria non la nasconde, ritorno sulla scheda la mostra", async ({ page }) => {
            await openPage(page, ordering);
            await scrollTo(page, 300);
            await scrollTo(page, 280, 10);
            await expectBarShown(page);

            const nav = page.getByRole("navigation").filter({ hasText: CATEGORIES[3] }).first();
            await nav.getByRole("button", { name: CATEGORIES[3] }).or(nav.getByText(CATEGORIES[3])).first().click();
            await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1500);
            await expectBarShown(page);

            await page.waitForTimeout(1000);
            await scrollTo(page, (await page.evaluate(() => window.scrollY)) - 200, 20);
            await scrollTo(page, (await page.evaluate(() => window.scrollY)) + 100);
            await expectBarHidden(page);

            await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
            await expectBarShown(page);
        });
    });
}

test.describe("ordinazione, carrello pieno", () => {
    test("aggiunta: ricompare, badge col conteggio, poi servono 80px per nasconderla", async ({ page }) => {
        await openPage(page, true);
        await expect(cartButton(page)).toHaveAccessibleName("Il tuo ordine");
        await expect(page.locator('[class*="cartBadge"]')).toHaveCount(0);

        await scrollTo(page, 1000);
        await expectBarHidden(page);

        // Il rimbalzo dura 340ms: lo registra un observer messo prima del tap.
        await page.evaluate(() => {
            const w = window as unknown as { __bumps: number };
            w.__bumps = 0;
            new MutationObserver(records => {
                for (const r of records) {
                    const el = r.target as HTMLElement;
                    if (el.className.includes("cartBadge") && el.getAttribute("data-bump") === "true") w.__bumps++;
                }
            }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-bump"], childList: true });
        });
        const bumps = () => page.evaluate(() => {
            const w = window as unknown as { __bumps: number };
            const now = document.querySelector('[class*="cartBadge"][data-bump="true"]') ? 1 : 0;
            return w.__bumps + now;
        });

        const add = page.getByRole("button", { name: /^Aggiungi alla selezione/ });
        await add.nth(10).click();
        await expectBarShown(page);
        const badge = page.locator('[class*="cartBadge"]');
        await expect(badge).toHaveText("1");
        await expect.poll(bumps).toBeGreaterThan(0);
        await expect(cartButton(page)).toHaveAccessibleName("Il tuo ordine (1)");

        await add.nth(10).click();
        await expect(badge).toHaveText("2");

        const y = await page.evaluate(() => window.scrollY);
        await scrollTo(page, y + 60, 10);
        await expectBarShown(page);
        await scrollTo(page, y + 90, 10);
        await expectBarHidden(page);

        // Ordini apre il carrello se ci sono articoli.
        await scrollTo(page, y + 60, 10);
        await expectBarShown(page);
        await cartButton(page).click();
        const sheet = page.getByRole("dialog").last();
        await expect(sheet).toBeVisible();
        await expect(sheet.getByText(`${CATEGORIES[1]} 3`).first()).toBeVisible();
    });

    test("carrello vuoto: Ordini apre lo storico", async ({ page }) => {
        await openPage(page, true);
        await cartButton(page).click();
        const sheet = page.getByRole("dialog").last();
        await expect(sheet).toBeVisible();
        await expect(sheet.getByText(`${CATEGORIES[1]} 3`)).toHaveCount(0);
    });
});

test.describe("sopra la soglia mobile", () => {
    test.use({ viewport: { width: 1024, height: 800 } });

    test("mai nascosta (la barra non c'è e non riceve data-hidden)", async ({ page }) => {
        await openPage(page, true);
        await scrollTo(page, 1200);
        await expect(barWrap(page)).toBeHidden();
        await expect(barWrap(page)).not.toHaveAttribute("data-hidden", /.*/);
    });
});
