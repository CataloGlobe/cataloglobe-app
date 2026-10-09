import { expect, test, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";
import { sidebarLink } from "./nav";

/**
 * Scheda della sede (`/business/:businessId/locations/:activityId`), vista da
 * un amministratore. Officina 3, prototipo C+++ «Scorrono insieme»: un
 * cruscotto di tessere col telefono accanto, e ogni parte che si apre a
 * fuoco con `?parte=`. Copre l'apertura dalla griglia di Sedi; le tessere e
 * le parti a fuoco, col percorso «sede › parte» che torna al cruscotto; il
 * drawer dell'indirizzo web aperto e chiuso senza salvare; l'eliminazione
 * dal «⋯» della sede aperta e chiusa senza eliminare; i vecchi indirizzi
 * (`?tab=`, `/orari`, `/canali`…) che portano alla parte giusta. Nessuna
 * scrittura.
 */

/** Le tessere del cruscotto, coi titoli di `PART_TITLE`. */
const PART = {
    orari: "Quando siete aperti",
    contatti: "Come vi contattano",
    dove: "Dove vi trovano",
    offrite: "Pagamenti e servizi",
    conto: "Al conto, oltre ai piatti",
    prenotazioni: "Prenotazioni online",
    ordini: "Ordini dal tavolo"
};

const tile = (page: Page, title: string) => page.getByRole("main").getByRole("button", { name: `${title}: apri` });
const rail = (page: Page) => page.getByRole("navigation", { name: "Parti della scheda" });

async function openFirstLocation(page: Page): Promise<void> {
    await openBusinessPage(page, "locations", "Sedi");
    await page.getByRole("radio", { name: "Vista griglia" }).click();
    const main = page.getByRole("main");
    const firstCard = main.getByRole("list", { name: "Sedi" }).getByRole("listitem").first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    await firstCard.getByRole("link").first().click();
    // Entrando si atterra sulla prima voce della sede (§46.1 f): la scheda è
    // la voce «Scheda». Si aspetta l'atterraggio prima del clic, altrimenti
    // il redirect vincerebbe sul clic.
    await page.waitForURL(/\/locations\/[0-9a-f-]+\/[a-z-]+$/);
    await (await sidebarLink(page, "Scheda")).click();
    await expect(tile(page, PART.orari)).toBeVisible({ timeout: 15_000 });
}

const sedeBase = (page: Page) =>
    page.url().replace(/[?#].*$/, "").replace(/\/(anagrafica|orari|ordini-al-tavolo|prenotazioni-online|sala|ordini-prenotazioni|canali|pubblicazione|come-lavorate)$/, "");

test.describe("Scheda della sede", () => {
    test("si apre dalla griglia: il cruscotto con le tessere e il telefono", async ({ page }) => {
        await openFirstLocation(page);
        // La via di ritorno sta nella pill del contesto (§46.1 g).
        await expect(
            page.getByRole("navigation", { name: "Contesto" }).getByRole("link", { name: /^(Tutte le sedi|Azienda)$/ })
        ).toBeVisible();
        // Niente più tab nella testata: il nome della sede col suo stato.
        await expect(page.getByRole("tab")).toHaveCount(0);
        await expect(page.getByText(/^(Online|Sospesa)/).first()).toBeVisible();
        for (const title of Object.values(PART)) {
            await expect(tile(page, title)).toBeVisible();
        }
        await expect(page.getByRole("main").getByText("La vostra pagina", { exact: true })).toBeVisible();
    });

    test("una tessera apre la sua parte a fuoco, e il percorso torna al cruscotto", async ({ page }) => {
        await openFirstLocation(page);
        await tile(page, PART.contatti).click();
        await expect(page).toHaveURL(/\/anagrafica\?parte=contatti$/);
        await expect(rail(page).getByRole("button", { name: PART.contatti })).toHaveAttribute("aria-current", "true");
        await expect(page.getByRole("heading", { name: PART.contatti, level: 3 })).toBeVisible();

        // Dalla colonna a sinistra si passa a un'altra parte.
        await rail(page).getByRole("button", { name: PART.orari }).click();
        await expect(page).toHaveURL(/\/anagrafica\?parte=orari$/);
        await expect(page.getByRole("main").getByText(/^(Orari di apertura|Settimana)$/).first()).toBeVisible({ timeout: 15_000 });

        // «Fatto» torna al cruscotto.
        await page.getByRole("main").getByRole("button", { name: "Fatto", exact: true }).click();
        await expect(page).toHaveURL(/\/anagrafica$/);
        await expect(tile(page, PART.orari)).toBeVisible();
    });

    test("le parti delle prenotazioni e degli ordini mostrano il loro contenuto", async ({ page }) => {
        await openFirstLocation(page);
        const main = page.getByRole("main");
        // Al centro della tessera c'è l'interruttore: si apre dal titolo.
        await tile(page, PART.ordini).click({ position: { x: 24, y: 24 } });
        await expect(main.getByText(/^(Ordinazioni dal tavolo|Ordini al tavolo|Ordini dal tavolo)$/).first()).toBeVisible({ timeout: 15_000 });
        await rail(page).getByRole("button", { name: PART.prenotazioni }).click();
        await expect(main.getByText("Richieste dal modulo pubblico", { exact: true })).toBeVisible({ timeout: 15_000 });
    });

    test("indirizzo web: il drawer si apre e si chiude senza salvare", async ({ page }) => {
        await openFirstLocation(page);
        const main = page.getByRole("main");
        // L'indirizzo web sta nella parte «La vostra pagina e il QR».
        await main.getByRole("button", { name: "QR e PDF", exact: true }).click();
        await expect(page).toHaveURL(/\?parte=link$/);
        await main.getByRole("button", { name: /^(Modifica indirizzo web|Cambia indirizzo)/ }).first().click();
        const dialog = page.getByRole("dialog");
        await expect(dialog.getByRole("textbox", { name: /Indirizzo web/ })).toBeVisible();
        await dialog.getByRole("button", { name: "Annulla", exact: true }).click();
        await expect(page.getByRole("dialog")).toBeHidden();
    });

    async function openDelete(page: Page) {
        await page.getByRole("button", { name: "Azioni sede", exact: true }).click();
        await page.getByRole("menuitem", { name: /^Elimina la sede/ }).click();
        return page.getByRole("alertdialog", { name: /^Elimina/ });
    }

    test("eliminare la sede: la conferma si apre e si chiude senza eliminare", async ({ page }) => {
        await openFirstLocation(page);
        const dialog = await openDelete(page);
        await expect(dialog).toBeVisible();
        await dialog.getByRole("button", { name: "Annulla", exact: true }).click();
        await expect(dialog).toBeHidden();
        await expect(page).toHaveURL(/\/locations\/[0-9a-f-]+/);
    });

    test("eliminare la sede: la conferma dice le storie che se ne vanno con la sede (§50.13)", async ({ page }) => {
        // Il conteggio è finto: le storie legate a una sede, in staging, non ci sono.
        // Risposta vera (intestazioni CORS comprese), col totale riscritto.
        await page.route(/\/rest\/v1\/stories\?.*activity_id=eq\./, async route => {
            try {
                const response = await route.fetch();
                await route.fulfill({ response, headers: { ...response.headers(), "content-range": "*/2" } });
            } catch {
                // Pagina chiusa a metà richiesta (fine del test): niente da riscrivere.
            }
        });
        await openFirstLocation(page);
        const dialog = await openDelete(page);
        await expect(dialog).toContainText("2 storie legate a questa sede");
        await dialog.getByRole("button", { name: "Annulla", exact: true }).click();
    });

    test("i vecchi ?tab= portano alla parte giusta", async ({ page }) => {
        await openFirstLocation(page);
        const base = sedeBase(page);
        await page.goto(`${base}?tab=info`);
        await expect(page).toHaveURL(/\/anagrafica$/, { timeout: 15_000 });
        await expect(tile(page, PART.orari)).toBeVisible();
        await page.goto(`${base}?tab=hours-services`);
        await expect(page).toHaveURL(/\/anagrafica\?parte=offrite$/, { timeout: 15_000 });
        await expect(rail(page).getByRole("button", { name: PART.offrite })).toHaveAttribute("aria-current", "true");
    });

    test("i vecchi ?tab=sala, ?tab=tables e /sala portano alla Sala di Servizio", async ({ page }) => {
        await openFirstLocation(page);
        const base = sedeBase(page);
        for (const tab of ["sala", "tables"]) {
            await page.goto(`${base}?tab=${tab}`);
            await expect(page).toHaveURL(/\/servizio\?modo=sala$/, { timeout: 15_000 });
        }
        await page.goto(`${base}/sala`);
        await expect(page).toHaveURL(/\/servizio\?modo=sala$/, { timeout: 15_000 });
    });

    test("le vecchie pagine della scheda aprono la loro parte", async ({ page }) => {
        await openFirstLocation(page);
        const base = sedeBase(page);
        const cases: [string, RegExp][] = [
            ["orari", /\?parte=orari$/],
            ["pubblicazione", /\?parte=link$/],
            ["ordini-al-tavolo", /\?parte=ordini$/],
            ["prenotazioni-online", /\?parte=prenotazioni$/],
            ["ordini-prenotazioni", /\?parte=ordini$/],
            ["canali#prenotazioni", /\?parte=prenotazioni$/],
            ["come-lavorate", /\/anagrafica$/]
        ];
        for (const [from, to] of cases) {
            await page.goto(`${base}/${from}`);
            await expect(page).toHaveURL(to, { timeout: 15_000 });
        }
    });

    test("un segmento sconosciuto sotto la sede apre la Scheda, non «Pagina non trovata»", async ({ page }) => {
        await openFirstLocation(page);
        await page.goto(`${sedeBase(page)}/ordini`);
        await expect(page).toHaveURL(/\/anagrafica$/, { timeout: 15_000 });
        await expect(tile(page, PART.orari)).toBeVisible();
        await expect(page.getByText("Pagina non trovata")).toHaveCount(0);
    });
});
