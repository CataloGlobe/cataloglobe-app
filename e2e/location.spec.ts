import { expect, test, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";
import { sidebarLink } from "./nav";
import { stubRest, type Row } from "./restStub";

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

    test("scorrendo la scheda scorre anche il telefono, fino in fondo", async ({ page }) => {
        // La misura dell'Air: sotto 1050 di scheda il telefono non c'è.
        await page.setViewportSize({ width: 1470, height: 830 });
        await openFirstLocation(page);
        // Aperta dall'indirizzo, come dopo un ricarica: la scheda arriva dopo i dati.
        await page.reload();
        await expect(tile(page, PART.orari)).toBeVisible({ timeout: 15_000 });
        const phone = page.getByLabel("Come la vede il cliente");
        await expect(phone).toBeVisible();
        // Il contenitore che scorre è il primo antenato della scheda con overflow.
        const scrollTo = (where: "top" | "bottom") =>
            tile(page, PART.orari).evaluate((el, where) => {
                let p = el.parentElement;
                while (p && !/auto|scroll/.test(getComputedStyle(p).overflowY)) p = p.parentElement;
                const c = (p ?? document.scrollingElement) as HTMLElement;
                c.scrollTop = where === "top" ? 0 : c.scrollHeight;
            }, where);
        const phoneScroll = () =>
            phone.evaluate(ph => {
                const scr = Array.from(ph.querySelectorAll<HTMLElement>("*")).find(e =>
                    /auto|scroll/.test(getComputedStyle(e).overflowY)
                );
                return scr ? { top: scr.scrollTop, max: scr.scrollHeight - scr.clientHeight } : null;
            });
        // Con poche cose compilate il telefono ci sta tutto e non ha da
        // scorrere: si allunga come una sede piena, così la prova non dipende dai dati.
        await phone.evaluate(ph => {
            const scr = Array.from(ph.querySelectorAll<HTMLElement>("*")).find(e =>
                /auto|scroll/.test(getComputedStyle(e).overflowY)
            );
            const pad = document.createElement("div");
            pad.style.height = "400px";
            scr?.appendChild(pad);
        });
        expect((await phoneScroll())?.max).toBeGreaterThan(300);
        await scrollTo("bottom");
        await expect
            .poll(async () => {
                const s = await phoneScroll();
                return s ? s.max - s.top : Infinity;
            })
            .toBeLessThanOrEqual(1);
        await scrollTo("top");
        await expect.poll(async () => (await phoneScroll())?.top).toBe(0);
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
        // Al centro della tessera c'è l'interruttore: si apre dal titolo (il pulsante).
        await tile(page, PART.ordini).click();
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

/**
 * Le chiusure di oggi dalla riga «Adesso» (review #336, punto 13). Orari e
 * chiusure sono finti e nessuna scrittura parte. L'orologio è fermo a venerdì
 * notte, l'una e un quarto a Roma, e il dispositivo sta a Tokyo (già sabato
 * mattina): «oggi» è la giornata di servizio di Roma, cioè venerdì 2. Una
 * notte passata: con l'orologio avanti la sessione scadrebbe.
 */
test.describe("Scheda della sede — le chiusure di oggi", () => {
    test.use({ timezoneId: "Asia/Tokyo" });

    const NOTTE = new Date("2026-10-03T01:15:00+02:00");
    const VENERDI = "2026-10-02";

    async function openWithClosures(page: Page, initial: Row[], at = NOTTE) {
        await page.clock.setFixedTime(at);
        const stub = await stubRest(page, { tables: {} });
        const closures: Row[] = [...initial];
        const eq = (url: string, key: string) => new URL(url).searchParams.get(key)?.replace(/^eq\./, "") ?? "";
        // Venerdì 19–2: all'una e un quarto si è ancora aperti.
        await page.route(/\/rest\/v1\/activity_hours(\?|$)/, route => {
            if (route.request().method() !== "GET") return route.fallback();
            const url = route.request().url();
            return route.fulfill({
                json: [
                    {
                        id: "h-ven",
                        tenant_id: eq(url, "tenant_id"),
                        activity_id: eq(url, "activity_id"),
                        day_of_week: 4,
                        slot_index: 0,
                        opens_at: "19:00",
                        closes_at: "02:00",
                        closes_next_day: true,
                        is_closed: false
                    }
                ]
            });
        });
        await page.route(/\/rest\/v1\/activity_closures(\?|$)/, route => {
            if (route.request().method() !== "GET") return route.fallback();
            const url = route.request().url();
            const ids = { tenant_id: eq(url, "tenant_id"), activity_id: eq(url, "activity_id") };
            return route.fulfill({ json: closures.map(c => ({ ...c, ...ids })) });
        });
        stub.onWrite("activity_closures.POST", call => {
            const row = { id: `c-${closures.length + 1}`, ...(call.body as Row) };
            closures.push(row);
            return row;
        });
        stub.onWrite("activity_closures.DELETE", call => {
            const id = call.params.get("id")?.replace(/^eq\./, "");
            closures.splice(closures.findIndex(c => c.id === id), 1);
            return null;
        });
        stub.onWrite("translations.DELETE", () => null);
        await openFirstLocation(page);
        return stub;
    }

    const closure = (label: string): Row => ({
        id: "c-0",
        closure_date: VENERDI,
        end_date: null,
        label,
        is_closed: true,
        slots: null
    });

    test("all'una di notte «Chiudi oggi» chiude la sera di venerdì, in ora di Roma", async ({ page }) => {
        const stub = await openWithClosures(page, []);
        await expect(page.getByText("Adesso · sabato 1:15")).toBeVisible();
        await page.getByRole("button", { name: "Chiudi oggi" }).click();
        await expect(page.getByRole("button", { name: "Torna agli orari di sempre" })).toBeVisible();
        const posted = stub.writes.filter(w => w.key === "activity_closures.POST");
        expect(posted).toHaveLength(1);
        expect(posted[0].body).toMatchObject({ closure_date: VENERDI, label: "Chiuso oggi" });
    });

    test("finito l'ultimo turno dice quando si riapre, non «Chiuso oggi» (D169)", async ({ page }) => {
        // Sabato alle 3: la sera di venerdì è finita alle 2, si riapre venerdì prossimo.
        await openWithClosures(page, [], new Date("2026-10-03T03:00:00+02:00"));
        await expect(page.getByRole("main").getByText("Chiuso · riapre venerdì alle 19").first()).toBeVisible();
        await expect(page.getByText(/Per oggi avete chiuso: riaprite venerdì alle 19\./)).toBeVisible();
        await expect(page.getByText("Chiuso oggi", { exact: true })).toHaveCount(0);
    });

    test("«Torna agli orari di sempre» toglie subito la chiusura di «Chiudi oggi»", async ({ page }) => {
        const stub = await openWithClosures(page, [closure("Chiuso oggi")]);
        await page.getByRole("button", { name: "Torna agli orari di sempre" }).click();
        await expect(page.getByRole("button", { name: "Chiudi oggi" })).toBeVisible();
        await expect(page.getByRole("alertdialog")).toHaveCount(0);
        expect(stub.writes.filter(w => w.key === "activity_closures.DELETE")).toHaveLength(1);
    });

    test("una chiusura messa a mano chiede conferma prima di andarsene", async ({ page }) => {
        const stub = await openWithClosures(page, [closure("Festa del patrono")]);
        const back = page.getByRole("button", { name: "Torna agli orari di sempre" });
        await back.click();
        const dialog = page.getByRole("alertdialog");
        await expect(dialog).toContainText("Elimina la chiusura «Festa del patrono · 2 ottobre 2026»?");
        await expect(dialog).toContainText("Il giorno torna agli orari normali.");
        await dialog.getByRole("button", { name: "Annulla" }).click();
        await expect(dialog).toHaveCount(0);
        await expect(back).toBeVisible();
        expect(stub.writes.filter(w => w.key === "activity_closures.DELETE")).toHaveLength(0);

        await back.click();
        await dialog.getByRole("button", { name: "Elimina" }).click();
        await expect(page.getByRole("button", { name: "Chiudi oggi" })).toBeVisible();
        expect(stub.writes.filter(w => w.key === "activity_closures.DELETE")).toHaveLength(1);
    });
});
