import { expect, test, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";
import { sidebarLink } from "./nav";

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

/** Entra nella sede di test dalla griglia delle Sedi e apre Comande dalla sua sidebar. */
async function openComande(page: Page): Promise<void> {
    await openBusinessPage(page, "locations", "Sedi");
    await page.getByRole("radio", { name: "Vista griglia" }).click();
    const card = page.getByRole("main").getByRole("listitem").filter({ hasText: SEDE }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.getByRole("link").first().click();
    // L'indice della sede reindirizza alla prima voce: cliccare prima che il
    // redirect sia avvenuto farebbe vincere il redirect sul click.
    await page.waitForURL(/\/locations\/[0-9a-f-]+\/[a-z-]+$/);
    await (await sidebarLink(page, "Comande")).click();
    await expect(page).toHaveURL(/\/locations\/[0-9a-f-]+\/comande$/, { timeout: 15_000 });
    // La board è pronta quando la card della fixture c'è (il nome del tavolo
    // compare anche come `option` del filtro, nascosta: non basta a dirlo).
    await expect(fixtureMenu(page)).toBeVisible({ timeout: 15_000 });
}

/**
 * La card della fixture: un `article` col nome del tavolo. Mirata e non
 * contata: la sede può avere altre comande attive.
 */
function fixtureCard(page: Page) {
    return page.getByRole("main").getByRole("article", { name: TAVOLO, exact: true });
}

/**
 * Il menu ⋯ della card della fixture. Il nome porta il tavolo («Altre azioni per
 * T TEST»): senza, a 375 collideva con l'overflow della banda compatta.
 */
function fixtureMenu(page: Page) {
    return fixtureCard(page).getByRole("button", { name: `Altre azioni per ${TAVOLO}`, exact: true });
}

async function openCardMenu(page: Page): Promise<void> {
    await fixtureMenu(page).click();
}

test.describe("Comande", () => {
    test("si apre dal contesto della sede, con le tre colonne", async ({ page }) => {
        await openComande(page);

        // Le corsie sono regioni col nome dello stato.
        for (const colonna of COLONNE) {
            await expect(page.getByRole("main").getByRole("region", { name: colonna })).toBeVisible();
        }
        // La fixture è in Nuove: le altre due colonne sono vuote.
        await expect(page.getByText("Nessuna comanda in lavorazione")).toBeVisible();
        await expect(page.getByText("Nessuna comanda pronta")).toBeVisible();
        await expect(page.getByText("Nessuna nuova comanda")).toHaveCount(0);

        // La card della fixture: tavolo, articoli, totale, azione della colonna.
        const card = fixtureCard(page);
        await expect(card.getByText(TAVOLO, { exact: true })).toBeVisible();
        for (const articolo of ARTICOLI) {
            await expect(card.getByText(articolo, { exact: true })).toBeVisible();
        }
        await expect(card.getByText("Totale", { exact: true })).toBeVisible();
        await expect(card.getByText("5,80 €", { exact: true })).toBeVisible();
        await expect(card.getByRole("button", { name: "Conferma", exact: true })).toBeVisible();

        await expect(page.getByRole("button", { name: "Crea ordine" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Aggiorna" })).toBeVisible();
        await expect(page.getByRole("button", { name: /suoni notifiche/ })).toHaveAttribute("aria-pressed", /true|false/);
    });

    test("Comande è la board e basta: Tavoli e Storico stanno altrove", async ({ page }) => {
        // Lotto B-a: i tavoli sono la Mappa di Servizio, lo Storico una voce a sé.
        await openComande(page);
        await expect(page.getByRole("tab", { name: /^(Comande|Tavoli|Storico)$/ })).toHaveCount(0);
        for (const colonna of COLONNE) {
            await expect(page.getByRole("main").getByRole("region", { name: colonna })).toBeVisible();
        }
        await expect(page.getByRole("button", { name: "Crea ordine" })).toBeVisible();
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

    test("toccando la card il dettaglio si apre accanto, e indietro lo chiude", async ({ page }) => {
        // D131 «Accanto»: niente velo, la board resta lì e si tocca; il
        // dettaglio sta nell'indirizzo e ha le azioni della card.
        await openComande(page);
        await fixtureCard(page).getByText("Hamburger", { exact: true }).click();

        await expect(page).toHaveURL(/[?&]ordine=/);
        const pane = page.getByRole("dialog");
        await expect(pane.getByText(TAVOLO).first()).toBeVisible();
        await expect(pane.getByRole("button", { name: "Conferma", exact: true })).toBeVisible();
        await expect(fixtureCard(page)).toHaveAttribute("aria-current", "true");
        await expect(page.getByRole("button", { name: "Crea ordine" })).toBeVisible();
        // D141: «Dettagli ›» sulla card e «1 di N» fra le frecce.
        await expect(fixtureCard(page).getByText("Dettagli", { exact: true })).toBeVisible();
        await expect(pane.getByText(/^\d+ di \d+$/)).toBeVisible();

        await page.goBack();
        await expect(pane).toHaveCount(0);
        await expect(page).not.toHaveURL(/[?&]ordine=/);
    });

    test("al telefono: «Dettagli» si apre da tastiera, il menù sta sopra, Esc chiude", async ({ page }) => {
        await openComande(page);
        await page.setViewportSize({ width: 375, height: 812 });
        const open = fixtureCard(page).getByRole("button", { name: /^Dettagli di / });
        await open.focus();
        await page.keyboard.press("Enter");

        const pane = page.getByRole("dialog");
        await expect(pane.getByText(TAVOLO).first()).toBeVisible();
        // Il «⋯» del dettaglio apre il suo menù sopra la pagina, non sotto.
        await pane.getByRole("button", { name: "Altre azioni" }).click();
        await page.getByRole("menuitem", { name: "Annulla articolo" }).click({ trial: true });
        await page.keyboard.press("Escape");
        await expect(page.getByRole("menu")).toHaveCount(0);
        await expect(pane).toBeVisible();

        await page.keyboard.press("Escape");
        await expect(pane).toHaveCount(0);
        await expect(page).not.toHaveURL(/[?&]ordine=/);
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
        await expect(fixtureMenu(page)).toHaveCount(0);

        await page.getByRole("button", { name: "Annulla", exact: true }).click();
        await expect(page.getByText(`Ordine ${TAVOLO} ripristinato`)).toBeVisible({ timeout: 15_000 });

        // Torna in Nuove, dove era.
        await expect(page.getByText("Nessuna nuova comanda")).toHaveCount(0);
        await expect(fixtureMenu(page)).toBeVisible();
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
        // T14: sta nella testata, sulla riga di «Aggiorna», non sopra la board.
        const filtroBox = await filtro.boundingBox();
        const aggiorna = await page.getByRole("main").getByRole("button", { name: "Aggiorna" }).first().boundingBox();
        expect(Math.abs(filtroBox!.y + filtroBox!.height / 2 - (aggiorna!.y + aggiorna!.height / 2))).toBeLessThan(12);

        // Un tavolo diverso da quello della fixture: la sua card sparisce.
        const altri = (await filtro.getByRole("option").allInnerTexts()).filter(
            t => t !== "Tutti i tavoli" && t !== TAVOLO
        );
        test.skip(altri.length === 0, "serve un secondo tavolo");
        await filtro.selectOption({ label: altri[0] });
        await expect(fixtureMenu(page)).toHaveCount(0);

        await filtro.selectOption({ label: TAVOLO });
        await expect(page.getByText("Nessuna nuova comanda")).toHaveCount(0);

        await filtro.selectOption({ label: "Tutti i tavoli" });
        await expect(fixtureMenu(page)).toBeVisible();
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
            // («Nuove 1»). La fixture è in Nuove: almeno una, non esattamente una.
            const tab = (nome: string, n: number | string) =>
                stati.getByRole("tab", { name: new RegExp(`^${nome}\\s*${n}$`) });
            const nuove = "[1-9]\\d*";
            await expect(tab("Nuove", nuove)).toHaveAttribute("aria-selected", "true");
            await expect(tab("In lavorazione", 0)).toBeVisible();
            await expect(tab("Pronte", 0)).toBeVisible();
            // Il contatore non è più una regione live.
            await expect(stati.getByRole("status")).toHaveCount(0);

            // Si vede una lista sola.
            await expect(fixtureMenu(page)).toBeVisible();
            await expect(page.getByText("Nessuna comanda pronta")).toBeHidden();

            await tab("Pronte", 0).click();
            await expect(page.getByText("Nessuna comanda pronta")).toBeVisible();
            await expect(fixtureMenu(page)).toBeHidden();

            await tab("Nuove", nuove).click();
            await expect(fixtureMenu(page)).toBeVisible();
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
            await expect(fixtureMenu(page)).toBeVisible();
            const overflow = await page.evaluate(
                () => document.documentElement.scrollWidth - document.documentElement.clientWidth
            );
            expect(overflow).toBeLessThanOrEqual(0);
        });
    }
});
