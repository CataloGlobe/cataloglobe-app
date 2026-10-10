import { expect, test, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";
import { stubAnalitiche, type AnaliticheStub } from "./analiticheStub";

/**
 * Andamento (D154: B, una riga per cosa col dettaglio accanto; lo switch
 * «Grafico» per A). Le 21 RPC rispondono da `analiticheStub.ts`; permessi,
 * piano, azienda e sidebar veri. Orologio fermo a mercoledì 23/09/2026 12:00
 * di Roma. Il confronto fra sedi si vede solo con «Confronta con» in alto
 * (navigazione): qui lo provano i test di unità.
 */

function main(page: Page) {
    return page.getByRole("main").first();
}

function rows(page: Page) {
    return main(page).getByRole("list", { name: "Andamento" });
}

async function openPage(page: Page): Promise<void> {
    await openBusinessPage(page, "analytics", "Andamento");
    await expect(rows(page).getByRole("button", { name: /La pagina/ })).toBeVisible({ timeout: 15_000 });
}

async function noSideScroll(page: Page): Promise<void> {
    // Dopo un cambio di larghezza la sidebar lascia il posto con una
    // transizione: per un attimo la pagina è stretta. Si misura a layout fermo.
    await expect
        .poll(() =>
            page.evaluate(() => {
                const de = document.documentElement;
                const scrollers = [de, ...Array.from(document.querySelectorAll<HTMLElement>("main"))];
                return Math.max(...scrollers.map(el => el.scrollWidth - el.clientWidth));
            })
        )
        .toBeLessThanOrEqual(0);
}

let stub: AnaliticheStub;

test.describe("Andamento", () => {
    test.beforeEach(async ({ page }) => {
        stub = await stubAnalitiche(page);
    });

    test("la frase in cima, poi una riga per cosa; quella senza dati in fondo", async ({ page }) => {
        await openPage(page);
        await expect(main(page).getByText("Ultimi 30 giorni: più o meno come il mese prima.")).toBeVisible();
        await expect(main(page).getByText(/151 visite alla pagina \(come prima\) · 12 ordini dal tavolo per 240,00 €/)).toBeVisible();
        const buttons = await rows(page).getByRole("button").allTextContents();
        expect(buttons.map(t => t.match(/^(La pagina|Al tavolo|Recensioni|Cosa cercano)/)?.[1])).toEqual([
            "La pagina",
            "Al tavolo",
            "Recensioni",
            "Cosa cercano"
        ]);
        const last = rows(page).getByRole("listitem").last();
        await expect(last).toContainText("Prenotazioni");
        await expect(last).toContainText("Nessuna prenotazione in 30 giorni");
        await expect(last.getByRole("link", { name: /Apri Prenotazioni/ })).toBeVisible();
        await expect(rows(page).getByRole("button", { name: /Recensioni/ })).toContainText("3,5 ★ su 4 recensioni");
        await expect(main(page).getByText("«Menù d'estate e2e» aperto 5 volte.")).toBeVisible();
    });

    test("il clic apre il dettaglio accanto; le frecce passano alla riga dopo", async ({ page }) => {
        await openPage(page);
        await rows(page).getByRole("button", { name: /Al tavolo/ }).click();
        await expect(page).toHaveURL(/[?&]voce=tavolo/);
        const pane = page.getByRole("dialog", { name: "Al tavolo" });
        await expect(pane.getByRole("cell", { name: "Birra e2e" })).toBeVisible();
        await expect(pane.getByText("20,00 €", { exact: true })).toBeVisible();
        await expect(pane.getByRole("img", { name: "Ordini al giorno" })).toBeVisible();
        await expect(rows(page).getByRole("button", { name: /Al tavolo/ })).toHaveAttribute("aria-current", "true");
        await pane.getByRole("button", { name: "Successivo" }).click();
        await expect(page.getByRole("dialog", { name: "Recensioni" })).toBeVisible();
        await expect(page).toHaveURL(/[?&]voce=recensioni/);
    });

    test("cosa cercano: quelle che non trovano niente nel menù", async ({ page }) => {
        await openPage(page);
        const row = rows(page).getByRole("button", { name: /Cosa cercano/ });
        await expect(row).toContainText("1 ricerca non trova niente");
        await row.click();
        const pane = page.getByRole("dialog", { name: "Cosa cercano" });
        await expect(pane.getByRole("listitem").filter({ hasText: "senza glutine" })).toContainText("non trovato");
    });

    test("cambiare periodo richiede i dati del nuovo periodo", async ({ page }) => {
        await openPage(page);
        const before = stub.calls.length;
        await page.getByRole("radio", { name: "90 giorni" }).click();
        await expect(page).toHaveURL(/[?&]period=90d/);
        await expect.poll(() => stub.calls.slice(before).some(c => c.fn === "analytics_overview_stats")).toBe(true);
        const call = stub.calls.slice(before).find(c => c.fn === "analytics_overview_stats")!;
        const spanDays = (Date.parse(String(call.body.p_to)) - Date.parse(String(call.body.p_from))) / 86_400_000;
        expect(Math.round(spanDays)).toBe(90);
        await expect(main(page).getByText(/^Ultimi 90 giorni:/)).toBeVisible();
    });

    test("«Grafico»: la striscia dei numeri, il grafico giorno per giorno; la scelta resta", async ({ page }) => {
        await openPage(page);
        await page.getByRole("radio", { name: "Grafico" }).click();
        const strip = main(page).getByRole("group", { name: "Cosa mostra il grafico" });
        await expect(strip.getByRole("button", { name: /Visite alla pagina/ })).toHaveAttribute("aria-pressed", "true");
        await expect(main(page).getByRole("img", { name: "Visite alla pagina, giorno per giorno" })).toBeVisible();
        await strip.getByRole("button", { name: /Ordini dal tavolo/ }).click();
        await expect(main(page).getByRole("img", { name: "Ordini dal tavolo, giorno per giorno" })).toBeVisible();
        await expect(main(page).getByRole("region", { name: "Cosa piace" }).getByRole("cell", { name: "Focaccia e2e" })).toBeVisible();
        await expect(main(page).getByRole("region", { name: "Quando arrivano" })).toBeVisible();
        await page.reload();
        await expect(page.getByRole("radio", { name: "Grafico" })).toBeChecked({ timeout: 15_000 });
    });

    test("Esporta scarica il file", async ({ page }) => {
        await openPage(page);
        const button = main(page).getByRole("button", { name: "Esporta" });
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

    test("a 375 nessuno scroll orizzontale, nelle due viste", async ({ page }) => {
        await openPage(page);
        await page.setViewportSize({ width: 375, height: 800 });
        await expect(rows(page).getByRole("button", { name: /La pagina/ })).toBeVisible();
        await noSideScroll(page);
        await page.getByRole("radio", { name: "Grafico" }).click();
        await expect(main(page).getByRole("img", { name: "Visite alla pagina, giorno per giorno" })).toBeVisible();
        await noSideScroll(page);
    });
});

test.describe("Andamento — campione (§36)", () => {
    test("sotto le 100 visite: conteggi, niente percentuali né confronto delle visite", async ({ page }) => {
        stub = await stubAnalitiche(page, { sample: "small" });
        await openPage(page);
        const pagina = rows(page).getByRole("button", { name: /La pagina/ });
        await expect(pagina).toContainText("42 visite");
        await expect(pagina).toContainText("9 con una scelta");
        await expect(pagina).not.toContainText("%");
        await expect(main(page).getByText(/42 visite alla pagina ·/)).toBeVisible();
    });
});

test.describe("Andamento — errore", () => {
    test("errore di caricamento: lo dice e offre «Riprova»", async ({ page }) => {
        stub = await stubAnalitiche(page);
        await page.route(/\/rest\/v1\/rpc\/analytics_overview_stats/, route => route.fulfill({ status: 500, json: { code: "E2E", message: "rotto" } }));
        await openBusinessPage(page, "analytics", "Andamento");
        await expect(main(page).getByText("Non è stato possibile caricare l'andamento")).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByRole("button", { name: "Riprova" })).toBeVisible();
    });
});
