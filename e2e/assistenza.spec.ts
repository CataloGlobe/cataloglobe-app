import { expect, test, type Locator, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";
import { MISSING_TICKET, TICKET, stubAssistenza, type AssistenzaStub, type WriteCall } from "./assistenzaStub";
import type { Row } from "./restStub";

/**
 * Assistenza (lotto `ds-5-coda`, P0). Scritto sulla pagina di **oggi**, prima
 * di ricomporla: deve restare verde passo dopo passo. I comportamenti che la
 * ricomposizione aggiunge (stato d'errore, oggetto in pagina, gate sul
 * dettaglio) sono `test.fail` finché il passo non li porta.
 *
 * Dati finti in `assistenzaStub.ts`; permessi, azienda e sidebar veri.
 */

function main(page: Page) {
    return page.getByRole("main");
}

function dialog(page: Page): Locator {
    return page.getByRole("dialog").or(page.getByRole("alertdialog")).last();
}

function write(stub: AssistenzaStub, key: string): WriteCall | undefined {
    return stub.writes.find(w => w.key === key);
}

async function openList(page: Page): Promise<void> {
    await openBusinessPage(page, "support", "Assistenza");
}

async function openTicket(page: Page, id: string): Promise<void> {
    if (!/\/business\/[0-9a-f-]+\//.test(page.url())) await openBusinessPage(page, "support", "Assistenza");
    await page.goto(page.url().replace(/\/business\/([0-9a-f-]+)\/.*$/, `/business/$1/support/${id}`));
}

async function noSideScroll(page: Page): Promise<void> {
    const overflow = await page.evaluate(() => {
        const de = document.documentElement;
        const scrollers = [de, ...Array.from(document.querySelectorAll<HTMLElement>("main"))];
        return Math.max(...scrollers.map(el => el.scrollWidth - el.clientWidth));
    });
    expect(overflow).toBeLessThanOrEqual(0);
}

function newRequestButton(page: Page): Locator {
    return page.getByRole("button", { name: /Nuova richiesta/ }).first();
}

let stub: AssistenzaStub;

test.describe("Assistenza — elenco", () => {
    test.beforeEach(async ({ page }) => {
        stub = await stubAssistenza(page);
    });

    test("richieste dall'ultima mossa, autore · sede, stato", async ({ page }) => {
        await openList(page);
        await expect(main(page).getByText("Il QR del tavolo 4 e2e")).toBeVisible({ timeout: 15_000 });
        const order = await main(page).getByText(/^(Il QR del tavolo 4|Fattura di agosto|Logo sfocato) e2e$/).allTextContents();
        expect(order).toEqual(["Il QR del tavolo 4 e2e", "Fattura di agosto e2e", "Logo sfocato e2e"]);
        await expect(main(page).getByText(/Anna e2e · Centro e2e/)).toBeVisible();
        await expect(main(page).getByText(/Marco e2e · \d/)).toBeVisible();
        await expect(main(page).getByText("In lavorazione", { exact: true })).toBeVisible();
        await expect(main(page).getByText("Aperta", { exact: true })).toBeVisible();
        await expect(main(page).getByText("Chiusa", { exact: true })).toBeVisible();
        await expect(newRequestButton(page)).toBeVisible();
    });

    test("la risposta non letta si dice", async ({ page }) => {
        await openList(page);
        await expect(main(page).getByText("Il QR del tavolo 4 e2e")).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByLabel("Risposta non letta").or(main(page).getByText("Risposta nuova")).first()).toBeVisible();
    });

    test("la riga apre il dettaglio", async ({ page }) => {
        await openList(page);
        await main(page).getByText("Fattura di agosto e2e").click();
        await expect(page).toHaveURL(new RegExp(`/support/${TICKET.fattura}$`));
    });

    test("nuova richiesta: campi obbligatori, invio, apre il dettaglio", async ({ page }) => {
        const created: Row = {
            id: "e2e5a000-0000-4000-a000-000000000901",
            tenant_id: "x",
            activity_id: null,
            subject: "Menù non aggiornato e2e",
            status: "open",
            created_by: null,
            created_at: "2026-09-23T10:00:00.000Z",
            updated_at: "2026-09-23T10:00:00.000Z",
            last_message_at: "2026-09-23T10:00:00.000Z",
            closed_at: null,
            customer_last_read_at: null,
            last_message_kind: "customer"
        };
        stub.onWrite("rpc.create_support_ticket", () => {
            stub.tables.support_tickets.push(created);
            return created;
        });
        await openList(page);
        await expect(main(page).getByText("Il QR del tavolo 4 e2e")).toBeVisible({ timeout: 15_000 });
        await newRequestButton(page).click();
        const drawer = dialog(page);
        await expect(drawer.getByText("Nuova richiesta")).toBeVisible();
        await drawer.getByRole("button", { name: "Invia richiesta" }).click();
        await expect(drawer.getByText("Indica l'oggetto della richiesta.")).toBeVisible();
        await expect(drawer.getByText(/Descrivi il problema/)).toBeVisible();
        expect(write(stub, "rpc.create_support_ticket")).toBeUndefined();

        await drawer.getByRole("textbox", { name: /^Oggetto/ }).fill("Menù non aggiornato e2e");
        await drawer.getByRole("combobox", { name: /Sede/ }).selectOption({ label: "Porto e2e" });
        await drawer.getByRole("textbox", { name: /^Descrizione/ }).fill("Il prezzo del caffè è quello vecchio.");
        await drawer.getByRole("button", { name: "Invia richiesta" }).click();
        await expect(page).toHaveURL(new RegExp(`/support/${created.id}$`));
        const body = write(stub, "rpc.create_support_ticket")?.body as Row;
        expect(body.p_subject).toBe("Menù non aggiornato e2e");
        expect(body.p_first_message).toBe("Il prezzo del caffè è quello vecchio.");
        expect(body.p_activity_id).toBeTruthy();
        await expect(page.getByText("Richiesta inviata.")).toBeVisible();
    });

    test("nuova richiesta: il rifiuto del server resta nel drawer", async ({ page }) => {
        // Nessuna risposta registrata per la RPC: lo stub risponde 500.
        await openList(page);
        await expect(main(page).getByText("Il QR del tavolo 4 e2e")).toBeVisible({ timeout: 15_000 });
        await newRequestButton(page).click();
        const drawer = dialog(page);
        await drawer.getByRole("textbox", { name: /^Oggetto/ }).fill("Oggetto e2e");
        await drawer.getByRole("textbox", { name: /^Descrizione/ }).fill("Testo e2e");
        await drawer.getByRole("button", { name: "Invia richiesta" }).click();
        await expect(drawer.getByText("Non è stato possibile inviare la richiesta. Riprova.")).toBeVisible();
        await expect(page).toHaveURL(/\/support$/);
    });

    test("nuova richiesta: chiudere con testo scritto chiede prima", async ({ page }) => {
        await openList(page);
        await expect(main(page).getByText("Il QR del tavolo 4 e2e")).toBeVisible({ timeout: 15_000 });
        await newRequestButton(page).click();
        const drawer = page.getByRole("dialog", { name: "Nuova richiesta" });
        await drawer.getByRole("textbox", { name: /^Descrizione/ }).fill("Una bozza e2e");
        await drawer.getByRole("button", { name: "Annulla" }).click();
        const confirm = page.getByRole("alertdialog").or(page.getByRole("dialog", { name: "Uscire senza inviare?" })).last();
        await expect(confirm.getByText("Uscire senza inviare?")).toBeVisible();
        await confirm.getByRole("button", { name: "Resta" }).click();
        await expect(drawer.getByRole("textbox", { name: /^Descrizione/ })).toHaveValue("Una bozza e2e");
        await drawer.getByRole("button", { name: "Annulla" }).click();
        await page.getByRole("button", { name: "Esci senza salvare" }).click();
        await expect(drawer).toHaveCount(0);
    });

    test("senza scrittura: niente «Nuova richiesta», l'email per chiedere aiuto", async ({ page }) => {
        await stub.revoke("support.write");
        await openList(page);
        await stub.revoked;
        await expect(main(page).getByText("Il QR del tavolo 4 e2e")).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByRole("link", { name: /@/ })).toBeVisible();
        await expect(newRequestButton(page)).toHaveCount(0);
    });

    test("senza lettura: la pagina è bloccata", async ({ page }) => {
        await stub.revoke("support.read");
        await openList(page);
        await stub.revoked;
        await expect(main(page).getByText("Non hai accesso a questa sezione")).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByText("Il QR del tavolo 4 e2e")).toHaveCount(0);
    });

    test("a 375 nessuno scroll orizzontale", async ({ page }) => {
        await openList(page);
        await expect(main(page).getByText("Il QR del tavolo 4 e2e")).toBeVisible({ timeout: 15_000 });
        await page.setViewportSize({ width: 375, height: 800 });
        await expect(main(page).getByText("Il QR del tavolo 4 e2e")).toBeVisible();
        await noSideScroll(page);
    });
});

test.describe("Assistenza — vuoto ed errore", () => {
    test("nessuna richiesta: il vuoto con l'azione", async ({ page }) => {
        stub = await stubAssistenza(page, { empty: true });
        await openList(page);
        await expect(main(page).getByText("Nessuna richiesta")).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByRole("button", { name: /Nuova richiesta/ }).last()).toBeVisible();
    });

    test("errore di caricamento: lo dice e offre «Riprova»", async ({ page }) => {
        stub = await stubAssistenza(page);
        await page.route(/\/rest\/v1\/support_tickets\?/, route => route.fulfill({ status: 500, json: { code: "E2E", message: "rotto" } }));
        await openList(page);
        await expect(main(page).getByRole("button", { name: "Riprova" })).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByText("Nessuna richiesta")).toHaveCount(0);
    });
});

test.describe("Assistenza — dettaglio", () => {
    test.beforeEach(async ({ page }) => {
        stub = await stubAssistenza(page);
    });

    test("il thread, lo stato, la lettura segnata", async ({ page }) => {
        await openTicket(page, TICKET.qr);
        await expect(main(page).getByText("Il QR del tavolo 4 apre una pagina bianca.")).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByText("Stiamo verificando, ti aggiorniamo entro sera.")).toBeVisible();
        await expect(page.getByText("In lavorazione", { exact: true }).first()).toBeVisible();
        await expect.poll(() => write(stub, "rpc.mark_support_ticket_read")?.body).toEqual({ p_ticket_id: TICKET.qr });
    });

    test("l'oggetto della richiesta si legge in pagina", async ({ page }) => {
        test.fail(true, "Oggi: oggetto passato a `title`, che lo slot non rende (#755, P1)");
        await openTicket(page, TICKET.qr);
        await expect(main(page).getByText("Il QR del tavolo 4 apre una pagina bianca.")).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText("Il QR del tavolo 4 e2e").first()).toBeVisible();
        await expect(page.getByText(/Aperta il .* · Centro e2e/)).toBeVisible();
    });

    test("rispondi: il messaggio parte e il thread si rilegge", async ({ page }) => {
        stub.onWrite("support_messages.POST", call => {
            const row = {
                id: "e2e5a000-0000-4000-a000-000000000801",
                created_at: "2026-09-23T10:00:00.000Z",
                ...(call.body as Row)
            };
            stub.tables.support_messages.push(row);
            return row;
        });
        await openTicket(page, TICKET.qr);
        await expect(main(page).getByText("Il QR del tavolo 4 apre una pagina bianca.")).toBeVisible({ timeout: 15_000 });
        const send = main(page).getByRole("button", { name: "Invia", exact: true });
        await expect(send).toBeDisabled();
        await main(page).getByRole("textbox", { name: "Rispondi" }).fill("Grazie, aspettiamo e2e.");
        await send.click();
        await expect.poll(() => write(stub, "support_messages.POST")?.body, { timeout: 10_000 }).toMatchObject({
            ticket_id: TICKET.qr,
            body: "Grazie, aspettiamo e2e.",
            author_kind: "customer"
        });
        await expect(main(page).getByRole("textbox", { name: "Rispondi" })).toHaveValue("");
        await expect(main(page).getByText("Grazie, aspettiamo e2e.")).toBeVisible();
    });

    test("senza scrittura: niente composer, l'email", async ({ page }) => {
        await stub.revoke("support.write");
        await openTicket(page, TICKET.qr);
        await stub.revoked;
        await expect(main(page).getByText("Il QR del tavolo 4 apre una pagina bianca.")).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByRole("textbox", { name: "Rispondi" })).toHaveCount(0);
        await expect(main(page).getByRole("link", { name: /@/ })).toBeVisible();
    });

    test("una richiesta che non c'è", async ({ page }) => {
        await openTicket(page, MISSING_TICKET);
        await expect(main(page).getByText(/non esiste|non trovata/i).first()).toBeVisible({ timeout: 15_000 });
        await main(page).getByRole("button", { name: /Torna/ }).click();
        await expect(page).toHaveURL(/\/support$/);
    });

    test("senza lettura: il dettaglio è bloccato", async ({ page }) => {
        await stub.revoke("support.read");
        await openTicket(page, TICKET.qr);
        await stub.revoked;
        await expect(main(page).getByText("Non hai accesso a questa sezione")).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByText("Il QR del tavolo 4 apre una pagina bianca.")).toHaveCount(0);
    });

    test("a 375 nessuno scroll orizzontale", async ({ page }) => {
        await openTicket(page, TICKET.qr);
        await expect(main(page).getByText("Il QR del tavolo 4 apre una pagina bianca.")).toBeVisible({ timeout: 15_000 });
        await page.setViewportSize({ width: 375, height: 800 });
        await expect(main(page).getByText("Il QR del tavolo 4 apre una pagina bianca.")).toBeVisible();
        await noSideScroll(page);
    });
});
