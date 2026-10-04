import { expect, test, type Locator, type Page } from "@playwright/test";
import { IDLE_REVEAL_MS } from "../src/components/PublicCollectionView/hooks/bottomBarVisibility";
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
        // 60px giù (meno di 80) non bastano; oltre 80 sì. Margine sopra la
        // soglia: il primo evento dopo la ricomparsa fa da riferimento e, se
        // due eventi cadono nello stesso frame, conta per 20px invece di 10.
        await scrollTo(page, y + 60, 10);
        await expectBarShown(page);
        await scrollTo(page, y + 110, 10);
        await expectBarHidden(page);

        // Ordini apre il carrello se ci sono articoli.
        await scrollTo(page, y + 90, 10);
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

type Frame = { tag: "hide" | "show"; t: number; ty: number; op: number; vis: string };

/** Registra transform (translateY) e opacity della barra a ogni frame, per
 *  450ms da ogni cambio di `data-hidden`. */
async function recordFrames(page: Page): Promise<() => Promise<Frame[]>> {
    await page.evaluate(() => {
        const el = document.querySelector('[class*="barWrap"]') as HTMLElement;
        const w = window as unknown as { __frames: unknown[] };
        w.__frames = [];
        new MutationObserver(() => {
            const t0 = performance.now();
            const tag = el.hasAttribute("data-hidden") ? "hide" : "show";
            const tick = () => {
                const cs = getComputedStyle(el);
                const m = cs.transform === "none" ? 0 : Number(cs.transform.split(",")[5]?.replace(")", "") ?? 0);
                w.__frames.push({ tag, t: performance.now() - t0, ty: m, op: Number(cs.opacity), vis: cs.visibility });
                if (performance.now() - t0 < 450) requestAnimationFrame(tick);
            };
            tick();
        }).observe(el, { attributes: true, attributeFilter: ["data-hidden"] });
    });
    return () => page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames);
}

function settledAt(frames: Frame[], done: (f: Frame) => boolean): number {
    const first = frames.find(done);
    return first ? first.t : Infinity;
}

test.describe("animazione di uscita e entrata", () => {
    for (const reducedMotion of ["no-preference", "reduce"] as const) {
        test(`valori intermedi per frame — ${reducedMotion}`, async ({ page }) => {
            await page.emulateMedia({ reducedMotion });
            await openPage(page, true);
            const frames = await recordFrames(page);

            await scrollTo(page, 900);
            await expectBarHidden(page);
            await page.waitForTimeout(500);
            await scrollTo(page, 880, 4);
            await expectBarShown(page);
            await page.waitForTimeout(500);

            const all = await frames();
            const hide = all.filter(f => f.tag === "hide");
            const show = all.filter(f => f.tag === "show");
            const midOpacity = (fs: Frame[]) => fs.filter(f => f.op > 0.05 && f.op < 0.95).length;

            expect(midOpacity(hide)).toBeGreaterThanOrEqual(3);
            expect(midOpacity(show)).toBeGreaterThanOrEqual(3);
            // Durante l'uscita resta visibile; `visibility: hidden` solo a fine corsa.
            expect(hide.filter(f => f.op > 0.05).every(f => f.vis === "visible")).toBe(true);
            expect(hide.at(-1)?.vis).toBe("hidden");
            // All'entrata torna visibile da subito.
            expect(show[1]?.vis).toBe("visible");

            if (reducedMotion === "reduce") {
                expect(all.every(f => f.ty === 0)).toBe(true);
                expect(settledAt(hide, f => f.op === 0)).toBeLessThan(260);
                expect(settledAt(show, f => f.op === 1)).toBeLessThan(260);
            } else {
                const travel = Math.max(...hide.map(f => f.ty));
                expect(travel).toBeGreaterThan(50);
                expect(hide.filter(f => f.ty > 2 && f.ty < travel - 2).length).toBeGreaterThanOrEqual(3);
                expect(show.filter(f => f.ty > 2 && f.ty < travel - 2).length).toBeGreaterThanOrEqual(3);
                // Uscita ~220ms, entrata ~280ms (margine per il campionamento).
                const hideEnd = settledAt(hide, f => f.op === 0);
                const showEnd = settledAt(show, f => f.op === 1 && f.ty === 0);
                expect(hideEnd).toBeGreaterThan(150);
                expect(hideEnd).toBeLessThan(330);
                expect(showEnd).toBeGreaterThan(hideEnd);
                expect(showEnd).toBeLessThan(400);
            }
        });
    }
});

test.describe("ricomparsa da fermo", () => {
    test(`nascosta e ferma: torna dopo ${IDLE_REVEAL_MS}ms`, async ({ page }) => {
        await openPage(page, true);
        await scrollTo(page, 900);
        // Tempi misurati nella pagina dall'ultimo scroll, non dal runner:
        // i round-trip di Playwright sotto carico mangerebbero la tolleranza.
        const seen = await page.evaluate(async idle => {
            const el = document.querySelector('[class*="barWrap"]') as HTMLElement;
            const hidden = () => el.hasAttribute("data-hidden");
            const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
            window.scrollTo(0, window.scrollY + 20);
            await wait(100);
            const before = hidden();
            await wait(idle - 400);
            const justBefore = hidden();
            await wait(800);
            return { before, justBefore, after: hidden() };
        }, IDLE_REVEAL_MS);
        expect(seen).toEqual({ before: true, justBefore: true, after: false });
        await expectBarShown(page);
    });

    test("ogni scroll azzera il conto", async ({ page }) => {
        await openPage(page, true);
        await scrollTo(page, 900);
        await expectBarHidden(page);
        const seen = await page.evaluate(async idle => {
            const el = document.querySelector('[class*="barWrap"]') as HTMLElement;
            const hidden = () => el.hasAttribute("data-hidden");
            const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
            const states: boolean[] = [];
            // Uno scroll piccolo ogni (idle - 500)ms, per tre volte: mai fermi abbastanza.
            for (let i = 0; i < 3; i++) {
                window.scrollTo(0, window.scrollY + 20);
                await wait(idle - 500);
                states.push(hidden());
            }
            await wait(idle + 300);
            states.push(hidden());
            return states;
        }, IDLE_REVEAL_MS);
        expect(seen).toEqual([true, true, true, false]);
    });

    test("non vale con una sheet aperta", async ({ page }) => {
        await openPage(page, true);
        await scrollTo(page, 1200);
        await expectBarHidden(page);
        await page.getByText(`${CATEGORIES[1]} 4`, { exact: true }).first().click();
        await expect(page.getByRole("dialog").last()).toBeVisible();
        await page.waitForTimeout(IDLE_REVEAL_MS + 500);
        await expectBarHidden(page);
    });

    test("non vale per uno scroll programmatico", async ({ page }) => {
        await openPage(page, true);
        await scrollTo(page, 600);
        await expectBarHidden(page);
        const nav = page.getByRole("navigation").filter({ hasText: CATEGORIES[3] }).first();
        await nav.getByText(CATEGORIES[3]).first().click();
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1500);
        await page.waitForTimeout(IDLE_REVEAL_MS + 800);
        await expectBarHidden(page);
    });
});
