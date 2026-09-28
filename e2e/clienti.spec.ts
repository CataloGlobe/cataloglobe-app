import { expect, test, type Locator, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";
import { GUEST, SEDE, stubClienti, type ClientiStub, type WriteCall } from "./clientiStub";
import type { Row } from "./restStub";

/**
 * Clienti (lotto `ds-5-coda`, P0). Scritto sulla pagina di **oggi**, prima di
 * ricomporla: deve restare verde passo dopo passo. I comportamenti che la
 * ricomposizione porta (stato d'errore) sono `test.fail` finché il passo non
 * li porta.
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

    test("righe dall'ultima visita: nome, etichetta, telefono, assenze, visite", async ({ page }) => {
        await openList(page);
        await expect(guestName(page, "Giulia Rossi e2e")).toBeVisible({ timeout: 15_000 });
        const order = await main(page).getByText(/^(Giulia Rossi|Marco Bianchi|Sara Verdi) e2e$/).allTextContents();
        expect(order).toEqual(["Giulia Rossi e2e", "Marco Bianchi e2e", "Sara Verdi e2e"]);
        await expect(main(page).getByText("abituale", { exact: true })).toBeVisible();
        await expect(main(page).getByText("+1", { exact: true })).toBeVisible();
        await expect(main(page).getByText("+393334445566")).toBeVisible();
        // Le assenze si vedono solo dove ci sono.
        await expect(main(page).getByText("2 assenze", { exact: true })).toBeVisible();
        await expect(main(page).getByText(/0 assenze/)).toHaveCount(0);
        await expect(main(page).getByText("7 visite", { exact: true })).toBeVisible();
        await expect(main(page).getByText(/ultima 20 set 2026/)).toBeVisible();
    });

    test("la ricerca filtra la rubrica, senza esito lo dice", async ({ page }) => {
        await openList(page);
        await expect(guestName(page, "Giulia Rossi e2e")).toBeVisible({ timeout: 15_000 });
        const search = page.getByRole("searchbox").or(page.getByRole("textbox", { name: /Cerca/ })).first();
        await search.fill("bianchi");
        await expect(guestName(page, "Giulia Rossi e2e")).toHaveCount(0);
        await expect(guestName(page, "Marco Bianchi e2e")).toBeVisible();
        await search.fill("nessuno così");
        await expect(main(page).getByText("Nessun cliente trovato")).toBeVisible();
    });

    test("vista tabella: colonne, e la preferenza resta", async ({ page }) => {
        await openList(page);
        await expect(guestName(page, "Giulia Rossi e2e")).toBeVisible({ timeout: 15_000 });
        await page.getByRole("radio", { name: "Vista tabella" }).or(page.getByRole("button", { name: "Vista tabella" })).first().click();
        for (const header of ["Nome", "Telefono", "Visite", "Assenze", "Ultima visita", "Etichette"]) {
            await expect(main(page).getByText(header, { exact: true }).first()).toBeVisible();
        }
        await expect(main(page).getByText("Marco Bianchi e2e")).toBeVisible();
        await expect(main(page).getByRole("table", { name: "Clienti" })).toBeVisible();
        await page.reload();
        await expect(main(page).getByText("Ultima visita", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    });

    test("la scheda: contatti, storico, visite, note per sede", async ({ page }) => {
        await openList(page);
        await expect(guestName(page, "Giulia Rossi e2e")).toBeVisible({ timeout: 15_000 });
        const d = await openGuest(page, "Giulia Rossi e2e");
        await expect(d.getByRole("link", { name: "+393331112233" })).toHaveAttribute("href", "tel:+393331112233");
        await expect(d.getByRole("link", { name: "giulia@example.com" })).toBeVisible();
        await expect(d.getByText("Cliente dal")).toBeVisible();
        await expect(d.getByText("novembre 2025")).toBeVisible();
        await expect(d.getByText("Non presentato").first()).toBeVisible();
        await expect(d.getByText(/Un seggiolone, grazie/)).toBeVisible();
        await expect(d.getByText("Porto e2e").first()).toBeVisible();
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
        const lago = d.getByRole("textbox", { name: /Lago e2e/ }).locator("xpath=ancestor::*[.//button[normalize-space()='aggiungi' or contains(normalize-space(),'aggiungi')]][1]");
        await lago.getByRole("button", { name: /aggiungi/i }).first().click();
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

    test("deep link ?guest= apre la scheda", async ({ page }) => {
        await openList(page);
        await expect(guestName(page, "Giulia Rossi e2e")).toBeVisible({ timeout: 15_000 });
        await page.goto(`${page.url().split("?")[0]}?guest=${GUEST.bianchi}`);
        await expect(drawer(page).getByText("Marco Bianchi e2e").first()).toBeVisible({ timeout: 15_000 });
    });

    test("senza lettura: la rubrica è bloccata", async ({ page }) => {
        await stub.revoke("guests.read");
        await openList(page);
        await stub.revoked;
        await expect(main(page).getByText(/Non hai accesso/)).toBeVisible({ timeout: 15_000 });
        await expect(guestName(page, "Giulia Rossi e2e")).toHaveCount(0);
    });

    test("a 375 nessuno scroll orizzontale, righe e tabella", async ({ page }) => {
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
