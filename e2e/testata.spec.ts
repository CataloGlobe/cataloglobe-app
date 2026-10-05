import { expect, test, type Locator } from "@playwright/test";
import { openBusinessPage } from "./business";
import { stubAnalitiche } from "./analiticheStub";
import { stubProdotti } from "./prodottiStub";
import { stubRecensioni } from "./recensioniStub";
import { stubStili } from "./stiliStub";

/**
 * La testata di pagina (`PageHeaderSlot`), lotto 6 «cleanup DS».
 *
 * - **Sottotitolo**: le pagine dell'azienda non lo passano più (M1); lo slot
 *   lo disegna ancora per le pagine admin.
 * - **Una sola testata**: quando tab e azioni non stanno in riga, ogni pagina
 *   con tab passa a due righe (azioni sopra, tab sotto) prima della barra
 *   compatta, da 768 in su; sotto 768 sempre la barra compatta. Prima lo faceva solo Programmazione (`condensed.stack`).
 *
 * Scritto prima del cambio: i test del comportamento nuovo nascono in
 * `test.fail` e passano a `test` col commit che li rende veri.
 */

async function stacked(leading: Locator, action: Locator): Promise<void> {
    await expect(leading).toBeVisible();
    await expect(action).toBeVisible();
    // La banda si ridecide quando arrivano i permessi (la CTA allarga le
    // azioni): si aspetta la forma finale invece di leggerla una volta.
    await expect
        .poll(async () => {
            const leadingBox = await leading.boundingBox();
            const actionBox = await action.boundingBox();
            return leadingBox && actionBox ? leadingBox.y - (actionBox.y + actionBox.height) : -1;
        })
        .toBeGreaterThanOrEqual(0);
}

// M1 (correzioni UI, ottobre 2026): niente frase sotto la testata. Le pagine
// dell'azienda non passano più il `subtitle`; la spiegazione sta negli stati vuoti.
test.describe("Testata — niente sottotitolo (M1)", () => {
    test("Analitiche: nessuna frase sotto la testata", async ({ page }) => {
        await stubAnalitiche(page);
        await openBusinessPage(page, "analytics", "Analitiche");
        await expect(page.getByText("Cosa fanno i clienti sulla pagina pubblica.", { exact: true })).toHaveCount(0);
    });

    test("Recensioni: nessuna frase sotto la testata", async ({ page }) => {
        await stubRecensioni(page);
        await openBusinessPage(page, "reviews", "Recensioni");
        await expect(
            page.getByText("Quello che i clienti scrivono dopo essere stati da voi. Lo leggete solo voi: non compare sulla pagina pubblica.", { exact: true })
        ).toHaveCount(0);
    });

    test("Stili: nessuna frase sotto la testata", async ({ page }) => {
        await stubStili(page);
        await openBusinessPage(page, "styles", "Stili");
        await expect(
            page.getByText("Personalizza l'aspetto visivo e i colori del tuo catalogo.", { exact: true })
        ).toHaveCount(0);
    });
});

test.describe("Testata — due righe prima della barra compatta", () => {
    test("Prodotti a 1024: tab sotto le azioni", async ({ page }) => {
        await stubProdotti(page);
        await openBusinessPage(page, "products", "Prodotti");
        await page.setViewportSize({ width: 1024, height: 900 });
        await stacked(page.getByRole("tab", { name: /^Gruppi/ }), page.getByPlaceholder(/^Cerca/).first());
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
            page.getByRole("tab", { name: "Membri" }),
            page.getByRole("button", { name: "Invita membro" }).first()
        );
    });

    // Senza i filtri di stato la testata è più corta: a 1280 sta già su una riga (R1).
    for (const width of [1024]) {
        test(`Recensioni a ${width}: stelle sotto le azioni`, async ({ page }) => {
            await stubRecensioni(page);
            await openBusinessPage(page, "reviews", "Recensioni");
            await page.setViewportSize({ width, height: 900 });
            await stacked(
                page.getByRole("radio", { name: "Tutte" }).first(),
                page.getByPlaceholder("Cerca commenti...")
            );
        });
    }

    for (const width of [1280, 1440]) {
        test(`Recensioni a ${width}: una riga sola`, async ({ page }) => {
            await stubRecensioni(page);
            await openBusinessPage(page, "reviews", "Recensioni");
            await page.setViewportSize({ width, height: 900 });
            const stars = page.getByRole("radio", { name: "Tutte" }).first();
            const search = page.getByPlaceholder("Cerca commenti...");
            await expect(stars).toBeVisible();
            await expect(search).toBeVisible();
            const a = (await stars.boundingBox())!;
            const b = (await search.boundingBox())!;
            expect(Math.abs(a.y + a.height / 2 - (b.y + b.height / 2))).toBeLessThan(4);
        });
    }
});
