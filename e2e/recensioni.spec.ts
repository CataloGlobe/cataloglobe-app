import { expect, test, type Locator, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";
import { REVIEW, stubRecensioni, type RecensioniStub } from "./recensioniStub";

/**
 * Recensioni (lotto `ds-5-coda`, P0). Scritto sulla pagina di **oggi**, prima
 * di ricomporla: deve restare verde passo dopo passo. Dove un controllo
 * cambierà nei passi successivi il locator accetta quello di oggi e quello di
 * domani (l'eliminazione: conferma nella riga oggi, ConfirmDialog domani); lo
 * stato d'errore è `test.fail` finché il passo non lo porta.
 *
 * Dati finti in `recensioniStub.ts` (tutte le sedi, orologio fermo a
 * mercoledì 23/09/2026); permessi, azienda e sidebar veri.
 */

function main(page: Page) {
    return page.getByRole("main");
}

async function openPage(page: Page): Promise<void> {
    await openBusinessPage(page, "reviews", "Recensioni");
    await expect(main(page).getByText("Pizza ottima e2e, torneremo.")).toBeVisible({ timeout: 15_000 });
}

function comments(page: Page): Promise<string[]> {
    return main(page).getByText(/^(Pizza ottima|Servizio lento|Tiramisù da provare|Freddo) e2e/).allTextContents();
}

/**
 * Un filtro della testata: il controllo comodo se c'è, altrimenti il bottone
 * della barra compatta («Periodo: …. Cambia filtro») e l'opzione nel suo elenco.
 */
async function chooseFilter(page: Page, comfy: Locator, compactLabel: string, option: RegExp, comfyValue?: string): Promise<void> {
    if (await comfy.isVisible().catch(() => false)) {
        if (comfyValue !== undefined) await comfy.selectOption(comfyValue);
        else await comfy.click();
        return;
    }
    // Il bottone compatto dice «Filtra per periodo» a filtro vuoto, «Periodo: …» dopo.
    await page.getByRole("button", { name: new RegExp(`^(Filtra per ${compactLabel.toLowerCase()}|${compactLabel}:)`) }).click();
    await page.getByRole("option", { name: option }).click();
}

/** Ricerca in testata: il campo, o la lente della barra compatta. */
async function search(page: Page, text: string): Promise<void> {
    const field = page.getByPlaceholder(/^Cerca/).filter({ visible: true }).first();
    if (!(await field.isVisible().catch(() => false))) {
        await page.getByRole("button", { name: "Cerca", exact: true }).click();
    }
    await field.fill(text);
}

async function noSideScroll(page: Page): Promise<void> {
    const overflow = await page.evaluate(() => {
        const de = document.documentElement;
        const scrollers = [de, ...Array.from(document.querySelectorAll<HTMLElement>("main"))];
        return Math.max(...scrollers.map(el => el.scrollWidth - el.clientWidth));
    });
    expect(overflow).toBeLessThanOrEqual(0);
}

let stub: RecensioniStub;

test.describe("Recensioni", () => {
    test.beforeEach(async ({ page }) => {
        stub = await stubRecensioni(page);
    });

    test("riepilogo: media, totale e distribuzione", async ({ page }) => {
        await openPage(page);
        // (5 + 2 + 4 + 5 + 1) / 5 = 3,4
        await expect(main(page).getByText(/^3[.,]4$/).first()).toBeVisible();
        await expect(main(page).getByText(/5 recensioni/).first()).toBeVisible();
    });

    test("elenco dal più recente, sede e «Nessun commento»", async ({ page }) => {
        await openPage(page);
        expect(await comments(page)).toEqual([
            "Pizza ottima e2e, torneremo.",
            "Servizio lento e2e, un'ora per il secondo.",
            "Tiramisù da provare e2e",
            "Freddo e2e"
        ]);
        await expect(main(page).getByText("Nessun commento")).toBeVisible();
        await expect(main(page).getByText("Porto e2e").first()).toBeVisible();
    });

    test("filtro per stelle", async ({ page }) => {
        await openPage(page);
        await chooseFilter(page, page.getByRole("radio", { name: /^1$/ }), "Valutazione", /^1 stella$/);
        expect(await comments(page)).toEqual(["Freddo e2e"]);
    });

    test("ricerca nei commenti", async ({ page }) => {
        await openPage(page);
        await search(page, "tiramisù");
        expect(await comments(page)).toEqual(["Tiramisù da provare e2e"]);
    });

    test("periodo: ultimi 7 giorni", async ({ page }) => {
        await openPage(page);
        await chooseFilter(page, page.getByRole("combobox", { name: "Filtra per periodo" }), "Periodo", /Ultimi 7 giorni/, "7d");
        await expect(main(page).getByText("Freddo e2e")).toHaveCount(0);
        expect(await comments(page)).toEqual(["Pizza ottima e2e, torneremo.", "Servizio lento e2e, un'ora per il secondo."]);
    });

    test("ordinamento per voto più alto", async ({ page }) => {
        await openPage(page);
        await chooseFilter(page, page.getByRole("combobox", { name: "Ordina recensioni" }), "Ordinamento", /Voto (↑|più alto)/, "ratingDesc");
        const list = await comments(page);
        expect(list[list.length - 1]).toBe("Freddo e2e");
        expect(list.slice(0, 2).sort()).toEqual(["Pizza ottima e2e, torneremo.", "Tiramisù da provare e2e"]);
    });

    test("eliminare chiede conferma, poi toglie la riga", async ({ page }) => {
        stub.onWrite("reviews.DELETE", () => [{ id: REVIEW.lento }]);
        await openPage(page);
        const row = main(page).getByText("Servizio lento e2e, un'ora per il secondo.").locator("xpath=ancestor::*[.//button[@aria-label='Elimina recensione' or starts-with(@aria-label,'Azioni')]][1]");
        await row.getByRole("button", { name: /Elimina recensione|^Azioni/ }).click();
        const menuItem = page.getByRole("menuitem", { name: "Elimina" });
        if (await menuItem.isVisible().catch(() => false)) await menuItem.click();
        expect(stub.writes.filter(w => w.key === "reviews.DELETE")).toHaveLength(0);
        await page.getByRole("button", { name: "Elimina", exact: true }).last().click();
        await expect(page.getByText("Recensione eliminata")).toBeVisible();
        await expect(main(page).getByText("Servizio lento e2e, un'ora per il secondo.")).toHaveCount(0);
        expect(stub.writes.find(w => w.key === "reviews.DELETE")?.params.get("id")).toBe(`eq.${REVIEW.lento}`);
    });

    test("senza reviews.delete: niente elimina", async ({ page }) => {
        await stub.revoke("reviews.delete");
        await openPage(page);
        await stub.revoked;
        await expect(main(page).getByRole("button", { name: /Elimina recensione|^Azioni/ })).toHaveCount(0);
    });

    test("senza lettura: la pagina è bloccata", async ({ page }) => {
        await stub.revoke("reviews.read");
        await openBusinessPage(page, "overview", "Panoramica");
        await page.goto(page.url().replace(/\/overview$/, "/reviews"));
        await stub.revoked;
        await expect(main(page).getByText("Non hai accesso a questa sezione")).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByText("Pizza ottima e2e, torneremo.")).toHaveCount(0);
    });

    test("a 375 nessuno scroll orizzontale", async ({ page }) => {
        await openPage(page);
        await page.setViewportSize({ width: 375, height: 800 });
        await expect(main(page).getByText("Pizza ottima e2e, torneremo.")).toBeVisible();
        await noSideScroll(page);
    });
});

test.describe("Recensioni — vuoto ed errore", () => {
    test("nessuna recensione", async ({ page }) => {
        stub = await stubRecensioni(page, { empty: true });
        await openBusinessPage(page, "reviews", "Recensioni");
        await expect(main(page).getByText(/Nessuna recensione/).first()).toBeVisible({ timeout: 15_000 });
    });

    test("errore di caricamento: lo dice e offre «Riprova»", async ({ page }) => {
        stub = await stubRecensioni(page);
        await page.route(/\/rest\/v1\/reviews\?/, route => route.fulfill({ status: 500, json: { code: "E2E", message: "rotto" } }));
        await openBusinessPage(page, "reviews", "Recensioni");
        await expect(main(page).getByRole("button", { name: "Riprova" })).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByText(/Nessuna recensione/)).toHaveCount(0);
    });
});
