import { expect, test, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";
import { asBasePlan, asRole } from "./asRole";
import { stubReservations, type ReservationsStub } from "./reservationsStub";

/**
 * Servizio (lotto B-a, §18.2, §50.21): una pagina di sede con due modi,
 * Mappa e Gestisci la sala. La Mappa è la vista dei tavoli che stava in
 * Comande → Tavoli, col pannello del conto; Gestisci la sala è la vecchia
 * `/sala`. Lo Storico degli ordini diventa una voce a sé. L'Elenco (le
 * tavolate) arriva col lotto B-b: fino ad allora resta in Prenotazioni.
 *
 * Lotto B-b: il modo **Elenco** (la tavolata, estratta da Prenotazioni →
 * Servizio) è il predefinito; col piano Pro si atterra lì. I casi della
 * Mappa aprono la Mappa per nome, non per atterraggio. Le prenotazioni e la
 * sala dell'Elenco sono finte (`reservationsStub.ts`), come in
 * `prenotazioni.spec.ts`.
 *
 * Correzioni UI SV3: «Gestisci la sala» esce da Servizio e diventa la tab
 * Sala della Scheda della sede. Servizio resta con Elenco e Mappa, tutti e
 * due del piano Pro: col piano Base la voce ha il lucchetto, e staff e
 * viewer entrando nella sede atterrano nella Sala.
 *
 * Scritto **prima** della pagina, in `test.fail`; ogni caso è passato a
 * `test` col commit che lo rende vero.
 *
 * Fixture su staging, la stessa di `comande.spec.ts`: la sede «Garbagnate»
 * ha tre tavoli, due senza zona, e una sola comanda attiva, in Nuove, sul
 * tavolo «T TEST» (5,80 €). Nessuna scrittura: i test che toccano una bozza
 * la annullano.
 *
 * Locator per ruolo o per testo visibile, mai per tag o classe.
 */

const SEDE = /Garbagnate/;
const TAVOLO = "T TEST";
/** Un giorno dello storico con una comanda servita (fixture). */
const GIORNO_STORICO = "2026-09-13";
const LUCCHETTO = '[aria-label="Funzione del piano Pro"]';

function nav(page: Page) {
    return page.getByRole("navigation", { name: "Menu principale" });
}

function main(page: Page) {
    return page.getByRole("main");
}

/** L'indirizzo della sede di test (`…/locations/:id`), dalla griglia delle Sedi. */
async function sedePath(page: Page): Promise<string> {
    await openBusinessPage(page, "locations", "Sedi");
    await page.getByRole("radio", { name: "Vista griglia" }).click();
    const card = main(page).getByRole("listitem").filter({ hasText: SEDE }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    const href = await card.locator('a[href*="/locations/"]').first().getAttribute("href");
    return href!.replace(/[?#].*$/, "").replace(/(\/locations\/[0-9a-f-]+).*$/, "$1");
}

/** Entra nella sede di test e apre una voce della sua sidebar. */
async function openVoce(page: Page, voce: string): Promise<string> {
    const base = await sedePath(page);
    await page.goto(base);
    await page.waitForURL(/\/locations\/[0-9a-f-]+\/[a-z-]+/);
    // Si clicca a atterraggio finito (una voce corrente in sidebar): un click
    // durante il redirect dell'indice verrebbe superato dal redirect.
    await expect(nav(page).locator('a[aria-current="page"]')).toHaveCount(1, { timeout: 10_000 });
    const link = nav(page).getByRole("link", { name: voce, exact: true });
    await expect(link).toBeVisible({ timeout: 10_000 });
    await link.click();
    return base;
}

function modo(page: Page, name: "Elenco" | "Mappa" | "Gestisci la sala" | "Sala") {
    return page.getByRole("tab", { name: new RegExp(`^${name}`) });
}

/** Apre Servizio dalla sidebar e sceglie la Mappa per nome. */
async function openMappa(page: Page): Promise<string> {
    const base = await openVoce(page, "Servizio");
    await expect(modo(page, "Mappa")).toBeVisible({ timeout: 15_000 });
    await modo(page, "Mappa").click();
    await expect(modo(page, "Mappa")).toHaveAttribute("aria-selected", "true");
    return base;
}

/** La tessera del tavolo della fixture nella Mappa. */
function tessera(page: Page) {
    return main(page).getByRole("button", { name: new RegExp(`^${TAVOLO}, `) });
}

test.describe("Servizio", () => {
    test("la sidebar della sede ha Servizio e Storico, non più Sala", async ({ page }) => {
        await openVoce(page, "Scheda");
        const sidebar = nav(page);
        // L'ordine della §51.5: prima il locale (Scheda, Cosa vedono i clienti), poi Operatività.
        const voci = ["Scheda", "Cosa vedono i clienti", "Servizio", "Prenotazioni", "Comande", "Storico"];
        for (const voce of voci) {
            await expect(sidebar.getByRole("link", { name: voce, exact: true })).toBeVisible();
        }
        await expect(sidebar.getByRole("link", { name: "Sala", exact: true })).toHaveCount(0);
        // Nell'ordine della sidebar: Servizio è la prima voce di Operatività.
        const labels = await sidebar.getByRole("link").allTextContents();
        const ordered = labels.map(l => l.trim()).filter(l => voci.includes(l));
        expect(ordered).toEqual(voci);
    });

    test("la Mappa, aperta per nome: i filtri e i tavoli per zona", async ({ page }) => {
        await openMappa(page);
        await expect(page).toHaveURL(/\/servizio\?modo=mappa$/, { timeout: 15_000 });
        await expect(modo(page, "Gestisci la sala")).toHaveCount(0);
        await expect(nav(page).getByRole("link", { name: "Servizio", exact: true })).toHaveAttribute("aria-current", "page");

        const filtri = main(page).getByRole("radiogroup");
        for (const f of ["Tutti", "Aperti", "Liberi", "Fuori servizio"]) {
            await expect(filtri.getByRole("radio", { name: f, exact: true })).toBeVisible({ timeout: 15_000 });
        }
        await expect(main(page).getByRole("list", { name: "Senza zona" }).getByRole("listitem")).toHaveCount(2, {
            timeout: 15_000
        });
        await expect(main(page).getByText(/manutenzione|occupat/i)).toHaveCount(0);
    });

    test("dalla Mappa si apre il pannello del conto del tavolo", async ({ page }) => {
        await openMappa(page);
        await expect(tessera(page)).toBeVisible({ timeout: 15_000 });
        await tessera(page).click();

        const drawer = page.getByRole("dialog");
        await expect(drawer).toBeVisible();
        await expect(drawer.getByText(TAVOLO).first()).toBeVisible();
        await expect(drawer.getByText(/^Ordini in corso/)).toBeVisible({ timeout: 15_000 });
        await expect(drawer.getByRole("button", { name: "Conferma" })).toBeVisible();
        await expect(drawer.getByText("Totale in corso", { exact: true })).toBeVisible();
        await expect(drawer.getByText("Fuori servizio", { exact: true })).toBeVisible();
        await expect(drawer.getByRole("button", { name: /^(Chiudi tavolo|Fatto)$/ })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(drawer).toHaveCount(0);
    });

    test("la Mappa: «Aperti» e «Liberi» filtrano le tessere", async ({ page }) => {
        await openMappa(page);
        const filtri = main(page).getByRole("radiogroup");
        await expect(main(page).getByRole("list", { name: "Tavoli" })).toHaveCount(0, { timeout: 15_000 });
        await expect(filtri.getByRole("radio", { name: "Aperti", exact: true })).toBeVisible({ timeout: 15_000 });
        await filtri.getByRole("radio", { name: "Aperti", exact: true }).click();
        const aperto = main(page).getByRole("button", { name: new RegExp(`^${TAVOLO}, Aperto`) });
        await expect(aperto).toBeVisible();
        await expect(main(page).getByRole("listitem").filter({ hasText: TAVOLO })).toContainText("5,80 €");

        await filtri.getByRole("radio", { name: "Liberi", exact: true }).click();
        await expect(aperto).toBeHidden();
        await expect(main(page).getByText("Nessun tavolo per questo filtro")).toBeVisible();
        await filtri.getByRole("radio", { name: "Tutti", exact: true }).click();
        await expect(aperto).toBeVisible();
    });

    test("SV2: ogni tessera disegna il suo tavolo, colorato dallo stato; niente «da 390 h»", async ({ page }) => {
        await openMappa(page);
        const zona = main(page).getByRole("list", { name: "Senza zona" });
        await expect(zona.getByRole("listitem")).toHaveCount(2, { timeout: 15_000 });
        // Un disegno per tessera.
        // Solo il disegno (aria-hidden): anche il menu ⋯ di ogni tessera ha un data-state.
        await expect(zona.locator('[aria-hidden="true"][data-state]')).toHaveCount(2);
        // Il tavolo aperto è verde, o grigio se la sessione è di un servizio precedente.
        // T TEST può stare in una zona qualsiasi dei dati di staging.
        const aperto = main(page).getByRole("listitem").filter({ hasText: TAVOLO });
        await expect(aperto.locator('[aria-hidden="true"][data-state]')).toHaveAttribute("data-state", /^(open|previous)$/);
        // Oltre 12 ore è «Aperta da un servizio precedente», mai «da 390 h».
        await expect(main(page).getByText(/da \d{3,} h/)).toHaveCount(0);
    });

    test("la Mappa è una griglia per zona: 3, 2, 1 colonne", async ({ page }) => {
        await openMappa(page);
        const zona = main(page).getByRole("list", { name: "Senza zona" });
        await expect(zona.getByRole("listitem")).toHaveCount(2, { timeout: 15_000 });
        const tops = () => zona.getByRole("listitem").evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)));
        const lefts = () => zona.getByRole("listitem").evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().left)));
        expect(new Set(await tops()).size).toBe(1);
        await page.setViewportSize({ width: 768, height: 900 });
        await expect.poll(async () => new Set(await tops()).size).toBe(1);
        await page.setViewportSize({ width: 375, height: 900 });
        await expect.poll(async () => new Set(await lefts()).size).toBe(1);
    });

    test("la Sala della Scheda: i tavoli, le zone, il nuovo tavolo; la capienza non c'è più", async ({ page }) => {
        const base = await sedePath(page);
        await page.goto(`${base}/sala`);
        await expect(modo(page, "Sala")).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });

        await expect(main(page).getByRole("table", { name: "Tavoli" })).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByText(TAVOLO, { exact: true }).first()).toBeVisible();
        await expect(main(page).getByRole("button", { name: "Nuovo tavolo" })).toBeVisible();
        await main(page).getByRole("button", { name: "Altre azioni" }).click();
        await expect(page.getByRole("menuitem", { name: "Zone e accostamenti" })).toBeVisible();
        await page.keyboard.press("Escape");
        // Capienza e durata stanno nella tab Prenotazioni (D3).
        await expect(main(page).getByText("Capienza della sala")).toHaveCount(0);
    });

    test("a 768 e 375 la Mappa non scorre di lato e i due modi restano a vista", async ({ page }) => {
        await openMappa(page);
        await expect(tessera(page)).toBeVisible({ timeout: 15_000 });
        for (const width of [768, 375]) {
            await page.setViewportSize({ width, height: 900 });
            await expect(tessera(page)).toBeVisible();
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            expect(overflow).toBeLessThanOrEqual(0);
        }
        // Due tab corte stanno nella riga anche a 375: la testata le tiene
        // (useCompactToolbar misura, non guarda la larghezza della finestra).
        await expect(modo(page, "Mappa")).toBeVisible();
        await expect(modo(page, "Elenco")).toBeVisible();
    });
});

test.describe("Servizio: piano e ruolo", () => {
    test("col piano base Servizio è del piano Pro: il pannello, e la voce col lucchetto", async ({ page }) => {
        const base = await sedePath(page);
        await asBasePlan(page);
        await page.goto(`${base}/servizio`);
        await expect(main(page).getByText("Servizio è una funzione del piano Pro")).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByRole("button", { name: "Passa a Pro" })).toBeVisible();
        await expect(nav(page).getByRole("link", { name: /^Servizio/ }).locator(LUCCHETTO)).toHaveCount(1);
    });

    test("col piano base ?modo=mappa non apre la Mappa", async ({ page }) => {
        const base = await sedePath(page);
        await asBasePlan(page);
        await page.goto(`${base}/servizio?modo=mappa`);
        await expect(main(page).getByText("Servizio è una funzione del piano Pro")).toBeVisible({ timeout: 15_000 });
        await expect(tessera(page)).toHaveCount(0);
    });

    test("il viewer legge la Mappa ma non conferma ordini né crea tavoli", async ({ page }) => {
        const base = await sedePath(page);
        await asRole(page, "viewer", base.split("/").pop()!, "pro");
        await page.goto(`${base}/servizio?modo=mappa`);
        await expect(tessera(page)).toBeVisible({ timeout: 15_000 });
        await tessera(page).click();
        const drawer = page.getByRole("dialog");
        await expect(drawer.getByText(/^Ordini in corso/)).toBeVisible({ timeout: 15_000 });
        await expect(drawer.getByRole("button", { name: "Conferma" })).toHaveCount(0);
        await page.keyboard.press("Escape");

        await page.goto(`${base}/sala`);
        await expect(main(page).getByRole("table", { name: "Tavoli" })).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByRole("button", { name: "Nuovo tavolo" })).toHaveCount(0);
    });

    // Col piano Pro si atterra sull'Elenco: i casi stanno in «Elenco (lotto B-b)».
    // Col piano Base si atterrava in «Gestisci la sala»: ora è la Sala (SV3).
    for (const { role, plan } of [
        { role: "staff", plan: "base" },
        { role: "viewer", plan: "base" }
    ] as const) {
        test(`${role}, piano ${plan}: entrando nella sede si arriva alla Sala della Scheda`, async ({ page }) => {
            const base = await sedePath(page);
            await asRole(page, role, base.split("/").pop()!, plan);
            await page.goto(base);
            await expect(page).toHaveURL(/\/sala$/, { timeout: 15_000 });
            await expect(modo(page, "Sala")).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
            await expect(main(page).getByText(/Non hai accesso|richiede il piano Pro/)).toHaveCount(0);
        });
    }
});

test.describe("Elenco (lotto B-b)", () => {
    let stub: ReservationsStub;
    test.beforeEach(async ({ page }) => {
        stub = await stubReservations(page);
    });

    test("col piano Pro Servizio si apre sull'Elenco", async ({ page }) => {
        await openVoce(page, "Servizio");
        await expect(page).toHaveURL(/\/servizio$/, { timeout: 15_000 });
        await expect(modo(page, "Elenco")).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
        await expect(modo(page, "Mappa")).toBeVisible();
        await expect(modo(page, "Gestisci la sala")).toHaveCount(0);
    });

    test("l'Elenco: in sala adesso, in arrivo, «Senza prenotazione»", async ({ page }) => {
        const base = await sedePath(page);
        await page.goto(`${base}/servizio?modo=elenco`);
        const m = main(page);
        await expect(m.getByText(/in sala adesso/i)).toBeVisible({ timeout: 15_000 });
        await expect(m.getByText("Paolo Gallo").first()).toBeVisible();
        await expect(m.getByText(/in arrivo/i)).toBeVisible();
        await expect(m.getByText("Sara Conti").first()).toBeVisible();
        await expect(m.getByText("Elena Riva").first()).toBeVisible();
        await expect(m.getByText("Ospite di Varedo")).toHaveCount(0);
        // T14 SV1: «+ Senza prenotazione» nella testata, sulla riga dei modi.
        const walkin = m.getByRole("button", { name: "Senza prenotazione" });
        await expect(walkin).toBeVisible();
        const walkinBox = await walkin.boundingBox();
        const elencoBox = await modo(page, "Elenco").boundingBox();
        expect(Math.abs(walkinBox!.y + walkinBox!.height / 2 - (elencoBox!.y + elencoBox!.height / 2))).toBeLessThan(16);
        // La riga «Oggi», una sola, in testa.
        const oggi = m.getByRole("status", { name: "Oggi" });
        await expect(oggi).toBeVisible();
        expect((await oggi.boundingBox())!.height).toBeLessThan(64);
        await expect(oggi).toContainText(/prenotazion/);
    });

    test("SV1: la riga «Oggi» è la stessa nella Mappa, senza «Senza prenotazione»", async ({ page }) => {
        const base = await sedePath(page);
        await page.goto(`${base}/servizio?modo=mappa`);
        const m = main(page);
        await expect(m.getByRole("status", { name: "Oggi" })).toBeVisible({ timeout: 15_000 });
        await expect(m.getByRole("button", { name: "Senza prenotazione" })).toHaveCount(0);
        const richieste = m.getByRole("link", { name: /richiest[ae] da gestire/ });
        if ((await richieste.count()) > 0) await expect(richieste).toHaveAttribute("href", /\/prenotazioni$/);
    });

    test("cablaggio: dall'Elenco la prenotazione al tavolo apre il suo dettaglio, e «Annulla apertura» spedisce undo_seating", async ({ page }) => {
        const base = await sedePath(page);
        stub.onWrite("undo_seating", () => null);
        await page.goto(`${base}/servizio?modo=elenco`);
        await expect(main(page).getByText("Paolo Gallo").first()).toBeVisible({ timeout: 15_000 });
        await main(page).getByText("Paolo Gallo").first().click();
        const drawer = page.getByRole("dialog");
        await drawer.getByRole("button", { name: "Annulla apertura" }).click();
        await expect.poll(() => stub.writes).toEqual([{ fn: "undo_seating", body: { p_seating_id: stub.seatingId } }]);
        await expect(page.getByText("Apertura annullata. Per riaprirla: Arrivato.")).toBeVisible();
    });

    test("«Senza prenotazione» apre la tavolata nuova e si chiude senza scrivere", async ({ page }) => {
        const base = await sedePath(page);
        await page.goto(`${base}/servizio?modo=elenco`);
        await main(page).getByRole("button", { name: "Senza prenotazione" }).click({ timeout: 15_000 });
        const drawer = page.getByRole("dialog");
        await expect(drawer.getByText("Tavolata senza prenotazione").first()).toBeVisible();
        await expect(drawer.getByRole("button", { name: "Apri tavolata" })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(drawer).toHaveCount(0);
        expect(stub.writes).toHaveLength(0);
    });

    test("il viewer legge l'Elenco ma non apre tavolate", async ({ page }) => {
        const base = await sedePath(page);
        await asRole(page, "viewer", base.split("/").pop()!, "pro");
        await page.goto(`${base}/servizio?modo=elenco`);
        await expect(main(page).getByText("Paolo Gallo").first()).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByRole("button", { name: "Senza prenotazione" })).toHaveCount(0);
    });

    test("col piano base l'Elenco non si apre: il pannello del piano Pro", async ({ page }) => {
        const base = await sedePath(page);
        await asBasePlan(page);
        await page.goto(`${base}/servizio?modo=elenco`);
        await expect(main(page).getByText("Servizio è una funzione del piano Pro")).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByText(/in sala adesso/i)).toHaveCount(0);
    });

    // Il manager configura la sede: atterra sulla Scheda (§51.6), come owner e admin.
    test("manager, piano pro: entrando nella sede si arriva alla Scheda", async ({ page }) => {
        const base = await sedePath(page);
        await asRole(page, "manager", base.split("/").pop()!, "pro");
        await page.goto(base);
        await expect(page).toHaveURL(/\/anagrafica$/, { timeout: 15_000 });
    });

    for (const role of ["staff", "viewer"] as const) {
        test(`${role}, piano pro: entrando nella sede si arriva a Servizio, nell'Elenco`, async ({ page }) => {
            const base = await sedePath(page);
            await asRole(page, role, base.split("/").pop()!, "pro");
            await page.goto(base);
            await expect(page).toHaveURL(/\/servizio$/, { timeout: 15_000 });
            await expect(modo(page, "Elenco")).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
            await expect(main(page).getByText(/Non hai accesso|richiede il piano Pro/)).toHaveCount(0);
        });
    }

    test("prenotazioni?tab=service porta all'Elenco", async ({ page }) => {
        const base = await sedePath(page);
        await page.goto(`${base}/prenotazioni?tab=service`);
        await expect(page).toHaveURL(/\/servizio\?modo=elenco$/, { timeout: 15_000 });
        await expect(main(page).getByText(/in sala adesso/i)).toBeVisible({ timeout: 15_000 });
    });

    test("a 768 e 375 l'Elenco non scorre di lato", async ({ page }) => {
        const base = await sedePath(page);
        await page.goto(`${base}/servizio?modo=elenco`);
        await expect(main(page).getByText("Paolo Gallo").first()).toBeVisible({ timeout: 15_000 });
        for (const width of [768, 375]) {
            await page.setViewportSize({ width, height: 900 });
            await expect(main(page).getByText("Paolo Gallo").first()).toBeVisible();
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            expect(overflow).toBeLessThanOrEqual(0);
        }
    });
});

test.describe("Storico", () => {
    test("è una voce della sede, coi segmenti, il giorno e la tabella", async ({ page }) => {
        await openVoce(page, "Storico");
        await expect(page).toHaveURL(/\/storico$/, { timeout: 15_000 });
        await expect(nav(page).getByRole("link", { name: "Storico", exact: true })).toHaveAttribute("aria-current", "page");
        const segmenti = main(page).getByRole("radiogroup");
        for (const s of ["Tutti", "Serviti", "Annullati"]) {
            await expect(segmenti.getByRole("radio", { name: s, exact: true })).toBeVisible({ timeout: 15_000 });
        }
        await expect(page.getByRole("button", { name: "Giorno successivo" })).toBeDisabled();
        await page.getByRole("button", { name: "Giorno precedente" }).click();
        await expect(page.getByRole("button", { name: "Giorno successivo" })).toBeEnabled();
        await page.getByRole("button", { name: "Giorno successivo" }).click();
        await expect(page.getByRole("button", { name: "Giorno successivo" })).toBeDisabled();
        await expect(page.getByText("Errore caricamento storico")).toHaveCount(0);
        await expect(
            main(page).getByRole("columnheader", { name: "Tavolo" }).or(page.getByText("Nessun ordine nello storico di oggi")).first()
        ).toBeVisible({ timeout: 15_000 });
    });

    test("un giorno con una comanda servita: dettaglio, Ripristina, e a 375 niente scroll di lato", async ({ page }) => {
        await openVoce(page, "Storico");
        await expect(main(page).getByText(/^\d+ element[oi]$/)).toBeVisible({ timeout: 15_000 });
        await page.getByLabel("Scegli il giorno dello storico").fill(GIORNO_STORICO);
        const azioni = main(page).getByRole("button", { name: "Azioni per T1" }).first();
        await expect(azioni).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByText("Servita", { exact: true })).toBeVisible();

        await azioni.click();
        await expect(page.getByRole("menuitem", { name: "Vedi dettaglio" })).toBeVisible();
        // Ripristina c'è per chi gestisce gli ordini: non si clicca (scrive).
        await expect(page.getByRole("menuitem", { name: "Ripristina" })).toBeVisible();
        await page.keyboard.press("Escape");

        await page.setViewportSize({ width: 375, height: 900 });
        await expect(azioni).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
    });

    test("col piano base lo Storico ha il lucchetto e non è un atterraggio", async ({ page }) => {
        const base = await sedePath(page);
        await asBasePlan(page);
        await page.goto(base);
        // Owner: si atterra sulla Scheda (§51.6), non sullo Storico chiuso.
        await expect(page).toHaveURL(/\/anagrafica$/, { timeout: 15_000 });
        // Il lucchetto entra nel nome accessibile della voce: «Storico …».
        await expect(nav(page).getByRole("link", { name: /^Storico/ }).locator(LUCCHETTO)).toHaveCount(1, {
            timeout: 15_000
        });
    });
});

test.describe("Indirizzi vecchi", () => {
    test("servizio?modo=gestisci porta alla Sala della Scheda (SV3)", async ({ page }) => {
        const base = await sedePath(page);
        await page.goto(`${base}/servizio?modo=gestisci`);
        await expect(page).toHaveURL(/\/sala$/, { timeout: 15_000 });
        await expect(modo(page, "Sala")).toHaveAttribute("aria-selected", "true");
    });

    test("comande?tab=tavoli porta alla Mappa", async ({ page }) => {
        const base = await sedePath(page);
        await page.goto(`${base}/comande?tab=tavoli`);
        await expect(page).toHaveURL(/\/servizio\?modo=mappa$/, { timeout: 15_000 });
        await expect(tessera(page)).toBeVisible({ timeout: 15_000 });
    });

    test("comande?tab=storico porta allo Storico", async ({ page }) => {
        const base = await sedePath(page);
        await page.goto(`${base}/comande?tab=storico`);
        await expect(page).toHaveURL(/\/storico$/, { timeout: 15_000 });
    });

    test("/orders?tab=tavoli, il link dei toast, porta alla Mappa dell'ultima sede", async ({ page }) => {
        const base = await sedePath(page);
        await page.goto(`${base}/comande`);
        await expect(page).toHaveURL(/\/comande$/, { timeout: 15_000 });
        await page.goto(base.replace(/\/locations\/.*$/, "/orders?tab=tavoli"));
        await expect(page).toHaveURL(/\/locations\/[0-9a-f-]+\/servizio\?modo=mappa$/, { timeout: 15_000 });
    });
});

test.describe("Capienza nella Scheda", () => {
    test("capienza e durata stanno nella tab Prenotazioni, nella bozza della Scheda", async ({ page }) => {
                const base = await sedePath(page);
        // Le prenotazioni della sede di test risultano attive: i campi stanno
        // nella sezione Prenotazioni, che senza non mostra le regole.
        await page.route(/\/rest\/v1\/activities\?.*id=eq\./, async route => {
            const response = await route.fetch();
            const text = await response.text();
            const body: unknown = text ? JSON.parse(text) : null;
            const patch = (row: Record<string, unknown>) => ({ ...row, enable_reservations: true });
            const json = Array.isArray(body)
                ? body.map(r => patch(r as Record<string, unknown>))
                : body && typeof body === "object"
                  ? patch(body as Record<string, unknown>)
                  : body;
            await route.fulfill({ response, json });
        });
        await page.goto(`${base}/prenotazioni-online`);
        const capienza = main(page).getByRole("spinbutton", { name: /^Capienza \(coperti\)/ });
        await expect(capienza).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByRole("spinbutton", { name: /^Durata media tavolo \(minuti\)/ })).toBeVisible();

        // Entra nella bozza unica della Scheda: un Salva solo, che qui si annulla.
        // Correzioni UI T1: il salvataggio sta nella barra della pagina, e il
        // suo Annulla chiede conferma come nelle altre pagine.
        await capienza.fill("37");
        await expect(page.getByRole("button", { name: "Salva" })).toBeVisible();
        await page.getByRole("button", { name: "Annulla" }).click();
        await page.getByRole("alertdialog").getByRole("button", { name: "Scarta" }).click();
        await expect(page.getByRole("button", { name: "Salva" })).toHaveCount(0);
    });
});
