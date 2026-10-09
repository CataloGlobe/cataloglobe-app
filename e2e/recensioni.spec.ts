import { expect, test, type Locator, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";
import { sidebarLink } from "./nav";
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

/** La riga di una recensione nell'elenco «Recensioni» (RC6). */
function rowOf(page: Page, comment: string): Locator {
    return main(page).getByRole("list", { name: "Recensioni" }).getByRole("listitem").filter({ hasText: comment });
}

/**
 * Clic su un bottone che deve esserci: prima l'attesa con scadenza, così
 * un'assenza è un'asserzione fallita e non un timeout del test.
 */
async function press(button: Locator): Promise<void> {
    await expect(button).toBeVisible();
    await button.click();
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
        await chooseFilter(page, page.getByRole("combobox", { name: "Filtra per stelle" }), "Valutazione", /^1 stella$/, "1");
        expect(await comments(page)).toEqual(["Freddo e2e"]);
        // RC4: il conteggio a sinistra nella barra segue il filtro.
        await expect(main(page).getByText("1 di 5 recensioni", { exact: true })).toBeVisible();
    });

    test("RC4: barra con il conteggio a sinistra, ricerca · stelle · periodo · ordine a destra", async ({ page }) => {
        await openPage(page);
        const count = main(page).getByText("5 recensioni", { exact: true });
        await expect(count).toBeVisible();
        const boxes = await Promise.all([
            count.boundingBox(),
            page.getByPlaceholder(/^Cerca/).first().boundingBox(),
            page.getByRole("combobox", { name: "Filtra per stelle" }).boundingBox(),
            page.getByRole("combobox", { name: "Filtra per periodo" }).boundingBox(),
            page.getByRole("combobox", { name: "Ordina recensioni" }).boundingBox()
        ]);
        const xs = boxes.map(b => b!.x);
        expect([...xs].sort((a, b) => a - b)).toEqual(xs);
        // Nessuna frase sotto la testata: sta nel riepilogo.
        await expect(main(page).getByRole("radio")).toHaveCount(0);
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

/**
 * Feedback privato (R1): niente coda né stati. Le righe con gli stati della
 * vecchia moderazione (in attesa, nascosta) stanno nell'elenco come le altre,
 * il riepilogo le conta tutte, Elimina è su ogni riga con `reviews.delete`.
 * Nessuna PATCH: una write non registrata risponde 500 e farebbe fallire.
 */
test.describe("Recensioni — feedback privato", () => {
    test.beforeEach(async ({ page }) => {
        stub = await stubRecensioni(page, { legacyStatuses: true });
    });

    test("nessuna coda, nessun comando di moderazione, nessuno stato", async ({ page }) => {
        await openPage(page);
        await expect(main(page).getByText("Carbonara perfetta e2e")).toBeVisible();
        await expect(main(page).getByText(/in attesa/i)).toHaveCount(0);
        await expect(main(page).getByRole("button", { name: /^(Pubblica|Tieni nascosta)$/ })).toHaveCount(0);
        await expect(main(page).getByRole("radio", { name: /^(Pubblicate|Nascoste)/ })).toHaveCount(0);
        await expect(main(page).getByText(/^(Pubblicata|Nascosta)$/)).toHaveCount(0);
    });

    test("il riepilogo conta tutti i voti", async ({ page }) => {
        await openPage(page);
        // (5 + 2 + 4 + 5 + 1 + 2 + 5 + 1) / 8 = 3,125 → 3,1
        await expect(main(page).getByText(/^3[.,]1$/).first()).toBeVisible();
        await expect(main(page).getByRole("img", { name: "3,1 su 5 · 8 recensioni" })).toBeVisible();
        await expect(main(page).getByText("Riepilogo dei voti", { exact: true })).toBeVisible();
        // RC5: la frase del feedback privato è il sottotitolo del riepilogo.
        await expect(main(page).getByText(/^Feedback privati dei clienti: li vedi solo tu e il tuo team/)).toBeVisible();
    });

    test("RC6: stelle e data in colonna a sinistra, commento a tutta larghezza", async ({ page }) => {
        await openPage(page);
        const row = rowOf(page, "Cameriere scortese e2e");
        const [ratingBox, commentBox] = await Promise.all([
            row.getByRole("img").first().boundingBox(),
            row.getByText(/^Cameriere scortese e2e/).boundingBox()
        ]);
        expect(ratingBox!.x + ratingBox!.width).toBeLessThan(commentBox!.x);
        expect(Math.abs(ratingBox!.y - commentBox!.y)).toBeLessThan(12);
    });

    test("le righe ex in attesa e nascoste sono nell'elenco", async ({ page }) => {
        await openPage(page);
        await expect(rowOf(page, "Cameriere scortese e2e")).toHaveCount(1);
        await expect(rowOf(page, "Prova spam e2e")).toHaveCount(1);
    });

    test("Elimina su ogni riga, con conferma", async ({ page }) => {
        stub.onWrite("reviews.DELETE", () => [{ id: REVIEW.pizza }]);
        await openPage(page);
        await press(rowOf(page, "Pizza ottima e2e, torneremo.").getByRole("button", { name: /^Azioni/ }));
        await expect(page.getByRole("menuitem")).toHaveText(["Elimina"]);
        await page.getByRole("menuitem", { name: "Elimina" }).click();
        expect(stub.writes.filter(w => w.key === "reviews.DELETE")).toHaveLength(0);
        await page.getByRole("button", { name: "Elimina", exact: true }).last().click();
        await expect(page.getByText("Recensione eliminata")).toBeVisible();
        await expect(main(page).getByText("Pizza ottima e2e, torneremo.")).toHaveCount(0);
        expect(stub.writes.find(w => w.key === "reviews.DELETE")?.params.get("id")).toBe(`eq.${REVIEW.pizza}`);
    });

    test("senza reviews.delete: nessun menu di riga", async ({ page }) => {
        await stub.revoke("reviews.delete");
        await openPage(page);
        await stub.revoked;
        await expect(main(page).getByRole("button", { name: /^Azioni/ })).toHaveCount(0);
    });

    test("la voce di sidebar non ha badge", async ({ page }) => {
        await openPage(page);
        const link = await sidebarLink(page, /^Recensioni/);
        await expect(link).toHaveText(/^Recensioni$/);
    });

    test("a 375 il commento lungo prende tutta la riga, stelle e data sopra, nessuno scroll orizzontale", async ({ page }) => {
        await openPage(page);
        await page.setViewportSize({ width: 375, height: 800 });
        const row = rowOf(page, "Cameriere scortese e2e");
        const comment = row.getByText(/^Cameriere scortese e2e/);
        await expect(comment).toBeVisible();
        await noSideScroll(page);
        const [rowBox, commentBox, ratingBox] = await Promise.all([
            row.boundingBox(),
            comment.boundingBox(),
            row.getByRole("img").first().boundingBox()
        ]);
        if (!rowBox || !commentBox || !ratingBox) throw new Error("riga non misurabile");
        // Tutta la larghezza meno i rientri della riga e lo spazio del menu «⋯».
        expect(commentBox.width).toBeGreaterThanOrEqual(rowBox.width - 2 * 24 - 48);
        expect(ratingBox.y + ratingBox.height).toBeLessThanOrEqual(commentBox.y);
    });
});
