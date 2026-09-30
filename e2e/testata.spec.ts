import { expect, test, type Locator, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";
import { stubAnalitiche } from "./analiticheStub";
import { stubProdotti } from "./prodottiStub";
import { stubRecensioni } from "./recensioniStub";
import { stubStili } from "./stiliStub";

/**
 * La testata di pagina (`PageHeaderSlot`), lotto 6 «cleanup DS».
 *
 * - **Sottotitolo**: `usePageHeader({ subtitle })` si vede, sopra la banda.
 *   Prima lo slot lo ignorava (§50.14, dev. 4).
 * - **Una sola testata**: quando tab e azioni non stanno in riga, ogni pagina
 *   con tab passa a due righe (azioni sopra, tab sotto) prima della barra
 *   compatta, da 768 in su; sotto 768 sempre la barra compatta. Prima lo faceva solo Programmazione (`condensed.stack`).
 *
 * Scritto prima del cambio: i test del comportamento nuovo nascono in
 * `test.fail` e passano a `test` col commit che li rende veri.
 */

async function stacked(page: Page, leading: Locator, action: Locator): Promise<void> {
    await expect(leading).toBeVisible();
    await expect(action).toBeVisible();
    const leadingBox = (await leading.boundingBox())!;
    const actionBox = (await action.boundingBox())!;
    expect(leadingBox.y).toBeGreaterThanOrEqual(actionBox.y + actionBox.height);
}

test.describe("Testata — sottotitolo", () => {
    test("Analitiche: il sottotitolo del mockup", async ({ page }) => {
        await stubAnalitiche(page);
        await openBusinessPage(page, "analytics", "Analitiche");
        await expect(page.getByText("Cosa fanno i clienti sulla pagina pubblica.", { exact: true })).toBeVisible({
            timeout: 15_000
        });
    });

    test("Recensioni: il sottotitolo del mockup", async ({ page }) => {
        await stubRecensioni(page);
        await openBusinessPage(page, "reviews", "Recensioni");
        await expect(
            page.getByText("Quello che i clienti scrivono dopo essere stati da voi.", { exact: true })
        ).toBeVisible({ timeout: 15_000 });
    });

    test("Stili: il sottotitolo che la pagina passava già", async ({ page }) => {
        await stubStili(page);
        await openBusinessPage(page, "styles", "Stili");
        await expect(
            page.getByText("Personalizza l'aspetto visivo e i colori del tuo catalogo.", { exact: true })
        ).toBeVisible({ timeout: 15_000 });
    });

    test("a 375 il sottotitolo va a capo, senza scroll di lato", async ({ page }) => {
        await stubRecensioni(page);
        await openBusinessPage(page, "reviews", "Recensioni");
        await page.setViewportSize({ width: 375, height: 800 });
        const subtitle = page.getByText("Quello che i clienti scrivono dopo essere stati da voi.", { exact: true });
        await expect(subtitle).toBeVisible({ timeout: 15_000 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
});

test.describe("Testata — due righe prima della barra compatta", () => {
    test("Prodotti a 1024: tab sotto le azioni", async ({ page }) => {
        await stubProdotti(page);
        await openBusinessPage(page, "products", "Prodotti");
        await page.setViewportSize({ width: 1024, height: 900 });
        await stacked(page, page.getByRole("tab", { name: /^Gruppi/ }), page.getByPlaceholder(/^Cerca/).first());
    });

    test("Prodotti: a 768 le tab a vista, a 375 la barra compatta", async ({ page }) => {
        await stubProdotti(page);
        await openBusinessPage(page, "products", "Prodotti");
        await page.setViewportSize({ width: 768, height: 900 });
        await expect(page.getByRole("tab", { name: /^Gruppi/ })).toBeVisible();
        await page.setViewportSize({ width: 375, height: 800 });
        await expect(page.getByRole("tab", { name: /^Gruppi/ })).toBeHidden();
    });

    test("Team a 1024: tab sotto le azioni", async ({ page }) => {
        await openBusinessPage(page, "team", "Team");
        await page.setViewportSize({ width: 1024, height: 900 });
        await stacked(
            page,
            page.getByRole("tab", { name: "Membri" }),
            page.getByRole("button", { name: "Invita membro" }).first()
        );
    });

    for (const width of [1024, 1280]) {
        test(`Recensioni a ${width}: stelle sotto le azioni`, async ({ page }) => {
            await stubRecensioni(page);
            await openBusinessPage(page, "reviews", "Recensioni");
            await page.setViewportSize({ width, height: 900 });
            await stacked(
                page,
                page.getByRole("radio", { name: "Tutte" }).first(),
                page.getByPlaceholder("Cerca commenti...")
            );
        });
    }

    test("Recensioni a 1440: una riga sola", async ({ page }) => {
        await stubRecensioni(page);
        await openBusinessPage(page, "reviews", "Recensioni");
        await page.setViewportSize({ width: 1440, height: 900 });
        const stars = page.getByRole("radio", { name: "Tutte" }).first();
        const search = page.getByPlaceholder("Cerca commenti...");
        await expect(stars).toBeVisible();
        await expect(search).toBeVisible();
        const a = (await stars.boundingBox())!;
        const b = (await search.boundingBox())!;
        expect(Math.abs(a.y + a.height / 2 - (b.y + b.height / 2))).toBeLessThan(4);
    });
});
