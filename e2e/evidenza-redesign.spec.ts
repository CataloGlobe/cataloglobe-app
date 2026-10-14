import { expect, test, type Page } from "@playwright/test";
import { SLUG, featured, stubPublicPage } from "./publicPageStub";

/**
 * «In evidenza» nel redesign della pagina pubblica (PR 7, spec §9): carosello C
 * nella pagina, elenco e dettaglio nel foglio unico. Pagina servita da stub,
 * senza login.
 *
 * Solo col redesign acceso: `VITE_PUBLIC_REDESIGN=true bash scripts/e2e.sh
 * e2e/evidenza-redesign.spec.ts`. Con un server sulla 5174 riusato senza il flag la
 * spec si salta da sola.
 */

test.use({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } });
test.skip(process.env.VITE_PUBLIC_REDESIGN !== "true", "solo con VITE_PUBLIC_REDESIGN=true");

const contents = (n: number) =>
    Array.from({ length: n }, (_, i) =>
        featured({
            id: `feat-${i}`,
            title: `Serata ${i + 1}`,
            subtitle: i === 0 ? "Ogni giovedì" : null,
            content_type: i === 0 ? "event" : "promo",
            ...(i === 1 ? { cta_text: "Scopri", cta_url: "https://example.com" } : {})
        })
    );

async function open(page: Page, n: number) {
    await stubPublicPage(page, { ordering: false, featured: { before_catalog: contents(n) } });
    await page.goto(`/${SLUG}`);
    await page.getByText("Antipasti 1", { exact: true }).waitFor();
    test.skip((await page.getByRole("button", { name: "Altre opzioni" }).count()) === 0, "pagina senza redesign");
    return page.getByRole("list", { name: "Contenuti in evidenza" });
}

test("oltre 5: cinque card, la successiva di lato, «Altri N · Vedi tutti (N)»", async ({ page }) => {
    const strip = await open(page, 7);
    await expect(strip.getByRole("listitem")).toHaveCount(6);
    await expect(strip.getByRole("listitem").first()).toHaveAttribute("aria-label", "Evento: Serata 1. Ogni giovedì. 1 di 7");
    const peek = await strip.evaluate(el => Math.round(window.innerWidth - (el.children[1] as HTMLElement).getBoundingClientRect().left));
    expect(peek).toBeGreaterThan(40);
    expect(peek).toBeLessThan(70);
    await expect(strip.getByRole("button", { name: /Altri 2\s*Vedi tutti \(7\)/ })).toBeVisible();
});

test("da 2 a 5: tutte, senza «Vedi tutti»; uno solo: card a tutta larghezza", async ({ page }) => {
    const strip = await open(page, 5);
    await expect(strip.getByRole("listitem")).toHaveCount(5);
    await expect(page.getByRole("button", { name: /Vedi tutti/ })).toHaveCount(0);

    const single = await open(page, 1);
    await expect(single.getByRole("listitem")).toHaveCount(1);
    const box = await single.getByRole("listitem").boundingBox();
    expect(Math.round(box?.width ?? 0)).toBe(390 - 32);
});

test("«Vedi tutti» apre l'elenco, il dettaglio entra a spinta con «‹ In evidenza» e la CTA in fondo", async ({ page }) => {
    await open(page, 7);
    const dialog = page.getByRole("dialog");
    await page.getByRole("button", { name: /Vedi tutti \(7\)/ }).click();
    await expect(dialog.getByRole("heading", { name: "In evidenza" })).toBeVisible();
    await dialog.getByRole("listitem").nth(1).click();
    await expect(dialog.getByRole("heading", { name: "Promo" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Torna a In evidenza" })).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Scopri" })).toBeVisible();
    await dialog.getByRole("button", { name: "Torna a In evidenza" }).click();
    await expect(dialog.getByRole("heading", { name: "In evidenza" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
});

test("tornando dal dettaglio con «‹» l'elenco è dov'era (D99)", async ({ page }) => {
    await open(page, 12);
    const dialog = page.getByRole("dialog");
    await page.getByRole("button", { name: /Vedi tutti \(12\)/ }).click();
    await expect(dialog.getByRole("heading", { name: "In evidenza" })).toBeVisible();
    const last = dialog.getByRole("listitem").last();
    await last.scrollIntoViewIfNeeded();
    const scroller = dialog.locator("[class*='page']").first();
    const scrolledTo = await scroller.evaluate(el => el.scrollTop);
    expect(scrolledTo).toBeGreaterThan(0);

    await last.click();
    const back = dialog.getByRole("button", { name: "Torna a In evidenza" });
    await expect(back).toBeVisible();
    await back.click();
    await expect(dialog.getByRole("heading", { name: "In evidenza" })).toBeVisible();
    await expect(last).toBeInViewport();
    expect(await scroller.evaluate(el => el.scrollTop)).toBe(scrolledTo);
});

test("la card apre il dettaglio da solo, senza elenco sotto", async ({ page }) => {
    const strip = await open(page, 3);
    await strip.getByRole("listitem").first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Evento" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Serata 1" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Torna a/ })).toHaveCount(0);
});

test("i due posti senza doppioni: «Vedi tutti» conta 7, solo il primo posto chiude la striscia", async ({ page }) => {
    // «Serata 6» (feat-5) è in tutti e due i posti: si conta una volta sola.
    await stubPublicPage(page, {
        ordering: false,
        featured: {
            before_catalog: contents(6),
            after_catalog: [featured({ id: "feat-5", title: "Serata 6" }), featured({ id: "extra", title: "Extra" })]
        }
    });
    await page.goto(`/${SLUG}`);
    await page.getByText("Antipasti 1", { exact: true }).waitFor();
    test.skip((await page.getByRole("button", { name: "Altre opzioni" }).count()) === 0, "pagina senza redesign");
    const strips = page.getByRole("list", { name: "Contenuti in evidenza" });
    await expect(strips).toHaveCount(2);
    await expect(strips.first().getByRole("button", { name: /Altri 2\s*Vedi tutti \(7\)/ })).toBeVisible();
    await expect(strips.last().getByRole("listitem")).toHaveCount(2);
    await expect(strips.last().getByRole("button", { name: /Vedi tutti/ })).toHaveCount(0);
    await strips.first().getByRole("button", { name: /Vedi tutti \(7\)/ }).click();
    await expect(page.getByRole("dialog").getByRole("listitem")).toHaveCount(7);
});

test("con una descrizione lunga la CTA del dettaglio si vede senza scorrere", async ({ page }) => {
    await stubPublicPage(page, {
        ordering: false,
        featured: {
            before_catalog: [
                featured({
                    id: "lungo",
                    title: "Serata lunga",
                    description: "Una descrizione molto lunga della serata, riga dopo riga. ".repeat(60),
                    cta_text: "Prenota ora",
                    cta_url: "https://example.com/prenota"
                })
            ]
        }
    });
    await page.goto(`/${SLUG}`);
    await page.getByText("Antipasti 1", { exact: true }).waitFor();
    test.skip((await page.getByRole("button", { name: "Altre opzioni" }).count()) === 0, "pagina senza redesign");
    await page.getByRole("list", { name: "Contenuti in evidenza" }).getByRole("listitem").first().click();
    const dialog = page.getByRole("dialog");
    const text = dialog.getByText(/^Una descrizione molto lunga/);
    await expect(text).toBeVisible();
    // Il testo va oltre lo schermo, la CTA no.
    expect(await text.evaluate(el => el.getBoundingClientRect().bottom > window.innerHeight)).toBe(true);
    await expect(dialog.getByRole("link", { name: "Prenota ora" })).toBeInViewport({ ratio: 1 });
});

for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 }
]) {
    test.describe(`${viewport.width}px`, () => {
        test.use({ viewport });

        test("nessun pulsante «In evidenza» nella barra né nell'isola", async ({ page }) => {
            await stubPublicPage(page, { ordering: true, story: true, featured: { before_catalog: contents(6) } });
            await page.goto(`/${SLUG}`);
            await page.getByText("Antipasti 1", { exact: true }).waitFor();
            test.skip((await page.getByRole("button", { name: "Altre opzioni" }).count()) === 0, "pagina senza redesign");
            await expect(page.getByRole("list", { name: "Contenuti in evidenza" })).toBeVisible();
            // Prima isola e barra a vista, poi i conteggi a zero: non passano a vuoto.
            await expect(page.getByRole("button", { name: "Altre opzioni" })).toBeVisible();
            if (viewport.width < 768) {
                await expect(page.getByRole("navigation", { name: "Navigazione", exact: true })).toBeVisible();
            }
            await expect(page.getByRole("button", { name: /in evidenza/i })).toHaveCount(0);
            await expect(page.getByRole("link", { name: /in evidenza/i })).toHaveCount(0);
        });
    });
}
