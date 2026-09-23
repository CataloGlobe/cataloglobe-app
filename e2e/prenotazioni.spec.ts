import { expect, test, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";
import { stubReservations, type ReservationsStub } from "./reservationsStub";

/**
 * Prenotazioni (lotto `ds-5-prenotazioni`, passo 2 P0). Scritto sulla pagina
 * di **oggi**, prima di ricomporla: deve restare verde passo dopo passo.
 *
 * Dati: le prenotazioni e la sala sono finte (`reservationsStub.ts`), perché
 * la sede di test non ne ha e una fixture spostata a mano rompe la suite
 * (§47.2, apertura 1). Sedi, tavoli e permessi sono veri. Nessuna scrittura
 * parte: i gesti che scrivono hanno un test di cablaggio che controlla il
 * corpo della chiamata e risponde come il server.
 *
 * Dove un nome cambierà nei passi successivi (dizionario unico, P6) il
 * locator accetta il nome di oggi e quello di domani.
 *
 * Locator per ruolo o per testo visibile, mai per tag o classe.
 */

const SEDE = /Garbagnate/;

function main(page: Page) {
    return page.getByRole("main");
}

/** Entra nella sede di test dalla griglia delle Sedi e apre Prenotazioni dalla sua sidebar. */
async function openPrenotazioni(page: Page): Promise<void> {
    await openBusinessPage(page, "locations", "Sedi");
    await page.getByRole("radio", { name: "Vista griglia" }).click();
    const card = main(page).getByRole("listitem").filter({ hasText: SEDE }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.getByRole("link").first().click();
    await page.waitForURL(/\/locations\/[0-9a-f-]+\/anagrafica$/);
    await page
        .getByRole("navigation", { name: "Menu principale" })
        .getByRole("link", { name: "Prenotazioni", exact: true })
        .click();
    await expect(page).toHaveURL(/\/locations\/[0-9a-f-]+\/prenotazioni/, { timeout: 15_000 });
    // La pagina è pronta quando la prima richiesta finta è arrivata.
    await expect(main(page).getByText("Giulia Bianchi").first()).toBeVisible({ timeout: 15_000 });
}

async function selectTab(page: Page, name: RegExp): Promise<void> {
    await page.getByRole("tab", { name }).click();
    await expect(page.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
}

async function noSideScroll(page: Page): Promise<void> {
    const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
}

let stub: ReservationsStub;

test.beforeEach(async ({ page }) => {
    stub = await stubReservations(page);
});

test.describe("Prenotazioni", () => {
    test("si apre sull'Agenda, con la coda da gestire in cima e lo stato di oggi", async ({ page }) => {
        await openPrenotazioni(page);

        // Due schede (passo 2 P5): il contatore delle richieste sta sull'Agenda.
        // Tre in attesa a Garbagnate: quella di Varedo non si conta.
        await expect(page.getByRole("tab", { name: /^Agenda\s*3$/ })).toHaveAttribute("aria-selected", "true");
        await expect(page.getByRole("tab", { name: "Servizio", exact: true })).toBeVisible();
        await expect(page.getByRole("tab", { name: /Da gestire/ })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Nuova prenotazione" }).first()).toBeVisible();

        // La coda è una card in cima all'Agenda.
        // (La prima occorrenza è il titolo della card: sotto, le righe in agenda
        // hanno lo stato «Da gestire».)
        await expect(main(page).getByText("Da gestire", { exact: true }).first()).toBeVisible();
        // Lo stato di oggi: 4 prenotazioni accettate, ~15 coperti, 3 da gestire.
        const oggi = main(page).getByRole("status", { name: /arrivo|prenotazione oggi/ });
        await expect(oggi).toContainText("Oggi");
        await expect(oggi).toContainText("da gestire");
        await expect(oggi).toContainText("~15");
    });

    test("un vecchio link a «Da gestire» apre l'Agenda", async ({ page }) => {
        await openPrenotazioni(page);
        await page.goto(page.url().replace(/\?.*$/, "") + "?tab=inbox");
        await expect(page.getByRole("tab", { name: /^Agenda/ })).toHaveAttribute("aria-selected", "true");
        await expect(main(page).getByText("Giulia Bianchi").first()).toBeVisible({ timeout: 15_000 });
    });

    test("«Da gestire»: le richieste della sede, le scadute a parte, le azioni in riga", async ({ page }) => {
        await openPrenotazioni(page);
        const m = main(page);

        const giulia = m.getByRole("button", { name: /Giulia Bianchi/ }).first();
        await expect(giulia).toBeVisible();
        await expect(m.getByText("Compleanno, se possibile tavolo tranquillo").first()).toBeVisible();
        await expect(m.getByRole("button", { name: /Marco Rossi/ }).first()).toBeVisible();

        // La scaduta sta sotto la sua intestazione, e si può solo rifiutare.
        await expect(m.getByText(/^Scadute/i)).toBeVisible();
        const luca = m.getByRole("button", { name: /Luca Verdi/ }).first();
        await expect(luca.getByRole("button", { name: "Rifiuta", exact: true })).toBeVisible();
        await expect(luca.getByRole("button", { name: "Conferma", exact: true })).toHaveCount(0);
        // Spenta, ma si apre ancora: il dettaglio dice cosa ne è stato.
        await luca.click();
        await expect(page.getByRole("dialog")).toContainText("Luca Verdi");
        await page.getByRole("dialog").getByRole("button", { name: "Chiudi" }).first().click();
        await expect(page.getByRole("dialog")).toHaveCount(0);

        await expect(giulia.getByRole("button", { name: "Conferma", exact: true })).toBeVisible();
        await expect(giulia.getByRole("button", { name: "Rifiuta", exact: true })).toBeVisible();

        // Un'altra sede della stessa azienda non entra nella coda di questa.
        await expect(m.getByText("Ospite di Varedo")).toHaveCount(0);
    });

    test("cablaggio: «Conferma» spedisce confirm con l'id della riga, dopo l'undo", async ({ page }) => {
        await openPrenotazioni(page);
        const giulia = stub.rows.find(r => r.customer_name === "Giulia Bianchi")!;
        stub.onWrite("respond-reservation", () => ({
            success: true,
            reservation_id: giulia.id,
            status: "confirmed"
        }));

        const request = page.waitForRequest(
            req => req.url().endsWith("/functions/v1/respond-reservation") && req.method() === "POST",
            { timeout: 15_000 }
        );
        await main(page)
            .getByRole("button", { name: /Giulia Bianchi/ })
            .first()
            .getByRole("button", { name: "Conferma", exact: true })
            .click();

        // Subito: il toast con l'undo, e niente ancora spedito.
        await expect(page.getByText("Prenotazione confermata.")).toBeVisible();
        expect(stub.writes).toHaveLength(0);

        // Allo scadere del toast parte la scrittura, una sola, col corpo giusto.
        await request;
        await expect.poll(() => stub.writes).toEqual([
            { fn: "respond-reservation", body: { reservation_id: giulia.id, action: "confirm" } }
        ]);
    });

    test("cablaggio: «Annulla apertura» spedisce undo_seating con la tavolata, e il toast dice come riaprire", async ({ page }) => {
        await openPrenotazioni(page);
        stub.onWrite("undo_seating", () => null);

        await main(page).getByText("Paolo Gallo").first().click();
        const drawer = page.getByRole("dialog");
        await drawer.getByRole("button", { name: "Annulla apertura" }).click();

        await expect.poll(() => stub.writes).toEqual([
            { fn: "undo_seating", body: { p_seating_id: stub.seatingId } }
        ]);
        await expect(page.getByText("Apertura annullata. Per riaprirla: Arrivato.")).toBeVisible();
    });

    test("cablaggio: il tavolo scelto a mano spedisce set_reservation_tables, e prima lo dice", async ({ page }) => {
        await openPrenotazioni(page);
        const sara = stub.rows.find(r => r.customer_name === "Sara Conti")!;
        stub.onWrite("set_reservation_tables", () => []);

        await selectTab(page, /^Agenda/);
        await main(page).getByText("Sara Conti").first().click();
        const drawer = page.getByRole("dialog", { name: "Prenotazione" });
        await drawer.getByRole("button", { name: "Scegli tavolo" }).click();

        // §14: la riga che dice che la scelta a mano resta, prima di confermare.
        await expect(drawer.getByText("Scelto a mano: resta questo anche se la prenotazione cambia.")).toBeVisible();
        await drawer.getByRole("checkbox", { name: /^T1\b/ }).first().check();
        await drawer.getByRole("button", { name: "Conferma", exact: true }).click();

        await expect.poll(() => stub.writes.map(w => w.fn)).toEqual(["set_reservation_tables"]);
        const body = stub.writes[0].body as { p_reservation_id: string; p_table_ids: string[] };
        expect(body.p_reservation_id).toBe(sara.id);
        expect(body.p_table_ids).toHaveLength(1);
    });

    test("Agenda: i giorni con le righe e lo stato, poi la settimana", async ({ page }) => {
        await openPrenotazioni(page);
        await selectTab(page, /^Agenda/);
        const m = main(page);

        await expect(m.getByText("Oggi", { exact: true }).first()).toBeVisible();
        await expect(m.getByText("Sara Conti").first()).toBeVisible();
        await expect(m.getByText("Confermata", { exact: true }).first()).toBeVisible();
        await expect(m.getByText("Al tavolo", { exact: true }).first()).toBeVisible();
        // Un dizionario solo (§14, §18.5): «Servita», mai «Completata»; la
        // richiesta in agenda è «Da gestire», mai «In attesa».
        await expect(m.getByText("Servita", { exact: true }).first()).toBeVisible();
        await expect(m.getByText(/^(Completata|In attesa)$/)).toHaveCount(0);
        await expect(m.getByText("Ospite di Varedo")).toHaveCount(0);

        // Le annullate stanno dietro il loro filtro; accese, sono spente ma si aprono.
        await expect(m.getByText("Carla Fumagalli")).toHaveCount(0);
        await m.getByText("Annullate", { exact: true }).click();
        await m.getByRole("button", { name: /Carla Fumagalli/ }).first().click();
        await expect(page.getByRole("dialog")).toContainText("Annullata");
        await page.getByRole("dialog").getByRole("button", { name: "Chiudi" }).first().click();

        await m.getByRole("radio", { name: "Settimana" }).click();
        await expect(m.getByRole("button", { name: /^Sara Conti 20:30/ })).toBeVisible();
        await expect(m.getByRole("group", { name: "Naviga settimana" })).toBeVisible();
    });

    test("Servizio: in sala adesso e in arrivo", async ({ page }) => {
        await openPrenotazioni(page);
        await selectTab(page, /^Servizio$/);
        const m = main(page);

        await expect(m.getByText(/in sala adesso/i)).toBeVisible();
        await expect(m.getByText("Paolo Gallo").first()).toBeVisible();
        await expect(m.getByText(/in arrivo/i)).toBeVisible();
        await expect(m.getByText("Sara Conti").first()).toBeVisible();
        await expect(m.getByText("Elena Riva").first()).toBeVisible();
        await expect(m.getByRole("button", { name: "Senza prenotazione" })).toBeVisible();
    });

    test("ricerca per nome", async ({ page }) => {
        await openPrenotazioni(page);
        await page.getByRole("searchbox").or(page.getByPlaceholder(/Cerca per nome o telefono/)).first().fill("Rossi");

        const m = main(page);
        await expect(m.getByText(/^1 prenotazione/)).toBeVisible({ timeout: 10_000 });
        await expect(m.getByRole("button", { name: /Marco Rossi/ })).toBeVisible();
        await expect(m.getByText("Giulia Bianchi")).toHaveCount(0);

        // Una tabella: la data con l'anno, lo stato; da tastiera si apre dal nome.
        await expect(m.getByRole("columnheader", { name: "Stato" }).or(m.getByText("Stato", { exact: true })).first()).toBeVisible();
        await expect(m.getByText(/\b20\d\d\b/).first()).toBeVisible();
        await m.getByRole("button", { name: "Marco Rossi", exact: true }).focus();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("dialog")).toContainText("Marco Rossi");
        await page.getByRole("dialog").getByRole("button", { name: "Chiudi" }).first().click();

        // Nessun risultato: lo dice, e suggerisce come cercare.
        await page.getByRole("searchbox").or(page.getByPlaceholder(/Cerca per nome o telefono/)).first().fill("Zzyzx");
        await expect(m.getByText("Nessuna prenotazione trovata")).toBeVisible({ timeout: 10_000 });
        await page.getByRole("searchbox").or(page.getByPlaceholder(/Cerca per nome o telefono/)).first().fill("Rossi");
        await expect(m.getByText(/^1 prenotazione/)).toBeVisible({ timeout: 10_000 });

        // Il clic su una scheda chiude la ricerca e apre la scheda (§48.2/3).
        await page.getByRole("tab", { name: "Servizio", exact: true }).click();
        await expect(m.getByText(/in sala adesso/i)).toBeVisible();
        await expect(m.getByText(/^1 prenotazione/)).toHaveCount(0);
    });

    test("dettaglio: il piede cambia con lo stato", async ({ page }) => {
        await openPrenotazioni(page);
        await selectTab(page, /^Agenda/);

        await main(page).getByText("Sara Conti").first().click();
        const drawer = page.getByRole("dialog", { name: "Prenotazione" });
        await expect(drawer).toBeVisible();
        // Taglia di sistema `md` (520), non più i 560 scritti a mano.
        expect(await drawer.evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(520);
        await expect(drawer.getByRole("button", { name: "Chiudi" })).toBeVisible();
        await expect(drawer.getByText("Confermata", { exact: true })).toBeVisible();
        await expect(drawer.getByRole("button", { name: "Modifica" })).toBeVisible();
        await expect(drawer.getByRole("button", { name: "Annulla prenotazione" })).toBeVisible();
        await expect(drawer.getByRole("button", { name: "Arrivato" })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(drawer).toHaveCount(0);

        await main(page).getByText("Giulia Bianchi").first().click();
        await expect(drawer.getByRole("button", { name: "Conferma", exact: true })).toBeVisible();
        await expect(drawer.getByRole("button", { name: "Rifiuta", exact: true })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(drawer).toHaveCount(0);
        expect(stub.writes).toHaveLength(0);
    });

    test("«Nuova prenotazione» apre il form e si chiude senza salvare", async ({ page }) => {
        await openPrenotazioni(page);
        await page.getByRole("button", { name: "Nuova prenotazione" }).first().click();

        const drawer = page.getByRole("dialog", { name: "Nuova prenotazione" });
        await expect(drawer).toBeVisible();
        await expect(drawer.getByRole("button", { name: "Crea prenotazione" })).toBeVisible();
        expect(await drawer.evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(520);
        await drawer.getByRole("button", { name: "Annulla", exact: true }).click();
        await expect(drawer).toHaveCount(0);
        expect(stub.writes).toHaveLength(0);
    });

    test("il form con qualcosa di scritto chiede prima di chiudersi (§27)", async ({ page }) => {
        await openPrenotazioni(page);
        await page.getByRole("button", { name: "Nuova prenotazione" }).first().click();
        const drawer = page.getByRole("dialog", { name: "Nuova prenotazione" });
        await drawer.getByLabel(/Nome cliente/).fill("Mario Rossi");

        await drawer.getByRole("button", { name: "Annulla", exact: true }).click();
        const guard = page.getByRole("alertdialog", { name: "Uscire senza salvare?" });
        await expect(guard).toBeVisible();
        await guard.getByRole("button", { name: "Resta" }).click();
        await expect(drawer.getByLabel(/Nome cliente/)).toHaveValue("Mario Rossi");

        await page.keyboard.press("Escape");
        await guard.getByRole("button", { name: "Esci senza salvare" }).click();
        await expect(drawer).toHaveCount(0);
        expect(stub.writes).toHaveLength(0);
    });

    test("il filtro canale restringe l'agenda", async ({ page }) => {
        await openPrenotazioni(page);
        await selectTab(page, /^Agenda/);
        const m = main(page);

        await page.getByRole("combobox", { name: "Filtra per canale" }).selectOption({ label: "Solo a mano" });
        await expect(m.getByText("Elena Riva").first()).toBeVisible();
        await expect(m.getByText("Sara Conti")).toHaveCount(0);
    });

    test("/reservations porta dentro una sede, non resta una pagina d'azienda", async ({ page }) => {
        await openPrenotazioni(page);
        const sede = page.url();

        await page.goto(sede.replace(/\/locations\/.*$/, "/reservations"));
        // All'ultima sede usata o, se non si può decidere, in Sedi (§48.1).
        await expect(page).toHaveURL(/\/locations\/[0-9a-f-]+\/prenotazioni$|\/locations$/, { timeout: 15_000 });
    });

    test("gli ingressi di una sede portano alle Prenotazioni di quella sede", async ({ page }) => {
        await openPrenotazioni(page);
        const sede = page.url().replace(/\?.*$/, "");
        const base = sede.replace(/\/locations\/.*$/, "");

        // «Ordini e prenotazioni» della scheda: il rimando resta nella sede.
        await page.goto(sede.replace(/\/prenotazioni$/, "/ordini-prenotazioni"));
        await main(page).getByRole("link", { name: "Prenotazioni", exact: true }).click();
        await expect(page).toHaveURL(sede, { timeout: 15_000 });

        // Il menu della sede in Panoramica.
        await page.goto(`${base}/overview`);
        await main(page).getByRole("button", { name: /^Azioni per .*Garbagnate/ }).click();
        await page.getByRole("menuitem", { name: "Prenotazioni", exact: true }).click();
        await expect(page).toHaveURL(sede, { timeout: 15_000 });

        // Nello stesso menu, «Ordini» porta alle comande della stessa sede.
        await page.goto(`${base}/overview`);
        await main(page).getByRole("button", { name: /^Azioni per .*Garbagnate/ }).click();
        await page.getByRole("menuitem", { name: "Ordini", exact: true }).click();
        await expect(page).toHaveURL(sede.replace(/\/prenotazioni$/, "/comande"), { timeout: 15_000 });
    });

    test("una sede che non esiste lo dice, invece di mostrare liste vuote", async ({ page }) => {
        await openPrenotazioni(page);
        await page.goto(page.url().replace(/\/locations\/[0-9a-f-]+\//, "/locations/00000000-0000-4000-8000-00000000dead/"));

        await expect(page.getByText("Sede non trovata")).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole("button", { name: "Torna alle sedi" })).toBeVisible();
    });

    for (const width of [1280, 768, 375]) {
        test(`a ${width} le tre viste non scorrono di lato`, async ({ page }) => {
            await openPrenotazioni(page);
            await page.setViewportSize({ width, height: 900 });
            await expect(main(page).getByText("Giulia Bianchi").first()).toBeVisible();
            await noSideScroll(page);

            for (const tab of ["agenda", "service"]) {
                await page.goto(page.url().replace(/\?.*$/, "") + `?tab=${tab}`);
                await expect(main(page).getByText("Sara Conti").first()).toBeVisible({ timeout: 15_000 });
                await noSideScroll(page);
            }

            // La ricerca: una tabella, che a 375 tiene solo data, nome e stato.
            // In testata compatta il campo si apre dal bottone «Cerca».
            const openSearch = page.getByRole("button", { name: "Cerca", exact: true });
            if (await openSearch.isVisible()) await openSearch.click();
            await page.getByRole("textbox", { name: /Cerca per nome o telefono/ }).filter({ visible: true }).fill("Rossi");
            await expect(main(page).getByRole("button", { name: "Marco Rossi", exact: true })).toBeVisible({ timeout: 10_000 });
            await noSideScroll(page);
        });
    }
});
