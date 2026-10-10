import { expect, test, type Locator, type Page } from "@playwright/test";
import { openBusinessPage, openBusinessPageByUrl } from "./business";
import { sidebarVoci } from "./nav";
import { GUEST, SEDE, stubClienti, type ClientiStub, type WriteCall } from "./clientiStub";
import type { Row } from "./restStub";

/**
 * Clienti (lotto `ds-5-coda`, P0), rifatta come «Clienti A» (D154): righe a
 * colonne con i pallini dei 12 mesi, filtri con i conteggi, la riga di chi
 * non torna, la scheda compatta accanto.
 *
 * Dati finti in `clientiStub.ts`; permessi, piano, azienda e sidebar veri.
 */

function main(page: Page) {
    return page.getByRole("main");
}

function drawer(page: Page): Locator {
    return page.getByRole("dialog").last();
}

function writes(stub: ClientiStub, key: string): WriteCall[] {
    return stub.writes.filter(w => w.key === key);
}

async function openList(page: Page): Promise<void> {
    await openBusinessPage(page, "guests", "Clienti");
}

async function noSideScroll(page: Page): Promise<void> {
    const overflow = await page.evaluate(() => {
        const de = document.documentElement;
        const scrollers = [de, ...Array.from(document.querySelectorAll<HTMLElement>("main"))];
        return Math.max(...scrollers.map(el => el.scrollWidth - el.clientWidth));
    });
    expect(overflow).toBeLessThanOrEqual(0);
}

/** La riga di un cliente nell'elenco «Clienti». */
function rowOf(page: Page, name: string): Locator {
    return main(page).getByRole("list", { name: "Clienti" }).getByRole("listitem").filter({ hasText: name });
}

function guestName(page: Page, name: string): Locator {
    return main(page).getByText(name, { exact: true }).first();
}

async function openGuest(page: Page, name: string): Promise<Locator> {
    await guestName(page, name).click();
    const d = drawer(page);
    await expect(d.getByText(name).first()).toBeVisible();
    return d;
}

let stub: ClientiStub;

test.describe("Clienti — elenco", () => {
    test.beforeEach(async ({ page }) => {
        stub = await stubClienti(page);
    });

    test("righe dall'ultima visita: nome, segni, telefono e sedi, pallini, assenze", async ({ page }) => {
        await openList(page);
        await expect(guestName(page, "Giulia Rossi e2e")).toBeVisible({ timeout: 15_000 });
        const order = await main(page).getByText(/^(Giulia Rossi|Marco Bianchi|Sara Verdi) e2e$/).allTextContents();
        expect(order).toEqual(["Giulia Rossi e2e", "Marco Bianchi e2e", "Sara Verdi e2e"]);
        const rossi = rowOf(page, "Giulia Rossi e2e");
        await expect(rossi.getByText("abituale", { exact: true })).toBeVisible();
        await expect(rossi.getByText("+39 333 111 2233 · Centro e2e", { exact: true })).toBeVisible();
        await expect(rossi.getByRole("img", { name: "Ultimi 12 mesi: venuto in 1 mese" })).toBeVisible();
        await expect(rossi.getByText("20 set", { exact: true })).toBeVisible();
        // «Da sapere»: le etichette tranne «abituale», poi le note.
        await expect(rossi.getByText("VIP · Preferisce il tavolo in fondo.", { exact: true })).toBeVisible();
        await expect(rowOf(page, "Sara Verdi e2e").getByText("nuovo", { exact: true })).toBeVisible();
        // Le assenze si vedono solo dove ci sono.
        await expect(rowOf(page, "Marco Bianchi e2e").getByText("2 assenze", { exact: true })).toBeVisible();
        await expect(main(page).getByText(/0 assenze/)).toHaveCount(0);
        for (const header of ["Cliente", "Ultimi 12 mesi", "Ultima volta", "Da sapere"]) {
            await expect(main(page).getByText(header, { exact: true }).first()).toBeVisible();
        }
        await expect(main(page).getByRole("radio", { name: "Vista tabella" })).toHaveCount(0);
    });

    test("filtri con i conteggi e la riga di chi non torna", async ({ page }) => {
        await openList(page);
        await expect(guestName(page, "Giulia Rossi e2e")).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByRole("radio", { name: "Tutti 4" })).toBeVisible();
        await expect(main(page).getByRole("radio", { name: "Abituali 1" })).toBeVisible();
        await expect(main(page).getByRole("radio", { name: "Nuovi nel mese 1" })).toBeVisible();
        await expect(main(page).getByRole("radio", { name: "Con assenze 1" })).toBeVisible();
        await main(page).getByRole("radio", { name: "Con assenze 1" }).click();
        await expect(guestName(page, "Giulia Rossi e2e")).toHaveCount(0);
        await expect(guestName(page, "Marco Bianchi e2e")).toBeVisible();

        const line = main(page).getByRole("note");
        await expect(line).toContainText("1 cliente abituale non torna da più di 3 mesi.");
        await line.getByRole("button", { name: "Vedi chi" }).click();
        await expect(main(page).getByRole("radio", { name: "Non tornano da 3 mesi 1" })).toHaveAttribute("aria-checked", "true");
        await expect(guestName(page, "Luca Ferri e2e")).toBeVisible();
        await expect(guestName(page, "Marco Bianchi e2e")).toHaveCount(0);

        // La riga si toglie e resta tolta.
        await main(page).getByRole("checkbox", { name: "«Chi non torna» in cima" }).uncheck();
        await expect(line).toHaveCount(0);
        await page.reload();
        await expect(guestName(page, "Giulia Rossi e2e")).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByRole("note")).toHaveCount(0);
    });

    test("passati da una sede", async ({ page }) => {
        await openList(page);
        await expect(guestName(page, "Giulia Rossi e2e")).toBeVisible({ timeout: 15_000 });
        await main(page).getByRole("combobox", { name: "Passati da" }).selectOption({ label: "Passati da: Porto e2e" });
        await expect(guestName(page, "Luca Ferri e2e")).toBeVisible();
        await expect(guestName(page, "Giulia Rossi e2e")).toHaveCount(0);
        await expect(main(page).getByRole("radio", { name: "Tutti 1" })).toBeVisible();
    });

    test("la ricerca filtra la rubrica, senza esito lo dice", async ({ page }) => {
        await openList(page);
        await expect(guestName(page, "Giulia Rossi e2e")).toBeVisible({ timeout: 15_000 });
        await main(page).getByRole("button", { name: "Cerca un cliente" }).click();
        const search = main(page).getByPlaceholder("Cerca un cliente");
        await expect(search).toBeFocused();
        await search.fill("bianchi");
        await expect(guestName(page, "Giulia Rossi e2e")).toHaveCount(0);
        await expect(guestName(page, "Marco Bianchi e2e")).toBeVisible();
        await search.fill("nessuno così");
        await expect(main(page).getByText("Nessun cliente trovato")).toBeVisible();
    });

    test("#360.8: la risposta lenta di una ricerca vecchia non copre quella nuova", async ({ page }) => {
        await openList(page);
        await expect(guestName(page, "Giulia Rossi e2e")).toBeVisible({ timeout: 15_000 });
        // la ricerca «rossi» risponde in ritardo, dopo quella che viene dopo
        await page.route(/\/rest\/v1\/v_reservation_guests_directory\?/, async route => {
            if (/rossi/i.test(decodeURIComponent(route.request().url()))) await new Promise(r => setTimeout(r, 1500));
            await route.fallback();
        });
        await main(page).getByRole("button", { name: "Cerca un cliente" }).click();
        const search = main(page).getByPlaceholder("Cerca un cliente");
        await search.fill("rossi");
        await search.fill("bianchi");
        await expect(guestName(page, "Marco Bianchi e2e")).toBeVisible();
        await page.waitForTimeout(2000);
        await expect(guestName(page, "Marco Bianchi e2e")).toBeVisible();
        await expect(guestName(page, "Giulia Rossi e2e")).toHaveCount(0);
    });

    test("la scheda: telefono, numeri, pallini, visite, note per sede", async ({ page }) => {
        await openList(page);
        await expect(guestName(page, "Giulia Rossi e2e")).toBeVisible({ timeout: 15_000 });
        const d = await openGuest(page, "Giulia Rossi e2e");
        await expect(d.getByRole("link", { name: "+39 333 111 2233" })).toHaveAttribute("href", "tel:+393331112233");
        await expect(d.getByRole("button", { name: "Copia", exact: true })).toBeVisible();
        await expect(d.getByRole("link", { name: "giulia@example.com" })).toBeVisible();
        await expect(d.getByText("7 visite · cliente da novembre 2025 · passato da Centro e2e", { exact: true })).toBeVisible();
        await expect(d.getByRole("img", { name: /^Ultimi 12 mesi/ })).toBeVisible();
        await expect(d.getByRole("cell", { name: "Non presentato" })).toBeVisible();
        await expect(d.getByText(/Un seggiolone, grazie/)).toBeVisible();
        await expect(d.getByRole("cell", { name: "Porto e2e" })).toBeVisible();
        await expect(d.getByRole("heading", { name: "Note · Centro e2e" })).toBeVisible();
        await expect(d.getByRole("textbox", { name: /Centro e2e/ })).toHaveValue("Preferisce il tavolo in fondo.");
        await expect(d.getByText("VIP", { exact: true })).toBeVisible();
    });

    test("nota ed etichetta: in bozza, poi Salva scrive solo la sede toccata", async ({ page }) => {
        stub.onWrite("reservation_guest_notes.POST", call => {
            const body = (Array.isArray(call.body) ? call.body[0] : call.body) as Row;
            return { id: "e2e5c000-0000-4000-a000-000000000901", created_at: "x", updated_at: "x", ...body };
        });
        await openList(page);
        await expect(guestName(page, "Giulia Rossi e2e")).toBeVisible({ timeout: 15_000 });
        const d = await openGuest(page, "Giulia Rossi e2e");
        const save = d.getByRole("button", { name: "Salva", exact: true });
        await expect(save).toBeDisabled();
        await d.getByRole("textbox", { name: /Lago e2e/ }).fill("Allergico alle noci.");
        const lago = d.locator("section", { has: page.getByRole("heading", { name: "Note · Lago e2e" }) });
        await lago.getByRole("button", { name: "aggiungi", exact: true }).click();
        await d.getByRole("textbox", { name: /Nuova etichetta — Lago e2e/ }).fill("tavolo tranquillo");
        await d.getByRole("textbox", { name: /Nuova etichetta — Lago e2e/ }).press("Enter");
        await expect(d.getByText("tavolo tranquillo", { exact: true })).toBeVisible();
        await save.click();
        await expect(page.getByText("Scheda cliente aggiornata.")).toBeVisible();
        const posts = writes(stub, "reservation_guest_notes.POST");
        expect(posts).toHaveLength(1);
        const body = (Array.isArray(posts[0].body) ? posts[0].body[0] : posts[0].body) as Row;
        expect(body).toMatchObject({ guest_id: GUEST.rossi, activity_id: SEDE.lago, notes: "Allergico alle noci.", tags: ["tavolo tranquillo"] });
    });

    test("togliere l'ultima nota ed etichetta cancella la riga della sede", async ({ page }) => {
        stub.onWrite("reservation_guest_notes.DELETE", () => null);
        await openList(page);
        await expect(guestName(page, "Giulia Rossi e2e")).toBeVisible({ timeout: 15_000 });
        const d = await openGuest(page, "Giulia Rossi e2e");
        await d.getByRole("button", { name: "Togli l'etichetta VIP" }).click();
        await d.getByRole("button", { name: "Salva", exact: true }).click();
        await expect.poll(() => writes(stub, "reservation_guest_notes.DELETE").length).toBe(1);
        const params = writes(stub, "reservation_guest_notes.DELETE")[0].params;
        expect(params.get("activity_id")).toBe(`eq.${SEDE.porto}`);
    });

    test("chiudere la scheda con una nota non salvata chiede prima", async ({ page }) => {
        await openList(page);
        await expect(guestName(page, "Giulia Rossi e2e")).toBeVisible({ timeout: 15_000 });
        const d = await openGuest(page, "Giulia Rossi e2e");
        await d.getByRole("textbox", { name: /Lago e2e/ }).fill("Una bozza e2e");
        await d.getByRole("button", { name: "Chiudi", exact: true }).first().click();
        await expect(page.getByRole("heading", { name: "Modifiche non salvate" })).toBeVisible();
        await page.getByRole("button", { name: "Resta" }).click();
        await expect(d.getByRole("textbox", { name: /Lago e2e/ })).toHaveValue("Una bozza e2e");
        // Esc vale quando la domanda di prima è sparita del tutto.
        await expect(page.getByRole("alertdialog")).toHaveCount(0);
        await page.keyboard.press("Escape");
        await page.getByRole("button", { name: "Esci senza salvare" }).click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        expect(stub.writes.filter(w => w.key.startsWith("reservation_guest_notes"))).toHaveLength(0);
    });

    test("con una nota non salvata anche un'altra riga e l'indietro chiedono prima (D131)", async ({ page }) => {
        await openList(page);
        await expect(guestName(page, "Giulia Rossi e2e")).toBeVisible({ timeout: 15_000 });
        const d = await openGuest(page, "Giulia Rossi e2e");
        await d.getByRole("textbox", { name: /Lago e2e/ }).fill("Una bozza e2e");

        // Un'altra riga dell'elenco: si resta su Giulia con la bozza.
        await guestName(page, "Marco Bianchi e2e").click();
        await expect(page.getByRole("heading", { name: "Modifiche non salvate" })).toBeVisible();
        await page.getByRole("button", { name: "Resta" }).click();
        await expect(d.getByRole("textbox", { name: /Lago e2e/ })).toHaveValue("Una bozza e2e");
        expect(new URL(page.url()).searchParams.get("guest")).toBe(GUEST.rossi);
        await expect(page.getByRole("alertdialog")).toHaveCount(0);

        // L'indietro del browser: stessa domanda, poi si esce davvero.
        await page.goBack();
        await expect(page.getByRole("heading", { name: "Modifiche non salvate" })).toBeVisible();
        await page.getByRole("button", { name: "Esci senza salvare" }).click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        expect(new URL(page.url()).searchParams.get("guest")).toBeNull();
        expect(stub.writes.filter(w => w.key.startsWith("reservation_guest_notes"))).toHaveLength(0);
    });

    test("#340.2: una ricerca che esclude il cliente aperto non butta via la nota in bozza", async ({ page }) => {
        await openList(page);
        await expect(guestName(page, "Giulia Rossi e2e")).toBeVisible({ timeout: 15_000 });
        const d = await openGuest(page, "Giulia Rossi e2e");
        await d.getByRole("textbox", { name: /Lago e2e/ }).fill("Una bozza e2e");
        const search = page.getByRole("searchbox").or(page.getByRole("textbox", { name: /Cerca/ })).first();
        await search.fill("bianchi");
        await expect(guestName(page, "Marco Bianchi e2e")).toBeVisible();
        await expect(guestName(page, "Sara Verdi e2e")).toHaveCount(0);
        await page.waitForLoadState("networkidle");
        await expect(d.getByRole("textbox", { name: /Lago e2e/ })).toHaveValue("Una bozza e2e");
        expect(new URL(page.url()).searchParams.get("guest")).toBe(GUEST.rossi);
    });

    test("deep link ?guest= apre la scheda", async ({ page }) => {
        await openList(page);
        await expect(guestName(page, "Giulia Rossi e2e")).toBeVisible({ timeout: 15_000 });
        await page.goto(`${page.url().split("?")[0]}?guest=${GUEST.bianchi}`);
        await expect(drawer(page).getByText("Marco Bianchi e2e").first()).toBeVisible({ timeout: 15_000 });
    });

    test("senza lettura: la rubrica è bloccata", async ({ page }) => {
        await stub.revoke("guests.read");
        // La voce non è in sidebar: si arriva dal link diretto.
        await openBusinessPageByUrl(page, "guests");
        await stub.revoked;
        expect(await sidebarVoci(page)).not.toContain("Clienti");
        await expect(main(page).getByText(/Non hai accesso/)).toBeVisible({ timeout: 15_000 });
        await expect(guestName(page, "Giulia Rossi e2e")).toHaveCount(0);
    });

    test("a 375 nessuno scroll orizzontale", async ({ page }) => {
        await openList(page);
        await expect(guestName(page, "Giulia Rossi e2e")).toBeVisible({ timeout: 15_000 });
        await page.setViewportSize({ width: 375, height: 800 });
        await expect(guestName(page, "Giulia Rossi e2e")).toBeVisible();
        await noSideScroll(page);
    });
});

test.describe("Clienti — vuoto ed errore", () => {
    test("oltre il tetto dei 200 la pagina lo dice", async ({ page }) => {
        stub = await stubClienti(page, { count: 200 });
        await openList(page);
        await expect(guestName(page, "Giulia Rossi e2e")).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByText("Mostrati i 200 clienti più recenti: cerca per trovare gli altri.")).toBeVisible();
    });

    test("rubrica vuota: il vuoto dice da dove arrivano i clienti", async ({ page }) => {
        stub = await stubClienti(page, { empty: true });
        await openList(page);
        await expect(main(page).getByText("Nessun cliente in rubrica")).toBeVisible({ timeout: 15_000 });
    });

    test("errore di caricamento: lo dice e offre «Riprova»", async ({ page }) => {
        stub = await stubClienti(page);
        await page.route(/\/rest\/v1\/v_reservation_guests_directory\?/, route =>
            route.fulfill({ status: 500, json: { code: "E2E", message: "rotto" } })
        );
        await openList(page);
        await expect(main(page).getByRole("button", { name: "Riprova" })).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByText("Nessun cliente in rubrica")).toHaveCount(0);
    });
});

/**
 * Il dettaglio accanto (#340.11): `useDetailParam` nell'indirizzo e nella
 * cronologia, e i tasti del `DetailPane`. Si prova su Clienti perché la
 * rubrica è finta e ha tre righe in ordine fisso.
 */
test.describe("Clienti — dettaglio accanto: indirizzo e tasti", () => {
    const opened = (page: Page) => new URL(page.url()).searchParams.get("guest");
    const steps = (page: Page) => page.evaluate(() => window.history.length);

    test.beforeEach(async ({ page }) => {
        stub = await stubClienti(page);
        await openList(page);
        await expect(guestName(page, "Giulia Rossi e2e")).toBeVisible({ timeout: 15_000 });
    });

    test("aprire aggiunge una voce alla cronologia: «indietro» chiude e resta sulla pagina", async ({ page }) => {
        const before = await steps(page);
        await openGuest(page, "Giulia Rossi e2e");
        expect(opened(page)).toBe(GUEST.rossi);
        expect(await steps(page)).toBe(before + 1);
        await page.goBack();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        expect(opened(page)).toBeNull();
        await expect(guestName(page, "Giulia Rossi e2e")).toBeVisible();
    });

    test("passare a un altro cliente sostituisce la voce: un solo «indietro» chiude", async ({ page }) => {
        const before = await steps(page);
        await openGuest(page, "Giulia Rossi e2e");
        await openGuest(page, "Marco Bianchi e2e");
        expect(opened(page)).toBe(GUEST.bianchi);
        expect(await steps(page)).toBe(before + 1);
        await page.goBack();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        expect(opened(page)).toBeNull();
    });

    test("«Chiudi» dopo aver aperto torna indietro, senza lasciare una voce in più", async ({ page }) => {
        const before = await steps(page);
        const d = await openGuest(page, "Giulia Rossi e2e");
        await d.getByRole("button", { name: "Chiudi", exact: true }).first().click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        expect(opened(page)).toBeNull();
        // Riaprire riusa la stessa voce (quella «avanti» si sovrascrive).
        await openGuest(page, "Marco Bianchi e2e");
        expect(await steps(page)).toBe(before + 1);
    });

    test("aperto da un link, «Chiudi» toglie il parametro sul posto", async ({ page }) => {
        const url = new URL(page.url());
        url.searchParams.set("guest", GUEST.verdi);
        await page.goto(url.toString());
        const d = drawer(page);
        await expect(d.getByText("Sara Verdi e2e").first()).toBeVisible({ timeout: 15_000 });
        const before = await steps(page);
        await d.getByRole("button", { name: "Chiudi", exact: true }).first().click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        expect(opened(page)).toBeNull();
        expect(await steps(page)).toBe(before);
        await expect(guestName(page, "Giulia Rossi e2e")).toBeVisible();
    });

    test("↓ e ↑ sul pannello scorrono l'elenco, e si fermano agli estremi", async ({ page }) => {
        const d = await openGuest(page, "Giulia Rossi e2e");
        await expect(d).toBeFocused();
        await page.keyboard.press("ArrowDown");
        await expect.poll(() => opened(page)).toBe(GUEST.bianchi);
        // Il tasto dopo parte a scheda cambiata (le frecce seguono l'elenco al render).
        await expect(d.getByText("Marco Bianchi e2e").first()).toBeVisible();
        await page.keyboard.press("ArrowDown");
        await expect.poll(() => opened(page)).toBe(GUEST.verdi);
        await expect(d.getByText("Sara Verdi e2e").first()).toBeVisible();
        await page.keyboard.press("ArrowDown");
        expect(opened(page)).toBe(GUEST.verdi);
        await d.getByRole("button", { name: "Precedente" }).focus();
        await page.keyboard.press("ArrowUp");
        await expect.poll(() => opened(page)).toBe(GUEST.bianchi);
    });

    test("in un campo ↓ e ↑ restano del campo: il cliente non cambia", async ({ page }) => {
        const d = await openGuest(page, "Giulia Rossi e2e");
        const note = d.getByRole("textbox", { name: /Lago e2e/ });
        await note.click();
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowUp");
        await expect(note).toBeFocused();
        expect(opened(page)).toBe(GUEST.rossi);
    });

    test("chiuso il pannello, il fuoco torna sulla riga da cui era partito (#340.8)", async ({ page }) => {
        const row = main(page).getByRole("button", { name: /Giulia Rossi e2e/ }).first();
        await row.focus();
        await page.keyboard.press("Enter");
        const d = drawer(page);
        await expect(d).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(row).toBeFocused();

        // Anche dal pulsante «Chiudi», che sparisce col pannello.
        await page.keyboard.press("Enter");
        await expect(d).toBeFocused();
        await d.getByRole("button", { name: "Chiudi", exact: true }).first().click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(row).toBeFocused();

        // E dopo ↓: la riga di partenza c'è ancora, il fuoco non resta sul body.
        await page.keyboard.press("Enter");
        await expect(d).toBeFocused();
        await page.keyboard.press("ArrowDown");
        await expect(d.getByText("Marco Bianchi e2e").first()).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
    });

    test("Esc chiude il pannello, anche al telefono dove è una pagina modale", async ({ page }) => {
        await openGuest(page, "Giulia Rossi e2e");
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);

        await page.setViewportSize({ width: 375, height: 800 });
        const d = await openGuest(page, "Marco Bianchi e2e");
        await expect(d).toHaveAttribute("aria-modal", "true");
        await page.keyboard.press("ArrowDown");
        await expect.poll(() => opened(page)).toBe(GUEST.verdi);
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
    });
});
