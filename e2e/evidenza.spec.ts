import { expect, test, type Locator, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";
import { FEATURED, LINK, MISSING_FEATURED, PRODUCT, stubEvidenza, type EvidenzaStub, type WriteCall } from "./evidenzaStub";
import type { Row } from "./restStub";

/**
 * In evidenza (lotto `ds-5-stili-storie-evidenza`, P0). Scritto sulla pagina di
 * **oggi**, prima di ricomporla: deve restare verde passo dopo passo.
 *
 * Dati finti in `evidenzaStub.ts`; permessi, azienda e sidebar veri. Nessuna
 * scrittura parte: ogni gesto che scrive ha un test di cablaggio. Oggi il
 * dettaglio salva sezione per sezione in quattro drawer; da P8 è una pagina con
 * un Salva solo (§28.3): i helper qui sotto aprono il drawer se c'è, e
 * confermano col Salva della testata se non c'è.
 */

function main(page: Page) {
    return page.getByRole("main");
}

function dialog(page: Page): Locator {
    return page.getByRole("dialog").or(page.getByRole("alertdialog")).last();
}

function write(stub: EvidenzaStub, key: string): WriteCall | undefined {
    return stub.writes.find(w => w.key === key);
}

function writes(stub: EvidenzaStub, key: string): WriteCall[] {
    return stub.writes.filter(w => w.key === key);
}

function contentName(page: Page, name: string): Locator {
    return main(page).getByText(name, { exact: true }).first();
}

function actionsOf(anchor: Locator): Locator {
    return anchor
        .locator("xpath=ancestor::*[.//button[starts-with(@aria-label,'Azioni')]][1]")
        .getByRole("button", { name: /^Azioni/ })
        .first();
}

function checkboxOf(anchor: Locator): Locator {
    return anchor
        .locator("xpath=ancestor::*[.//*[@aria-label='Seleziona riga']][1]")
        .getByRole("checkbox", { name: "Seleziona riga" });
}

async function setView(page: Page, view: "list" | "grid"): Promise<void> {
    await page.addInitScript(v => localStorage.setItem("featuredContents_viewMode", v), view);
}

async function openList(page: Page, view: "list" | "grid" = "list"): Promise<void> {
    await setView(page, view);
    await openBusinessPage(page, "featured", "In evidenza");
    await expect(contentName(page, "Menu di coppia e2e")).toBeVisible({ timeout: 15_000 });
}

async function openContent(page: Page, id: string): Promise<void> {
    if (!/\/business\/[0-9a-f-]+\//.test(page.url())) await openBusinessPage(page, "featured", "In evidenza");
    await page.goto(page.url().replace(/\/business\/([0-9a-f-]+)\/.*$/, `/business/$1/featured/${id}`));
}

async function search(page: Page, text: string): Promise<void> {
    const field = page.getByPlaceholder(/^Cerca/).first();
    if (!(await field.isVisible().catch(() => false))) {
        await page.getByRole("button", { name: "Cerca", exact: true }).click();
    }
    await field.fill(text);
}

async function noSideScroll(page: Page): Promise<void> {
    const overflow = await page.evaluate(() => {
        const de = document.documentElement;
        const scrollers = [de, ...Array.from(document.querySelectorAll<HTMLElement>("main"))];
        return Math.max(...scrollers.map(el => el.scrollWidth - el.clientWidth));
    });
    expect(overflow).toBeLessThanOrEqual(0);
}

const SECTION = { identity: 0, media: 1, type: 2, cta: 3 } as const;

/**
 * Dove stanno i campi di una sezione del dettaglio: il drawer della sezione
 * oggi (il suo «Modifica»), la pagina domani.
 */
async function section(page: Page, which: keyof typeof SECTION): Promise<{ scope: Locator; commit: () => Promise<void> }> {
    const edit = main(page).getByRole("button", { name: "Modifica", exact: true });
    await expect(main(page).getByRole("button", { name: "Modifica", exact: true }).or(main(page).getByRole("textbox", { name: /^Titolo/ })).first()).toBeVisible({
        timeout: 15_000
    });
    if ((await edit.count()) > 0) {
        await edit.nth(SECTION[which]).click();
        const drawer = dialog(page);
        return { scope: drawer, commit: () => drawer.getByRole("button", { name: "Salva", exact: true }).click() };
    }
    return { scope: main(page), commit: () => page.getByRole("button", { name: "Salva", exact: true }).first().click() };
}

/** Se la pagina ha una bozza sporca (da P9 anche la tab Prodotti), la salva. */
async function saveIfDraft(page: Page): Promise<void> {
    const save = page.getByRole("button", { name: "Salva", exact: true }).first();
    if (await save.isVisible().catch(() => false)) await save.click();
}

async function openProductsTab(page: Page): Promise<void> {
    const tab = page.getByRole("tab", { name: /^Prodotti/ });
    await expect(tab).toBeEnabled({ timeout: 15_000 });
    await tab.click();
}

function patchFeatured(stub: EvidenzaStub): void {
    stub.onWrite("featured_contents.PATCH", call => {
        const row = stub.tables.featured_contents.find(r => `eq.${r.id}` === call.params.get("id"));
        if (row) Object.assign(row, call.body as Row);
        return row ?? null;
    });
}

let stub: EvidenzaStub;

test.beforeEach(async ({ page }) => {
    stub = await stubEvidenza(page);
});

test.describe("In evidenza — elenco", () => {
    test("lista: nome interno, cosa leggono i clienti", async ({ page }) => {
        await openList(page);
        await expect(page).toHaveTitle(/^In evidenza — .+ \| CataloGlobe$/);
        await expect(contentName(page, "Aperitivo giovedì e2e")).toBeVisible();
        await expect(main(page).getByText(/Tagliere \+ 2 drink/)).toBeVisible();
        await expect(contentName(page, "Concerto e2e")).toBeVisible();
        await expect(page.getByRole("button", { name: "Crea contenuto" }).first()).toBeVisible();
    });

    test("griglia: le stesse card, la card apre il dettaglio", async ({ page }) => {
        await openList(page, "grid");
        await contentName(page, "Concerto e2e").click();
        await expect(page).toHaveURL(new RegExp(`/featured/${FEATURED.concerto}(\\?.*)?$`));
    });

    test("ricerca per nome interno e per titolo", async ({ page }) => {
        await openList(page);
        await search(page, "ferragosto");
        await expect(contentName(page, "Chiusura ferragosto e2e")).toBeVisible();
        await expect(contentName(page, "Concerto e2e")).toHaveCount(0);
        await search(page, "acustico");
        await expect(contentName(page, "Concerto e2e")).toBeVisible();
    });

    test("crea un contenuto e apre il dettaglio", async ({ page }) => {
        stub.onWrite("featured_contents.POST", call => {
            const body = call.body as Row;
            const row = { ...stub.tables.featured_contents[2], ...body, id: "e2eef000-0000-4000-a000-000000000901" };
            stub.tables.featured_contents.push(row);
            return row;
        });
        await openList(page);
        await page.getByRole("button", { name: "Crea contenuto" }).first().click();
        const drawer = dialog(page);
        await drawer.getByRole("textbox", { name: /^Titolo/ }).fill("Brunch e2e");
        await drawer.getByRole("textbox", { name: /^Nome interno/ }).fill("Brunch domenica e2e");
        await drawer.getByRole("button", { name: /^Crea/ }).click();
        await expect.poll(() => write(stub, "featured_contents.POST")?.body).toMatchObject({
            title: "Brunch e2e",
            internal_name: "Brunch domenica e2e"
        });
        await expect(page).toHaveURL(/\/featured\/e2eef000-0000-4000-a000-000000000901(\?.*)?$/);
    });

    test("elimina un contenuto: l'impatto si legge prima", async ({ page }) => {
        stub.onWrite("featured_contents.DELETE", () => null);
        await openList(page);
        await actionsOf(contentName(page, "Aperitivo giovedì e2e")).click();
        await page.getByRole("menuitem", { name: "Elimina" }).click();
        const confirm = dialog(page);
        await expect(confirm).toContainText(/1 regol/);
        await confirm.getByRole("button", { name: /^(Conferma eliminazione|Elimina)/i }).click();
        await expect.poll(() => write(stub, "featured_contents.DELETE")?.params.get("id")).toBe(`eq.${FEATURED.aperitivo}`);
    });

    test("elimina più contenuti", async ({ page }) => {
        stub.onWrite("featured_contents.DELETE", () => null);
        await openList(page);
        await checkboxOf(contentName(page, "Chiusura ferragosto e2e")).check();
        await checkboxOf(contentName(page, "Concerto e2e")).check();
        await page.getByRole("button", { name: /^Elimina/ }).last().click();
        // Da P1 c'è la conferma col conteggio; oggi elimina subito.
        const confirm = page.getByRole("alertdialog");
        if (await confirm.isVisible().catch(() => false)) {
            await confirm.getByRole("button", { name: /^Elimina/ }).click();
        }
        await expect.poll(() => writes(stub, "featured_contents.DELETE").length).toBe(2);
    });

    test("senza featured.write: niente crea, niente elimina", async ({ page }) => {
        await stub.revoke("featured.write");
        await openList(page);
        await stub.revoked;
        await expect(page.getByRole("button", { name: "Crea contenuto" })).toHaveCount(0);
        await actionsOf(contentName(page, "Concerto e2e")).click();
        await expect(page.getByRole("menuitem", { name: "Elimina" })).toHaveCount(0);
    });
});

test.describe("In evidenza — elenco ricomposto (P7)", () => {
    test("vista predefinita: lista; la riga dice tipo, cosa leggono i clienti, i prodotti", async ({ page }) => {
        await openBusinessPage(page, "featured", "In evidenza");
        await expect(contentName(page, "Menu di coppia e2e")).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole("radio", { name: "Vista lista" })).toHaveAttribute("aria-checked", "true");
        const row = contentName(page, "Menu di coppia e2e").locator("xpath=ancestor::*[@role='row'][1]");
        await expect(row).toContainText("Bundle");
        await expect(row).toContainText("I clienti leggono «Menu coppia» · 2 prodotti");
        const annuncio = contentName(page, "Chiusura ferragosto e2e").locator("xpath=ancestor::*[@role='row'][1]");
        await expect(annuncio).toContainText("I clienti leggono «Siamo chiusi il 15 agosto»");
        await expect(annuncio).not.toContainText("prodott");
    });

    test("errore di caricamento: lo stato lo dice, «Riprova» ricarica", async ({ page }) => {
        let fail = true;
        await page.route(/\/rest\/v1\/featured_contents\?/, route =>
            fail && route.request().method() === "GET" ? route.fulfill({ status: 500, json: { message: "e2e" } }) : route.fallback()
        );
        await openBusinessPage(page, "featured", "In evidenza");
        await expect(main(page).getByText("Non è stato possibile caricare i contenuti")).toBeVisible({ timeout: 15_000 });
        fail = false;
        await main(page).getByRole("button", { name: "Riprova" }).click();
        await expect(contentName(page, "Menu di coppia e2e")).toBeVisible();
    });

    for (const view of ["grid", "list"] as const) {
        test(`${view}: ricerca senza esito, e si azzera`, async ({ page }) => {
            await openList(page, view);
            await search(page, "nessun contenuto si chiama così");
            await expect(main(page).getByText("Nessun risultato")).toBeVisible();
            await main(page).getByRole("button", { name: /Azzera|Cancella|Rimuovi i filtri/ }).first().click();
            await expect(contentName(page, "Menu di coppia e2e")).toBeVisible();
        });
    }

    test("eliminare è una conferma col nome interno", async ({ page }) => {
        await openList(page);
        await actionsOf(contentName(page, "Concerto e2e")).click();
        await page.getByRole("menuitem", { name: "Elimina" }).click();
        const confirm = page.getByRole("alertdialog");
        await expect(confirm).toContainText("Eliminare «Concerto e2e»?");
        await expect(confirm).toContainText("Non si torna indietro.");
        await confirm.getByRole("button", { name: "Annulla" }).click();
        expect(stub.writes.filter(w => !w.key.startsWith("translation"))).toHaveLength(0);
    });
});

test.describe("In evidenza — dettaglio", () => {
    test("testi: titolo, sottotitolo, nome interno", async ({ page }) => {
        patchFeatured(stub);
        await openContent(page, FEATURED.concerto);
        const { scope, commit } = await section(page, "identity");
        await scope.getByRole("textbox", { name: /^Titolo/ }).fill("Live in giardino");
        await scope.getByRole("textbox", { name: /^Sottotitolo/ }).fill("Venerdì alle 21");
        await commit();
        await expect.poll(() => write(stub, "featured_contents.PATCH")?.body).toMatchObject({
            title: "Live in giardino",
            subtitle: "Venerdì alle 21",
            internal_name: "Concerto e2e"
        });
    });

    test("tipo: Promo diventa Bundle col prezzo, la modalità si deriva", async ({ page }) => {
        patchFeatured(stub);
        await openContent(page, FEATURED.aperitivo);
        const { scope, commit } = await section(page, "type");
        await scope.getByText("Bundle", { exact: true }).first().click();
        await scope.getByRole("spinbutton", { name: /^Prezzo/ }).or(scope.getByRole("textbox", { name: /^Prezzo/ })).first().fill("18");
        await commit();
        await expect.poll(() => write(stub, "featured_contents.PATCH")?.body).toMatchObject({
            content_type: "bundle",
            pricing_mode: "bundle",
            bundle_price: 18
        });
    });

    test("tipo: Annuncio toglie i prodotti", async ({ page }) => {
        patchFeatured(stub);
        await openContent(page, FEATURED.coppia);
        const { scope, commit } = await section(page, "type");
        await scope.getByText("Annuncio", { exact: true }).first().click();
        await commit();
        await expect.poll(() => write(stub, "featured_contents.PATCH")?.body).toMatchObject({
            content_type: "announcement",
            pricing_mode: "none",
            bundle_price: null
        });
        const tab = page.getByRole("tab", { name: /^Prodotti/ });
        await expect.poll(async () => (await tab.count()) === 0 || (await tab.isDisabled())).toBe(true);
    });

    test("bottone: testo e link https", async ({ page }) => {
        patchFeatured(stub);
        await openContent(page, FEATURED.concerto);
        const { scope, commit } = await section(page, "cta");
        await scope.getByRole("textbox", { name: /^Testo/ }).fill("Riserva un tavolo");
        await commit();
        await expect.poll(() => write(stub, "featured_contents.PATCH")?.body).toMatchObject({
            cta_text: "Riserva un tavolo",
            cta_url: "https://example.com"
        });
    });

    test("un annuncio non ha la tab Prodotti", async ({ page }) => {
        await openContent(page, FEATURED.chiusura);
        await expect(main(page).getByText(/Siamo chiusi il 15 agosto/).or(main(page).getByRole("textbox", { name: /^Titolo/ })).first()).toBeVisible({
            timeout: 15_000
        });
        const tab = page.getByRole("tab", { name: /^Prodotti/ });
        expect((await tab.count()) === 0 || (await tab.isDisabled())).toBe(true);
    });

    test("contenuto che non esiste", async ({ page }) => {
        await openContent(page, MISSING_FEATURED);
        await expect(main(page).getByText(/non trovato|Impossibile caricare il contenuto/)).toBeVisible({ timeout: 15_000 });
    });

    test("senza featured.write: niente Modifica né Salva", async ({ page }) => {
        await stub.revoke("featured.write");
        await openContent(page, FEATURED.concerto);
        await stub.revoked;
        await expect(main(page).getByText(/Live acustico/).first().or(main(page).getByRole("textbox", { name: /^Titolo/ })).first()).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByRole("button", { name: "Modifica", exact: true })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Salva", exact: true })).toHaveCount(0);
    });
});

test.describe("In evidenza — una pagina, un Salva (P8)", () => {
    test("tipo, testi e bottone in una scrittura sola", async ({ page }) => {
        patchFeatured(stub);
        await openContent(page, FEATURED.aperitivo);
        await expect(main(page).getByRole("textbox", { name: /^Titolo/ })).toHaveValue("Tagliere + 2 drink", { timeout: 15_000 });
        await expect(main(page).getByRole("button", { name: "Modifica", exact: true })).toHaveCount(0);
        await main(page).getByRole("textbox", { name: /^Sottotitolo/ }).fill("Solo il giovedì");
        await main(page).getByRole("textbox", { name: /^Testo del bottone/ }).fill("Prenota");
        await main(page).getByRole("textbox", { name: /^Link del bottone/ }).fill("https://example.com/prenota");
        await main(page).getByText("Bundle", { exact: true }).click();
        await main(page).getByRole("spinbutton", { name: /^Prezzo/ }).fill("14");
        await page.getByRole("button", { name: "Salva", exact: true }).click();
        await expect.poll(() => writes(stub, "featured_contents.PATCH").length).toBe(1);
        expect(write(stub, "featured_contents.PATCH")?.body).toMatchObject({
            subtitle: "Solo il giovedì",
            cta_text: "Prenota",
            cta_url: "https://example.com/prenota",
            content_type: "bundle",
            pricing_mode: "bundle",
            bundle_price: 14
        });
    });

    test("cambiare tipo avvisa, la tab Prodotti segue la bozza e torna con Annulla", async ({ page }) => {
        await openContent(page, FEATURED.coppia);
        await expect(page.getByRole("tab", { name: "Prodotti" })).toBeVisible({ timeout: 15_000 });
        await main(page).getByText("Annuncio", { exact: true }).click();
        await expect(main(page).getByText(/sparisce la sezione Prodotti/)).toBeVisible();
        await expect(page.getByRole("tab", { name: "Prodotti" })).toHaveCount(0);
        await page.getByRole("button", { name: "Annulla", exact: true }).first().click();
        await page.getByRole("alertdialog").getByRole("button", { name: "Scarta" }).click();
        await expect(page.getByRole("tab", { name: "Prodotti" })).toBeVisible();
        expect(stub.writes.filter(w => !w.key.startsWith("translation"))).toHaveLength(0);
    });

    test("il bundle senza prezzo non si salva", async ({ page }) => {
        await openContent(page, FEATURED.aperitivo);
        await expect(main(page).getByRole("textbox", { name: /^Titolo/ })).toBeVisible({ timeout: 15_000 });
        await main(page).getByText("Bundle", { exact: true }).click();
        await page.getByRole("button", { name: "Salva", exact: true }).click();
        await expect(main(page).getByText("Inserisci il prezzo del bundle.")).toBeVisible();
        expect(writes(stub, "featured_contents.PATCH")).toHaveLength(0);
    });

    test("?tab=products a freddo apre la tab Prodotti", async ({ page }) => {
        await openContent(page, FEATURED.coppia);
        await expect(page.getByRole("tab", { name: "Prodotti" })).toBeVisible({ timeout: 15_000 });
        await page.goto(page.url().replace(/(\?.*)?$/, "?tab=products"));
        await expect(main(page).getByText("Big Arch e2e")).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole("tab", { name: "Prodotti" })).toHaveAttribute("aria-selected", "true");
    });

    test("uscita con modifiche: la guardia chiede, «Annulla» resta", async ({ page }) => {
        await openContent(page, FEATURED.concerto);
        const title = main(page).getByRole("textbox", { name: /^Titolo/ });
        await expect(title).toHaveValue("Live acustico", { timeout: 15_000 });
        await title.fill("Live acustico bis");
        await page.getByRole("navigation", { name: "Menu principale" }).getByRole("link", { name: "Menù" }).click();
        const guard = page.getByRole("alertdialog");
        await expect(guard).toContainText("Modifiche non salvate");
        await guard.getByRole("button", { name: /^(Annulla|Resta)/ }).click();
        await expect(page).toHaveURL(new RegExp(`/featured/${FEATURED.concerto}`));
        await expect(title).toHaveValue("Live acustico bis");
    });

    test("contenuto che non esiste: lo dice, e riporta all'elenco", async ({ page }) => {
        await openContent(page, MISSING_FEATURED);
        await expect(main(page).getByText("Contenuto non trovato")).toBeVisible({ timeout: 15_000 });
        await main(page).getByRole("button", { name: "Torna a In evidenza" }).click();
        await expect(page).toHaveURL(/\/featured$/);
    });
});

test.describe("In evidenza — prodotti del contenuto", () => {
    test("elenco nell'ordine, con la nota", async ({ page }) => {
        await openContent(page, FEATURED.coppia);
        await openProductsTab(page);
        await expect(main(page).getByText("Big Arch e2e")).toBeVisible();
        await expect(main(page).getByText("Patatine medie e2e")).toBeVisible();
        await expect(main(page).getByRole("textbox").first()).toHaveValue("la scelta più richiesta");
    });

    test("la nota di un prodotto si salva", async ({ page }) => {
        stub.onWrite("featured_content_products.PATCH", () => null);
        await openContent(page, FEATURED.coppia);
        await openProductsTab(page);
        const note = main(page).getByRole("textbox").nth(1);
        await note.fill("solo la versione classica");
        await note.press("Tab");
        await saveIfDraft(page);
        await expect.poll(() => writes(stub, "featured_content_products.PATCH").find(w => w.params.get("id") === `eq.${LINK.coppiaPatatine}`)?.body).toMatchObject({
            note: "solo la versione classica"
        });
    });

    test("togliere un prodotto", async ({ page }) => {
        stub.onWrite("featured_content_products.DELETE", () => null);
        await openContent(page, FEATURED.coppia);
        await openProductsTab(page);
        await actionsOf(main(page).getByText("Big Arch e2e")).click();
        await page.getByRole("menuitem", { name: /^(Rimuovi prodotto|Togli)/ }).click();
        await saveIfDraft(page);
        await expect.poll(() => write(stub, "featured_content_products.DELETE")?.params.get("id") ?? "").toContain(LINK.coppiaBig);
    });

    test("aggiungere un prodotto esistente", async ({ page }) => {
        stub.onWrite("featured_content_products.POST", () => null);
        await openContent(page, FEATURED.coppia);
        await openProductsTab(page);
        await page.getByRole("button", { name: /Aggiungi/ }).first().click();
        const drawer = dialog(page);
        await checkboxOf(drawer.getByText("Tagliere e2e")).check();
        await drawer.getByRole("button", { name: "Applica" }).click();
        await saveIfDraft(page);
        await expect.poll(() => write(stub, "featured_content_products.POST")?.body).toEqual([
            expect.objectContaining({ featured_content_id: FEATURED.coppia, product_id: PRODUCT.tagliere, sort_order: 3 })
        ]);
    });
});

test.describe("In evidenza — permessi e conferme (P1)", () => {
    test("elimina più: conferma col conteggio, annulla rimette la selezione", async ({ page }) => {
        stub.onWrite("featured_contents.DELETE", () => null);
        await openList(page);
        await checkboxOf(contentName(page, "Chiusura ferragosto e2e")).check();
        await checkboxOf(contentName(page, "Concerto e2e")).check();
        await page.getByRole("button", { name: /^Elimina/ }).last().click();
        const confirm = page.getByRole("alertdialog");
        await expect(confirm).toContainText("Eliminare 2 contenuti?");
        await confirm.getByRole("button", { name: "Annulla" }).click();
        await expect(confirm).toHaveCount(0);
        expect(writes(stub, "featured_contents.DELETE")).toHaveLength(0);
        await expect(checkboxOf(contentName(page, "Concerto e2e"))).toBeChecked();
        await page.getByRole("button", { name: /^Elimina/ }).last().click();
        await confirm.getByRole("button", { name: "Elimina 2 contenuti" }).click();
        await expect.poll(() => writes(stub, "featured_contents.DELETE").length).toBe(2);
    });

    test("prodotti senza featured.write: niente maniglia, nota spenta, niente Rimuovi", async ({ page }) => {
        await stub.revoke("featured.write");
        await openContent(page, FEATURED.coppia);
        await stub.revoked;
        await openProductsTab(page);
        await expect(main(page).getByText("Big Arch e2e")).toBeVisible();
        await expect(main(page).getByRole("button", { name: "Trascina per riordinare" })).toHaveCount(0);
        await expect(main(page).getByRole("textbox").first()).toBeDisabled();
        const kebab = main(page).getByRole("button", { name: /^Azioni/ });
        if ((await kebab.count()) > 0) {
            await kebab.first().click();
            await expect(page.getByRole("menuitem", { name: /^(Rimuovi prodotto|Togli)/ })).toHaveCount(0);
        }
    });

    test("senza featured.read: il blocco, e nessuna lettura dei contenuti", async ({ page }) => {
        const reads: string[] = [];
        page.on("request", r => {
            if (/\/rest\/v1\/featured_contents\?/.test(r.url())) reads.push(r.url());
        });
        await stub.revoke("featured.read");
        await openContent(page, FEATURED.coppia);
        await stub.revoked;
        await expect(main(page).getByText("Non hai accesso a questa sezione")).toBeVisible({ timeout: 15_000 });
        expect(reads).toHaveLength(0);
    });
});

test.describe("In evidenza — larghezze", () => {
    for (const width of [1280, 768, 375]) {
        test(`${width}: elenco e dettaglio senza scroll di lato`, async ({ page }) => {
            await openList(page);
            await page.setViewportSize({ width, height: 900 });
            await page.reload();
            await expect(contentName(page, "Menu di coppia e2e")).toBeVisible({ timeout: 15_000 });
            await noSideScroll(page);
            await openContent(page, FEATURED.coppia);
            await expect(page.getByRole("tab", { name: /^Prodotti/ })).toBeVisible({ timeout: 15_000 });
            await noSideScroll(page);
        });
    }
});
