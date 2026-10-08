import { expect, test, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";
import { stubAnalitiche, type AnaliticheStub } from "./analiticheStub";

/**
 * Analitiche (lotto `ds-5-coda`, P0). Scritto sulla pagina di **oggi**, prima
 * di ricomporla: deve restare verde passo dopo passo. Gate prima della fetch
 * e stato d'errore sono `test.fail` finché il passo non li porta.
 *
 * Le 21 RPC rispondono da `analiticheStub.ts`; permessi, piano, azienda e
 * sidebar veri. Orologio fermo a mercoledì 23/09/2026 12:00 di Roma.
 */

function main(page: Page) {
    return page.getByRole("main").first();
}

async function openPage(page: Page): Promise<void> {
    await openBusinessPage(page, "analytics", "Analitiche");
    await expect(main(page).getByText("Focaccia e2e").first()).toBeVisible({ timeout: 15_000 });
}

/** Il periodo in testata: il segmento comodo, o il filtro della barra compatta. */
async function choosePeriod(page: Page, label: RegExp): Promise<void> {
    const comfy = page.getByRole("radio", { name: label });
    if (await comfy.isVisible().catch(() => false)) {
        await comfy.click();
        return;
    }
    await page.getByRole("button", { name: /^Periodo:/ }).click();
    await page.getByRole("option", { name: label }).click();
}

async function noSideScroll(page: Page): Promise<void> {
    const overflow = await page.evaluate(() => {
        const de = document.documentElement;
        const scrollers = [de, ...Array.from(document.querySelectorAll<HTMLElement>("main"))];
        return Math.max(...scrollers.map(el => el.scrollWidth - el.clientWidth));
    });
    expect(overflow).toBeLessThanOrEqual(0);
}

let stub: AnaliticheStub;

test.describe("Analitiche", () => {
    test.beforeEach(async ({ page }) => {
        stub = await stubAnalitiche(page);
    });

    test("le visite, cosa cercano, cosa guardano, le recensioni", async ({ page }) => {
        await openPage(page);
        await expect(main(page).getByText("151", { exact: true }).first()).toBeVisible();
        await expect(main(page).getByText(/tiramisù/).first()).toBeVisible();
        await expect(main(page).getByText(/senza glutine/).first()).toBeVisible();
        await expect(main(page).getByText("Pane di segale e2e").first()).toBeVisible();
        await expect(main(page).getByText(/^3[.,]5/).first()).toBeVisible();
        await expect(main(page).getByText("Menù d'estate e2e").first()).toBeVisible();
    });

    test("gli ordini del periodo: incasso e prodotti", async ({ page }) => {
        await openPage(page);
        await expect(main(page).getByText(/240,00|240\.00/).first()).toBeVisible();
        await expect(main(page).getByText("Birra e2e").first()).toBeVisible();
    });

    test("nessuna prenotazione nel periodo lo dice", async ({ page }) => {
        await openPage(page);
        await expect(main(page).getByText(/nessuna prenotazione/i).first()).toBeVisible();
    });

    test("cambiare periodo richiede i dati del nuovo periodo", async ({ page }) => {
        await openPage(page);
        const before = stub.calls.length;
        await choosePeriod(page, /^90 giorni$/);
        await expect.poll(() => stub.calls.slice(before).some(c => c.fn === "analytics_overview_stats")).toBe(true);
        const call = stub.calls.slice(before).find(c => c.fn === "analytics_overview_stats")!;
        const spanDays = (Date.parse(String(call.body.p_to)) - Date.parse(String(call.body.p_from))) / 86_400_000;
        expect(Math.round(spanDays)).toBe(90);
    });

    test("Esporta Excel scarica il file", async ({ page }) => {
        await openPage(page);
        const button = page.getByRole("button", { name: "Esporta Excel" });
        const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
        expect(download.suggestedFilename()).toMatch(/^analytics_cataloglobe_.+\.xlsx$/);
    });

    test("senza lettura: la pagina è bloccata", async ({ page }) => {
        await stub.revoke("analytics.read");
        await openBusinessPage(page, "overview", "Panoramica");
        await page.goto(page.url().replace(/\/overview$/, "/analytics"));
        await stub.revoked;
        await expect(main(page).getByText("Non hai accesso a questa sezione")).toBeVisible({ timeout: 15_000 });
    });

    test("senza lettura: nessuna RPC parte", async ({ page }) => {
        await stub.revoke("analytics.read");
        await openBusinessPage(page, "overview", "Panoramica");
        await page.goto(page.url().replace(/\/overview$/, "/analytics"));
        await stub.revoked;
        await expect(main(page).getByText("Non hai accesso a questa sezione")).toBeVisible({ timeout: 15_000 });
        expect(stub.calls).toHaveLength(0);
    });

    test("a 375 nessuno scroll orizzontale", async ({ page }) => {
        await openPage(page);
        await page.setViewportSize({ width: 375, height: 800 });
        await expect(main(page).getByText("Focaccia e2e").first()).toBeVisible();
        await noSideScroll(page);
    });
});

test.describe("Analitiche — campione e ordine (§36)", () => {
    test("sopra le 100 visite: percentuali e confronto", async ({ page }) => {
        stub = await stubAnalitiche(page);
        await openPage(page);
        await expect(main(page).getByText(/Una visita è un'apertura della pagina/)).toBeVisible();
        await expect(main(page).getByText(/Sotto le 100 visite/)).toHaveCount(0);
        await expect(main(page).getByText(/^6%$/)).toBeVisible();
    });

    test("AN2: «Pagina pubblica» con Visite, Eventi per visita e Visite con un'aggiunta in una riga", async ({ page }) => {
        stub = await stubAnalitiche(page);
        await openPage(page);
        const band = page.getByRole("region", { name: "Pagina pubblica" });
        await expect(band.getByText(/Una visita è un'apertura della pagina/)).toBeVisible();
        const labels = ["Visite", "Eventi per visita", "Visite con un'aggiunta alla selezione"];
        const ys = await Promise.all(labels.map(async l => (await band.getByText(l, { exact: true }).boundingBox())!.y));
        expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(8);
    });

    test("sotto le 100 visite: conteggi, niente percentuali, e lo dice", async ({ page }) => {
        stub = await stubAnalitiche(page, { sample: "small" });
        await openBusinessPage(page, "analytics", "Analitiche");
        await expect(main(page).getByText("42", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByText(/Sotto le 100 visite nel periodo non compaiono percentuali/)).toBeVisible();
        await expect(main(page).getByText("9 su 42")).toBeVisible();
        // La regola è delle visite (§36.1/3): gli ordini sono transazioni contate.
        await expect(page.getByRole("region", { name: "Cosa guardano" }).getByText(/\d%$/)).toHaveCount(0);
    });

    test("ordine fisso: cosa cercano prima degli ordini, la sezione vuota in fondo", async ({ page }) => {
        stub = await stubAnalitiche(page);
        await openPage(page);
        const titles = await main(page).getByText(/^(Pagina pubblica|Cosa cercano|Cosa guardano|Recensioni|Ordini al tavolo|Senza dati nel periodo)$/).allTextContents();
        expect(titles).toEqual(["Pagina pubblica", "Cosa cercano", "Cosa guardano", "Recensioni", "Ordini al tavolo", "Senza dati nel periodo"]);
        await expect(main(page).getByText(/Prenotazioni — nessuna prenotazione in 30 giorni/)).toBeVisible();
        await expect(main(page).getByRole("button", { name: "Apri Prenotazioni" })).toBeVisible();
    });

    // T19: il tasso si confronta in punti e senza la base minima dei conteggi
    // (lo stub dà lo stesso tasso ai due periodi: «0 pt»).
    test("il tasso di annullamento: il confronto è in punti, anche con pochi ordini", async ({ page }) => {
        stub = await stubAnalitiche(page);
        await openPage(page);
        await expect(main(page).getByText("1 annullati su 13")).toBeVisible();
        await expect(main(page).getByText("0 pt", { exact: true })).toBeVisible();
    });
});

test.describe("Analitiche — errore", () => {
    test("errore di caricamento: lo dice e offre «Riprova»", async ({ page }) => {
        stub = await stubAnalitiche(page);
        await page.route(/\/rest\/v1\/rpc\/analytics_overview_stats/, route => route.fulfill({ status: 500, json: { code: "E2E", message: "rotto" } }));
        await openBusinessPage(page, "analytics", "Analitiche");
        await expect(main(page).getByRole("button", { name: "Riprova" })).toBeVisible({ timeout: 15_000 });
    });
});
