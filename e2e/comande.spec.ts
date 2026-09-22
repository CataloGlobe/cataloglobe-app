import { expect, test, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";

/**
 * Comande (lotto `ds-5-comande`, §47.1). Scritto sulla pagina di **oggi**,
 * prima di ricomporla: deve essere verde prima e dopo (P0 del passo 2).
 *
 * Fixture su staging: la sede «Garbagnate» dell'azienda di test ha tre tavoli
 * e una sola comanda attiva, in Nuove, sul tavolo «T TEST». L'unica scrittura
 * del file è la transizione con undo: «Annulla ordine» e poi «Annulla» nel
 * toast, che la riporta in Nuove — stato netto invariato (cresce solo la
 * `version`). Per questo il file gira in serie: un test che legge la card
 * mentre un altro la sta annullando cadrebbe per un motivo che non è suo.
 * Stessa ragione, un livello sopra: `--repeat-each` con più worker manda due
 * copie del gruppo in parallelo sulla stessa comanda (409 «già cancellata»,
 * misurato); per ripetere il file si usa `--workers=1`.
 *
 * Locator per ruolo o per testo visibile, mai per tag o classe.
 */

const SEDE = /Garbagnate/;
const TAVOLO = "T TEST";
const COLONNE = ["Nuove", "In lavorazione", "Pronte"] as const;
/** Gli articoli della comanda della fixture. */
const ARTICOLI = ["Hamburger", "McToast"] as const;

test.describe.configure({ mode: "serial" });

function nav(page: Page) {
    return page.getByRole("navigation", { name: "Menu principale" });
}

/** Entra nella sede di test dalla griglia delle Sedi e apre Comande dalla sua sidebar. */
async function openComande(page: Page): Promise<void> {
    await openBusinessPage(page, "locations", "Sedi");
    await page.getByRole("radio", { name: "Vista griglia" }).click();
    const card = page.getByRole("main").getByRole("listitem").filter({ hasText: SEDE }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.getByRole("link").first().click();
    // L'indice della sede reindirizza all'Anagrafica: cliccare prima che il
    // redirect sia avvenuto farebbe vincere il redirect sul click.
    await page.waitForURL(/\/locations\/[0-9a-f-]+\/anagrafica$/);
    await nav(page).getByRole("link", { name: "Comande", exact: true }).click();
    await expect(page).toHaveURL(/\/locations\/[0-9a-f-]+\/comande$/, { timeout: 15_000 });
    // La board è pronta quando la card della fixture c'è (il nome del tavolo
    // compare anche come `option` del filtro, nascosta: non basta a dirlo).
    await expect(cardMenus(page)).toHaveCount(1, { timeout: 15_000 });
}

/**
 * Il menu ⋯ delle card della board. Il nome porta il tavolo («Altre azioni per
 * T TEST»): senza, a 375 collideva con l'overflow della banda compatta.
 */
function cardMenus(page: Page) {
    return page.getByRole("main").getByRole("button", { name: /^Altre azioni per / });
}

/** Il menu ⋯ della card della fixture: è l'unica comanda attiva della sede. */
async function openCardMenu(page: Page): Promise<void> {
    await expect(cardMenus(page)).toHaveCount(1);
    await page.getByRole("button", { name: `Altre azioni per ${TAVOLO}` }).click();
}

async function selectMainTab(page: Page, name: "Comande" | "Tavoli" | "Storico"): Promise<void> {
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(name === "Comande" ? "/comande(\\?tab=comande)?$" : `tab=${name.toLowerCase()}`));
}

test.describe("Comande", () => {
    test("si apre dal contesto della sede, con le tre colonne", async ({ page }) => {
        await openComande(page);

        await expect(page.getByRole("tab", { name: "Comande", exact: true })).toHaveAttribute("aria-selected", "true");
        // Le corsie sono regioni col nome dello stato.
        for (const colonna of COLONNE) {
            await expect(page.getByRole("main").getByRole("region", { name: colonna })).toBeVisible();
        }
        // La fixture è in Nuove: le altre due colonne sono vuote.
        await expect(page.getByText("Nessuna comanda in lavorazione")).toBeVisible();
        await expect(page.getByText("Nessuna comanda pronta")).toBeVisible();
        await expect(page.getByText("Nessuna nuova comanda")).toHaveCount(0);

        // La card della fixture: tavolo, articoli, totale, azione della colonna.
        const main = page.getByRole("main");
        // `visible`: il nome del tavolo è anche un'`option` (nascosta) del filtro.
        await expect(main.getByText(TAVOLO, { exact: true }).filter({ visible: true })).toBeVisible();
        for (const articolo of ARTICOLI) {
            await expect(main.getByText(articolo, { exact: true })).toBeVisible();
        }
        await expect(main.getByText("Totale", { exact: true })).toBeVisible();
        await expect(main.getByText("5,80 €", { exact: true })).toBeVisible();
        await expect(main.getByRole("button", { name: "Conferma", exact: true })).toBeVisible();

        await expect(page.getByRole("button", { name: "Crea ordine" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Aggiorna" })).toBeVisible();
        await expect(page.getByRole("button", { name: /suoni notifiche/ })).toHaveAttribute("aria-pressed", /true|false/);
    });

    test("il dettaglio della comanda si apre dal menu della card", async ({ page }) => {
        await openComande(page);
        await openCardMenu(page);
        await page.getByRole("menuitem", { name: "Vedi dettaglio" }).click();

        const drawer = page.getByRole("dialog");
        await expect(drawer).toBeVisible();
        await expect(drawer.getByText(TAVOLO).first()).toBeVisible();
        // Il contenuto che la ricomposizione (P3) deve conservare.
        await expect(drawer.getByText("Articoli", { exact: true })).toBeVisible();
        // Stesso nome dello stato in ogni superficie: la colonna è «Nuove», la comanda «Nuova».
        await expect(drawer.getByText("Nuova", { exact: true })).toBeVisible();
        for (const articolo of ARTICOLI) {
            // Non `exact`: oggi quantità e nome stanno nello stesso testo («1x
            // Hamburger»). `first()`: lo scontrino nascosto viene dopo nel DOM.
            await expect(drawer.getByText(articolo).first()).toBeVisible();
        }
        await expect(drawer.getByText("Totale", { exact: true })).toBeVisible();
        await expect(drawer.getByText(/^Inviato/).first()).toBeVisible();
        await expect(drawer.getByRole("button", { name: /^(Stampa|Ristampa comanda)$/ })).toBeVisible();
        await expect(drawer.getByRole("button", { name: "Chiudi" }).first()).toBeVisible();

        await page.keyboard.press("Escape");
        await expect(drawer).toHaveCount(0);
    });

    test("annullare una comanda si ripara dal toast", async ({ page }) => {
        // Due chiamate edge (cancel + uncancel) e due toast in fila: coi 4
        // worker della suite i 30 s di default non bastano sempre (misurato).
        test.setTimeout(60_000);
        await openComande(page);
        await openCardMenu(page);
        await page.getByRole("menuitem", { name: "Annulla ordine" }).click();

        const drawer = page.getByRole("dialog");
        await expect(drawer).toBeVisible();
        await drawer.getByRole("button", { name: "Annulla ordine" }).click();

        // Esce dalla board, e il toast offre l'undo.
        await expect(page.getByText(`Ordine ${TAVOLO} cancellato`)).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText("Nessuna nuova comanda")).toBeVisible();

        await page.getByRole("button", { name: "Annulla", exact: true }).click();
        await expect(page.getByText(`Ordine ${TAVOLO} ripristinato`)).toBeVisible({ timeout: 15_000 });

        // Torna in Nuove, dove era.
        await expect(page.getByText("Nessuna nuova comanda")).toHaveCount(0);
        await expect(cardMenus(page)).toHaveCount(1);
    });

    test("«Crea ordine» apre il drawer a taglia lg, senza inviare niente", async ({ page }) => {
        await openComande(page);
        await page.getByRole("button", { name: "Crea ordine" }).click();

        const drawer = page.getByRole("dialog");
        await expect(drawer).toBeVisible();
        await expect(drawer.getByRole("combobox").first()).toBeVisible();
        await expect(drawer.getByPlaceholder("Cerca prodotto...")).toBeVisible();
        await expect(drawer.getByRole("button", { name: "Invia comanda" })).toBeDisabled({ timeout: 15_000 });
        // lg = 720 (scheda SystemDrawer); sopra lg non esiste.
        const width = await drawer.evaluate(el => Math.round(el.getBoundingClientRect().width));
        expect(width).toBeLessThanOrEqual(720);

        await drawer.getByRole("button", { name: "Annulla" }).click();
        await expect(drawer).toHaveCount(0);
    });

    test("il filtro per tavolo restringe la board", async ({ page }) => {
        await openComande(page);
        const filtro = page.getByRole("main").getByRole("combobox", { name: "Filtra per tavolo" });
        await expect(filtro).toBeVisible();

        // Un tavolo diverso da quello della fixture: la board si svuota.
        const altri = (await filtro.getByRole("option").allInnerTexts()).filter(
            t => t !== "Tutti i tavoli" && t !== TAVOLO
        );
        test.skip(altri.length === 0, "serve un secondo tavolo");
        await filtro.selectOption({ label: altri[0] });
        await expect(page.getByText("Nessuna nuova comanda")).toBeVisible();
        await expect(cardMenus(page)).toHaveCount(0);

        await filtro.selectOption({ label: TAVOLO });
        await expect(page.getByText("Nessuna nuova comanda")).toHaveCount(0);

        await filtro.selectOption({ label: "Tutti i tavoli" });
        await expect(cardMenus(page)).toHaveCount(1);
    });

    test("la tab Tavoli mostra i tavoli e apre il dettaglio del tavolo", async ({ page }) => {
        await openComande(page);
        await selectMainTab(page, "Tavoli");

        const filtri = page.getByRole("main").getByRole("radiogroup");
        // Dizionario (§18.4 + P2): «Aperti», «Fuori servizio» — mai «Occupati»,
        // mai «Manutenzione».
        await expect(filtri.getByRole("radio", { name: "Tutti", exact: true })).toBeVisible({ timeout: 15_000 });
        for (const f of ["Aperti", "Liberi", "Fuori servizio"]) {
            await expect(filtri.getByRole("radio", { name: f, exact: true })).toBeVisible();
        }
        await expect(page.getByRole("main").getByText(/manutenzione|occupat/i)).toHaveCount(0);

        const tavolo = page.getByRole("main").getByRole("button", { name: new RegExp(`^${TAVOLO}, `) });
        await expect(tavolo).toBeVisible({ timeout: 15_000 });
        await tavolo.click();

        const drawer = page.getByRole("dialog");
        await expect(drawer).toBeVisible();
        await expect(drawer.getByText(TAVOLO).first()).toBeVisible();
        await expect(drawer.getByText(/manutenzione|occupat/i)).toHaveCount(0);
        // La comanda in Nuove è un ordine in corso, confermabile da qui.
        await expect(drawer.getByText(/^Ordini in corso/)).toBeVisible({ timeout: 15_000 });
        await expect(drawer.getByRole("button", { name: "Conferma" })).toBeVisible();
        await expect(drawer.getByText("Nuova", { exact: true })).toBeVisible();
        await expect(drawer.getByText(/Da prendere|Da confermare|In preparazione/)).toHaveCount(0);
        await expect(drawer.getByText("Totale in corso", { exact: true })).toBeVisible();
        await expect(drawer.getByText("Fuori servizio", { exact: true })).toBeVisible();
        await expect(drawer.getByRole("switch").or(drawer.getByRole("checkbox")).first()).toBeDisabled();
        await expect(drawer.getByRole("button", { name: /^(Chiudi tavolo|Fatto)$/ })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(drawer).toHaveCount(0);
    });

    test("i tavoli sono una griglia per zona: 3, 2, 1 colonne", async ({ page }) => {
        await openComande(page);
        await selectMainTab(page, "Tavoli");
        const main = page.getByRole("main");

        // «Senza zona» ha due tavoli: si legge dalla posizione delle tessere.
        const zona = main.getByRole("list", { name: "Senza zona" });
        await expect(zona.getByRole("listitem")).toHaveCount(2, { timeout: 15_000 });
        const tops = () =>
            zona.getByRole("listitem").evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)));
        const lefts = () =>
            zona.getByRole("listitem").evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().left)));

        expect(new Set(await tops()).size).toBe(1); // 1280: in riga
        await page.setViewportSize({ width: 768, height: 900 });
        await expect.poll(async () => new Set(await tops()).size).toBe(1); // 768: due per riga
        await page.setViewportSize({ width: 375, height: 900 });
        await expect.poll(async () => new Set(await lefts()).size).toBe(1); // 375: una colonna
    });

    test("il filtro «Aperti» e «Liberi» della vista tavoli", async ({ page }) => {
        await openComande(page);
        await selectMainTab(page, "Tavoli");
        const main = page.getByRole("main");
        const filtri = main.getByRole("radiogroup");

        await filtri.getByRole("radio", { name: "Aperti", exact: true }).click();
        const tavolo = main.getByRole("button", { name: new RegExp(`^${TAVOLO}, Aperto`) });
        await expect(tavolo).toBeVisible();
        await expect(main.getByRole("listitem").filter({ hasText: TAVOLO })).toContainText("5,80 €");

        await filtri.getByRole("radio", { name: "Liberi", exact: true }).click();
        await expect(tavolo).toBeHidden();
        await expect(main.getByText("Nessun tavolo per questo filtro")).toBeVisible();

        await filtri.getByRole("radio", { name: "Tutti", exact: true }).click();
        await expect(tavolo).toBeVisible();
    });

    test("lo Storico ha i segmenti, il giorno e la tabella", async ({ page }) => {
        await openComande(page);
        await selectMainTab(page, "Storico");

        const segmenti = page.getByRole("main").getByRole("radiogroup");
        for (const s of ["Tutti", "Serviti", "Annullati"]) {
            await expect(segmenti.getByRole("radio", { name: s, exact: true })).toBeVisible({ timeout: 15_000 });
        }
        // Oggi: non si va avanti.
        await expect(page.getByRole("button", { name: "Giorno successivo" })).toBeDisabled();

        // Un giorno indietro, poi di nuovo oggi: la tabella o il suo vuoto, mai un errore.
        await page.getByRole("button", { name: "Giorno precedente" }).click();
        await expect(page.getByRole("button", { name: "Giorno successivo" })).toBeEnabled();
        await page.getByRole("button", { name: "Giorno successivo" }).click();
        await expect(page.getByRole("button", { name: "Giorno successivo" })).toBeDisabled();

        await expect(page.getByText("Errore caricamento storico")).toHaveCount(0);
        await expect(
            page.getByRole("main").getByRole("columnheader", { name: "Tavolo" })
                .or(page.getByText("Nessun ordine nello storico di oggi"))
                .first()
        ).toBeVisible({ timeout: 15_000 });
    });

    test("sopra 1024 tre colonne affiancate, niente selettore di stato", async ({ page }) => {
        await openComande(page);
        await page.setViewportSize({ width: 1280, height: 900 });
        await expect(page.getByRole("tablist", { name: "Stato delle comande" })).toBeHidden();

        const main = page.getByRole("main");
        const tops = await Promise.all(
            COLONNE.map(c => main.getByRole("region", { name: c }).evaluate(el => Math.round(el.getBoundingClientRect().top)))
        );
        expect(new Set(tops).size).toBe(1); // stessa riga
    });

    for (const width of [768, 375]) {
        test(`a ${width} una lista sola, scelta coi contatori`, async ({ page }) => {
            await openComande(page);
            await page.setViewportSize({ width, height: 900 });

            const stati = page.getByRole("tablist", { name: "Stato delle comande" });
            await expect(stati).toBeVisible();
            // Contatori nelle etichette, dopo il filtro, dentro il nome del tab
            // («Nuove 1»). La fixture è in Nuove.
            const tab = (nome: string, n: number) =>
                stati.getByRole("tab", { name: new RegExp(`^${nome}\\s*${n}$`) });
            await expect(tab("Nuove", 1)).toHaveAttribute("aria-selected", "true");
            await expect(tab("In lavorazione", 0)).toBeVisible();
            await expect(tab("Pronte", 0)).toBeVisible();
            // Il contatore non è più una regione live.
            await expect(stati.getByRole("status")).toHaveCount(0);

            // Si vede una lista sola.
            await expect(page.getByRole("button", { name: `Altre azioni per ${TAVOLO}` })).toBeVisible();
            await expect(page.getByText("Nessuna comanda pronta")).toBeHidden();

            await tab("Pronte", 0).click();
            await expect(page.getByText("Nessuna comanda pronta")).toBeVisible();
            await expect(page.getByRole("button", { name: `Altre azioni per ${TAVOLO}` })).toBeHidden();

            await tab("Nuove", 1).click();
            await expect(page.getByRole("button", { name: `Altre azioni per ${TAVOLO}` })).toBeVisible();
        });
    }

    for (const width of [1280, 768, 375]) {
        test(`a ${width} i tre stati si leggono e la pagina non scorre di lato`, async ({ page }) => {
            // Si entra da desktop: a 375 la sidebar è un cassetto chiuso.
            await openComande(page);
            await page.setViewportSize({ width, height: 900 });

            for (const colonna of COLONNE) {
                await expect(page.getByRole("main").getByText(colonna, { exact: true }).first()).toBeAttached();
            }
            await expect(page.getByRole("button", { name: `Altre azioni per ${TAVOLO}` })).toBeVisible();
            const overflow = await page.evaluate(
                () => document.documentElement.scrollWidth - document.documentElement.clientWidth
            );
            expect(overflow).toBeLessThanOrEqual(0);
        });
    }
});
