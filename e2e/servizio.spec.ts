import { expect, test, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";
import { asBasePlan, asRole } from "./asRole";

/**
 * Servizio (lotto B-a, §18.2, §50.21): una pagina di sede con due modi,
 * Mappa e Gestisci la sala. La Mappa è la vista dei tavoli che stava in
 * Comande → Tavoli, col pannello del conto; Gestisci la sala è la vecchia
 * `/sala`. Lo Storico degli ordini diventa una voce a sé. L'Elenco (le
 * tavolate) arriva col lotto B-b: fino ad allora resta in Prenotazioni.
 *
 * Scritto **prima** della pagina: i casi sono in `test.fail` finché la
 * navigazione nuova non c'è.
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
    // Il redirect dell'indice è avvenuto: la sidebar della sede è montata.
    const link = nav(page).getByRole("link", { name: voce, exact: true });
    await expect(link).toBeVisible({ timeout: 10_000 });
    await link.click();
    return base;
}

function modo(page: Page, name: "Mappa" | "Gestisci la sala") {
    return page.getByRole("tab", { name: new RegExp(`^${name}`) });
}

/** La tessera del tavolo della fixture nella Mappa. */
function tessera(page: Page) {
    return main(page).getByRole("button", { name: new RegExp(`^${TAVOLO}, `) });
}

test.describe("Servizio", () => {
    test("la sidebar della sede ha Servizio e Storico, non più Sala", async ({ page }) => {
        test.fail();
        await openVoce(page, "Scheda");
        const sidebar = nav(page);
        const voci = ["Servizio", "Comande", "Storico", "Prenotazioni", "Cosa vedono i clienti", "Scheda"];
        for (const voce of voci) {
            await expect(sidebar.getByRole("link", { name: voce, exact: true })).toBeVisible();
        }
        await expect(sidebar.getByRole("link", { name: "Sala", exact: true })).toHaveCount(0);
        // Nell'ordine della sidebar: Servizio è la prima voce.
        const labels = await sidebar.getByRole("link").allInnerTexts();
        const ordered = labels.map(l => l.trim()).filter(l => voci.includes(l));
        expect(ordered).toEqual(voci);
    });

    test("col piano Pro Servizio si apre sulla Mappa, coi tavoli per zona", async ({ page }) => {
        test.fail();
        await openVoce(page, "Servizio");
        await expect(page).toHaveURL(/\/servizio$/, { timeout: 15_000 });
        await expect(modo(page, "Mappa")).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
        await expect(modo(page, "Gestisci la sala")).toBeVisible();
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
        test.fail();
        await openVoce(page, "Servizio");
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
        test.fail();
        await openVoce(page, "Servizio");
        const filtri = main(page).getByRole("radiogroup");
        await expect(main(page).getByRole("list", { name: "Tavoli" })).toHaveCount(0, { timeout: 15_000 });
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

    test("la Mappa è una griglia per zona: 3, 2, 1 colonne", async ({ page }) => {
        test.fail();
        await openVoce(page, "Servizio");
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

    test("Gestisci la sala: i tavoli, le zone, il nuovo tavolo; la capienza non c'è più", async ({ page }) => {
        test.fail();
        await openVoce(page, "Servizio");
        await modo(page, "Gestisci la sala").click();
        await expect(page).toHaveURL(/\/servizio\?modo=gestisci$/, { timeout: 15_000 });
        await expect(modo(page, "Gestisci la sala")).toHaveAttribute("aria-selected", "true");

        await expect(main(page).getByRole("table", { name: "Tavoli" })).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByText(TAVOLO, { exact: true }).first()).toBeVisible();
        await expect(main(page).getByRole("button", { name: "Nuovo tavolo" })).toBeVisible();
        await main(page).getByRole("button", { name: "Altre azioni" }).click();
        await expect(page.getByRole("menuitem", { name: "Zone e accostamenti" })).toBeVisible();
        await page.keyboard.press("Escape");
        // Capienza e durata stanno nella Scheda (D3).
        await expect(main(page).getByText("Capienza della sala")).toHaveCount(0);

        // E si torna alla Mappa.
        await modo(page, "Mappa").click();
        await expect(page).toHaveURL(/\/servizio\?modo=mappa$/);
        await expect(tessera(page)).toBeVisible({ timeout: 15_000 });
    });

    test("a 375 la testata è la barra compatta e la pagina non scorre di lato", async ({ page }) => {
        test.fail();
        await openVoce(page, "Servizio");
        await expect(tessera(page)).toBeVisible({ timeout: 15_000 });
        for (const width of [768, 375]) {
            await page.setViewportSize({ width, height: 900 });
            await expect(tessera(page)).toBeVisible();
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            expect(overflow).toBeLessThanOrEqual(0);
        }
        await expect(modo(page, "Mappa")).toBeHidden();
    });
});

test.describe("Servizio: piano e ruolo", () => {
    test("col piano base la Mappa ha il lucchetto e si atterra in Gestisci la sala", async ({ page }) => {
        test.fail();
        const base = await sedePath(page);
        await asBasePlan(page);
        await page.goto(`${base}/servizio`);
        await expect(modo(page, "Gestisci la sala")).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
        await expect(modo(page, "Mappa")).toHaveAttribute("aria-disabled", "true");
        await expect(modo(page, "Mappa").locator(LUCCHETTO)).toHaveCount(1);
        await expect(main(page).getByRole("table", { name: "Tavoli" })).toBeVisible({ timeout: 15_000 });
        // La voce non ha il lucchetto: un modo si usa sempre.
        await expect(nav(page).getByRole("link", { name: "Servizio", exact: true }).locator(LUCCHETTO)).toHaveCount(0);
    });

    test("col piano base ?modo=mappa porta in Gestisci la sala", async ({ page }) => {
        test.fail();
        const base = await sedePath(page);
        await asBasePlan(page);
        await page.goto(`${base}/servizio?modo=mappa`);
        await expect(modo(page, "Gestisci la sala")).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
        await expect(tessera(page)).toHaveCount(0);
    });

    test("il viewer legge la Mappa ma non conferma ordini né crea tavoli", async ({ page }) => {
        test.fail();
        const base = await sedePath(page);
        await asRole(page, "viewer", base.split("/").pop()!, "pro");
        await page.goto(`${base}/servizio`);
        await expect(tessera(page)).toBeVisible({ timeout: 15_000 });
        await tessera(page).click();
        const drawer = page.getByRole("dialog");
        await expect(drawer.getByText(/^Ordini in corso/)).toBeVisible({ timeout: 15_000 });
        await expect(drawer.getByRole("button", { name: "Conferma" })).toHaveCount(0);
        await page.keyboard.press("Escape");

        await modo(page, "Gestisci la sala").click();
        await expect(main(page).getByRole("table", { name: "Tavoli" })).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByRole("button", { name: "Nuovo tavolo" })).toHaveCount(0);
    });

    for (const { role, plan, modoAtteso } of [
        { role: "staff", plan: "pro", modoAtteso: "Mappa" },
        { role: "viewer", plan: "pro", modoAtteso: "Mappa" },
        { role: "staff", plan: "base", modoAtteso: "Gestisci la sala" },
        { role: "viewer", plan: "base", modoAtteso: "Gestisci la sala" }
    ] as const) {
        test(`${role}, piano ${plan}: entrando nella sede si arriva a Servizio, in ${modoAtteso}`, async ({ page }) => {
            test.fail();
            const base = await sedePath(page);
            await asRole(page, role, base.split("/").pop()!, plan);
            await page.goto(base);
            await expect(page).toHaveURL(/\/servizio$/, { timeout: 15_000 });
            await expect(modo(page, modoAtteso)).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
            await expect(main(page).getByText(/Non hai accesso|richiede il piano Pro/)).toHaveCount(0);
        });
    }
});

test.describe("Storico", () => {
    test("è una voce della sede, coi segmenti, il giorno e la tabella", async ({ page }) => {
        test.fail();
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
        test.fail();
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
        test.fail();
        const base = await sedePath(page);
        await asBasePlan(page);
        await page.goto(base);
        await expect(page).toHaveURL(/\/servizio$/, { timeout: 15_000 });
        await expect(nav(page).getByRole("link", { name: "Storico", exact: true }).locator(LUCCHETTO)).toHaveCount(1, {
            timeout: 15_000
        });
    });
});

test.describe("Indirizzi vecchi", () => {
    test("/sala porta a Servizio, in Gestisci la sala", async ({ page }) => {
        test.fail();
        const base = await sedePath(page);
        await page.goto(`${base}/sala`);
        await expect(page).toHaveURL(/\/servizio\?modo=gestisci$/, { timeout: 15_000 });
        await expect(modo(page, "Gestisci la sala")).toHaveAttribute("aria-selected", "true");
    });

    test("comande?tab=tavoli porta alla Mappa", async ({ page }) => {
        test.fail();
        const base = await sedePath(page);
        await page.goto(`${base}/comande?tab=tavoli`);
        await expect(page).toHaveURL(/\/servizio\?modo=mappa$/, { timeout: 15_000 });
        await expect(tessera(page)).toBeVisible({ timeout: 15_000 });
    });

    test("comande?tab=storico porta allo Storico", async ({ page }) => {
        test.fail();
        const base = await sedePath(page);
        await page.goto(`${base}/comande?tab=storico`);
        await expect(page).toHaveURL(/\/storico$/, { timeout: 15_000 });
    });

    test("/orders?tab=tavoli, il link dei toast, porta alla Mappa dell'ultima sede", async ({ page }) => {
        test.fail();
        const base = await sedePath(page);
        await page.goto(`${base}/comande`);
        await expect(page).toHaveURL(/\/comande$/, { timeout: 15_000 });
        await page.goto(base.replace(/\/locations\/.*$/, "/orders?tab=tavoli"));
        await expect(page).toHaveURL(/\/locations\/[0-9a-f-]+\/servizio\?modo=mappa$/, { timeout: 15_000 });
    });
});

test.describe("Capienza nella Scheda", () => {
    test("capienza e durata stanno in Ordini e prenotazioni, nella bozza della Scheda", async ({ page }) => {
        test.fail();
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
        await page.goto(`${base}/ordini-prenotazioni#prenotazioni`);
        const capienza = main(page).getByRole("spinbutton", { name: /^Capienza \(coperti\)/ });
        await expect(capienza).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByRole("spinbutton", { name: /^Durata media tavolo \(minuti\)/ })).toBeVisible();

        // Entra nella bozza unica della Scheda: un Salva solo, che qui si annulla.
        await capienza.fill("37");
        await expect(page.getByRole("button", { name: "Salva" })).toBeVisible();
        await page.getByRole("button", { name: "Annulla" }).click();
        await expect(page.getByRole("button", { name: "Salva" })).toHaveCount(0);
    });
});
