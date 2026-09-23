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
    test("si apre dal contesto della sede, con la coda da gestire", async ({ page }) => {
        await openPrenotazioni(page);

        // Tre richieste in attesa a Garbagnate: quella di Varedo non si conta.
        await expect(page.getByRole("tab", { name: /^Da gestire\s*3$/ })).toBeVisible();
        await expect(page.getByRole("tab", { name: "Agenda", exact: true })).toBeVisible();
        await expect(page.getByRole("tab", { name: "Servizio", exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Nuova prenotazione" }).first()).toBeVisible();
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

    test("Agenda: i giorni con le righe e lo stato, poi la settimana", async ({ page }) => {
        await openPrenotazioni(page);
        await selectTab(page, /^Agenda$/);
        const m = main(page);

        await expect(m.getByText("Oggi", { exact: true }).first()).toBeVisible();
        await expect(m.getByText("Sara Conti").first()).toBeVisible();
        await expect(m.getByText("Confermata", { exact: true }).first()).toBeVisible();
        await expect(m.getByText("Al tavolo", { exact: true }).first()).toBeVisible();
        // Il dizionario unico arriva in P6: oggi «Completata», domani «Servita».
        await expect(m.getByText(/^(Completata|Servita)$/).first()).toBeVisible();
        await expect(m.getByText("Ospite di Varedo")).toHaveCount(0);

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
    });

    test("dettaglio: il piede cambia con lo stato", async ({ page }) => {
        await openPrenotazioni(page);
        await selectTab(page, /^Agenda$/);

        await main(page).getByText("Sara Conti").first().click();
        const drawer = page.getByRole("dialog");
        await expect(drawer).toBeVisible();
        await expect(drawer.getByText("Prenotazione", { exact: true })).toBeVisible();
        await expect(drawer.getByText("Confermata", { exact: true })).toBeVisible();
        await expect(drawer.getByRole("button", { name: "Modifica" })).toBeVisible();
        await expect(drawer.getByRole("button", { name: /^Annulla( prenotazione)?$/ })).toBeVisible();
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

        const drawer = page.getByRole("dialog");
        await expect(drawer.getByText("Nuova prenotazione").first()).toBeVisible();
        await expect(drawer.getByRole("button", { name: "Crea prenotazione" })).toBeVisible();
        await drawer.getByRole("button", { name: "Annulla", exact: true }).click();
        await expect(drawer).toHaveCount(0);
        expect(stub.writes).toHaveLength(0);
    });

    test("il filtro canale restringe l'agenda", async ({ page }) => {
        await openPrenotazioni(page);
        await selectTab(page, /^Agenda$/);
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
        });
    }
});
