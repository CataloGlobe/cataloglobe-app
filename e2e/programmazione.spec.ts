import { expect, test, type Locator, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";
import { MATRIX_RULE_NAME, MISSING_RULE, RULE, RULE_NAME, SEDE, StubError, TENANT_ID, stubProgrammazione, type ProgrammazioneStub, type WriteCall } from "./programmazioneStub";

/**
 * Programmazione (lotto `ds-5-programmazione`, P0). Scritto sulla pagina di
 * **oggi**, prima di ricomporla: deve restare verde passo dopo passo.
 *
 * Dati: regole, sedi, gruppi, menù, prodotti e contenuti in evidenza sono finti
 * (`programmazioneStub.ts`), l'orologio è fermo a mercoledì 23/09/2026 alle 12
 * di Roma; permessi, azienda e sidebar sono veri. Nessuna scrittura parte:
 * ogni gesto che scrive ha un test di cablaggio che controlla tabella, filtri
 * e corpo.
 *
 * Dove un nome cambierà nei passi successivi (dizionario, §50 passo 2) il
 * locator accetta il nome di oggi e quello di domani. Locator per ruolo o per
 * testo visibile; dove una riga non ha un ruolo, si risale al contenitore che
 * porta il suo «Azioni».
 */

test.use({ timezoneId: "Europe/Rome", locale: "it-IT" });

function main(page: Page) {
    return page.getByRole("main");
}

/** Il nome di una regola, come testo visibile nell'elenco. */
function rule(page: Page, key: keyof typeof RULE): Locator {
    return main(page).getByText(RULE_NAME[key], { exact: true }).first();
}

/** Il contenitore della riga che porta `anchor`: il primo antenato col suo «Azioni» o il suo switch. */
function rowOf(anchor: Locator): Locator {
    return anchor.locator("xpath=ancestor::*[.//button[starts-with(@aria-label,'Azioni')] or .//*[@role='switch']][1]");
}

/** La casella di selezione della riga (oggi «Seleziona riga» di DataTable). */
function checkboxOf(anchor: Locator): Locator {
    return rowOf(anchor).getByRole("checkbox").first();
}

function actionsOf(anchor: Locator): Locator {
    return rowOf(anchor).getByRole("button", { name: /^Azioni/ }).first();
}

/**
 * Il gruppo di stato: il primo antenato del titolo che contiene anche delle
 * regole. `title` accetta il nome di oggi e quello di domani («In esecuzione»
 * → «Adesso»).
 */
function group(page: Page, title: RegExp): Locator {
    return main(page)
        .getByText(title)
        .first()
        .locator("xpath=ancestor::*[.//text()[contains(., ' e2e')]][1]");
}

const GROUP = {
    adesso: /^(In esecuzione|Adesso)$/,
    programmate: /^Programmate$/,
    bozze: /^Bozze$/,
    disabilitate: /^Disabilitate$/,
    scadute: /^Scadute$/
};

/** L'ultimo dialogo aperto: drawer (`dialog`) o conferma (`alertdialog`). */
function dialog(page: Page): Locator {
    return page.getByRole("dialog").or(page.getByRole("alertdialog")).last();
}

async function openList(page: Page, type = "all"): Promise<void> {
    await openBusinessPage(page, "scheduling", "Programmazione");
    await page.goto(`${new URL(page.url()).pathname}?type=${type}`);
    await expect(main(page).getByText(/ e2e$/).first()).toBeVisible({ timeout: 15_000 });
}

async function openRule(page: Page, key: keyof typeof RULE): Promise<void> {
    await openList(page);
    await rule(page, key).click();
    await expect(page).toHaveURL(new RegExp(`/scheduling/(featured/)?${RULE[key]}`));
    await expect(main(page).locator("form").first()).toBeVisible({ timeout: 15_000 });
}

/** Apre un gruppo chiuso (oggi la testata è un `role=button`; domani un chevron con `aria-expanded`). */
async function openGroup(page: Page, title: RegExp): Promise<void> {
    const name = new RegExp(title.source.replace(/^\^|\$$/g, ""));
    await main(page).getByRole("button", { name }).first().click();
}

/** Sceglie il tipo: tab o chip se a vista, altrimenti il picker della testata compatta. */
async function chooseType(page: Page, from: RegExp, to: RegExp): Promise<void> {
    const direct = page.getByRole("tab", { name: to }).or(main(page).getByRole("radio", { name: to }));
    if (await direct.first().isVisible()) {
        await direct.first().click();
        return;
    }
    await page.getByRole("button", { name: from }).first().click();
    await page.getByRole("menuitem", { name: to }).click();
}

async function searchFor(page: Page, text: string): Promise<void> {
    const box = page.getByRole("searchbox").or(page.getByRole("textbox", { name: /Cerca/ })).first();
    if (!(await box.isVisible())) await page.getByRole("button", { name: "Cerca", exact: true }).click();
    await box.fill(text);
}

/** «Simula regole» dal caret (testata comoda) o dal kebab (compatta): stesso nome. */
async function openSimulator(page: Page): Promise<Locator> {
    await page.getByRole("button", { name: "Altre azioni" }).first().click();
    await page.getByRole("menuitem", { name: /Simula/ }).click();
    const drawer = dialog(page);
    await expect(drawer.getByRole("heading", { name: /Simula/ })).toBeVisible();
    return drawer;
}

/**
 * Preme uno switch di sistema: l'input è coperto dalla sua `label`, che è la
 * cosa che si tocca davvero.
 */
async function press(toggle: Locator): Promise<void> {
    const id = await toggle.getAttribute("id");
    const label = id ? toggle.page().locator(`label[for="${id}"]`) : toggle;
    await label.click();
}

/**
 * Passa alla Settimana. La testata alterna la forma comoda (segmented) e la
 * compatta (icona) mentre si assesta: si clicca quella a vista.
 */
async function openWeek(page: Page): Promise<void> {
    const name = /Vista calendario|Settimana/;
    await page
        .getByRole("radio", { name })
        .or(page.getByRole("button", { name }))
        .filter({ visible: true })
        .first()
        .click();
}

function writesOf(stub: ProgrammazioneStub, key: string): WriteCall[] {
    return stub.writes.filter(w => w.key === key);
}

async function noHorizontalScroll(page: Page): Promise<void> {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("Programmazione — elenco", () => {
    let stub: ProgrammazioneStub;
    test.beforeEach(async ({ page }) => {
        stub = await stubProgrammazione(page);
    });

    test("le regole stanno nei cinque gruppi di stato, con «Tutte»", async ({ page }) => {
        await openList(page);
        const adesso = group(page, GROUP.adesso);
        // «Adesso» è la finestra, non la vittoria (§34.4): anche la regola in
        // finestra che perde, con «Sovrascritta da …».
        for (const key of ["carta", "pranzo", "spritz", "stagionali", "promoPorto", "promoCosta"] as const) {
            await expect(adesso).toContainText(RULE_NAME[key]);
        }
        await expect(rowOf(adesso.getByText(RULE_NAME.promoCosta, { exact: true }))).toContainText(/Sovrascritta da/);
        const programmate = group(page, GROUP.programmate);
        for (const key of ["aperitivo", "natale"] as const) {
            await expect(programmate).toContainText(RULE_NAME[key]);
        }
        await expect(programmate).not.toContainText(RULE_NAME.promoCosta);
        const bozze = group(page, GROUP.bozze);
        await expect(bozze).toContainText(RULE_NAME.bozza);
        await expect(bozze).toContainText(RULE_NAME.gruppoVuoto);
        // Disabilitate e Scadute sono chiuse: si aprono.
        await expect(main(page).getByText(RULE_NAME.spento)).toHaveCount(0);
        await openGroup(page, GROUP.disabilitate);
        await expect(group(page, GROUP.disabilitate)).toContainText(RULE_NAME.spento);
        await openGroup(page, GROUP.scadute);
        await expect(group(page, GROUP.scadute)).toContainText(RULE_NAME.saldi);
    });

    test("i segni della riga: sovrascritta, nessuna sede raggiunta, sedi escluse, bozza", async ({ page }) => {
        await openList(page);
        await expect(rowOf(rule(page, "promoCosta"))).toContainText(/Sovrascritta/);
        await expect(rowOf(rule(page, "gruppoVuoto"))).toContainText(/Nessuna sede raggiunta/);
        await expect(rowOf(rule(page, "carta"))).toContainText(/(Escluse|Non vale in) 1 sed/);
        await expect(rowOf(rule(page, "bozza"))).toContainText("Bozza");
        await expect(rowOf(rule(page, "pranzo"))).toContainText(/11:00.15:00/);
        // Il verbo del mockup, per tipo (P3-bis).
        await expect(rowOf(rule(page, "pranzo"))).toContainText("mostra Pranzo e2e · Lun–Ven · 11:00–15:00");
        await expect(rowOf(rule(page, "spritz"))).toContainText("cambia 3 prezzi");
        await expect(rowOf(rule(page, "stagionali"))).toContainText("nasconde 1 · non disponibile 1");
        await expect(rowOf(rule(page, "natale"))).toContainText("mostra 1 contenuto");
    });

    test("il filtro per tipo tiene solo quel tipo e va nell'indirizzo", async ({ page }) => {
        await openList(page);
        await chooseType(page, /^Tutte/, /^Prezzi/);
        await expect(page).toHaveURL(/type=price/);
        await expect(rule(page, "spritz")).toBeVisible();
        await expect(main(page).getByText(RULE_NAME.carta)).toHaveCount(0);
        await expect(main(page).getByText(RULE_NAME.promoPorto)).toHaveCount(0);
    });

    test("la ricerca filtra per nome; senza risultati lo dice", async ({ page }) => {
        await openList(page);
        await searchFor(page, "Porto");
        await expect(rule(page, "aperitivo")).toBeVisible();
        await expect(rule(page, "promoPorto")).toBeVisible();
        await expect(main(page).getByText(RULE_NAME.carta)).toHaveCount(0);
        await searchFor(page, "nessunaregolacosì");
        await expect(main(page).getByText(/Nessun(a regola trovata| risultato)/)).toBeVisible();
    });

    test("una regola si apre sulla sua rotta; in evidenza sulla sua", async ({ page }) => {
        await openList(page);
        await rule(page, "pranzo").click();
        await expect(page).toHaveURL(new RegExp(`/scheduling/${RULE.pranzo}`));
        await page.goBack();
        await rule(page, "promoPorto").click();
        await expect(page).toHaveURL(new RegExp(`/scheduling/featured/${RULE.promoPorto}`));
    });

    test("cablaggio: lo switch spegne la regola (schedules.PATCH enabled=false)", async ({ page }) => {
        stub.onWrite("schedules.PATCH", () => null);
        await openList(page);
        await press(page.getByRole("switch", { name: new RegExp(RULE_NAME.spritz) }));
        await expect.poll(() => writesOf(stub, "schedules.PATCH").length).toBe(1);
        const [call] = writesOf(stub, "schedules.PATCH");
        expect(call.params.get("id")).toBe(`eq.${RULE.spritz}`);
        expect(call.body).toEqual({ enabled: false });
    });

    test("una bozza non si accende: lo switch è spento e dice perché", async ({ page }) => {
        await openList(page);
        const toggle = page.getByRole("switch", { name: new RegExp(RULE_NAME.bozza) });
        await expect(toggle).toBeDisabled();
        await page.getByLabel("Completa la regola per attivarla.").first().hover();
        await expect(page.getByRole("tooltip").getByText("Completa la regola per attivarla.")).toBeVisible();
        expect(writesOf(stub, "schedules.PATCH")).toHaveLength(0);
    });

    test("il filtro per tipo dice quante regole ci sono", async ({ page }) => {
        await openList(page);
        // Tabs col contatore (F2): il nome della tab è «etichetta N».
        const filter = main(page).getByRole("tablist", { name: "Tipo di regola" });
        await expect(filter.getByRole("tab", { name: /^Tutte 12$/ })).toHaveAttribute("aria-selected", "true");
        await expect(filter.getByRole("tab", { name: /^Menù e stile 6$/ })).toBeVisible();
        await expect(filter.getByRole("tab", { name: /^Prezzi 2$/ })).toBeVisible();
        await searchFor(page, "Porto");
        await expect(filter.getByRole("tab", { name: /^Tutte 2$/ })).toBeVisible();
    });

    test("«Sovrascritta da» porta alla regola che vince", async ({ page }) => {
        await openList(page);
        await rowOf(rule(page, "promoCosta")).getByRole("link", { name: RULE_NAME.promoPorto }).click();
        await expect(page).toHaveURL(new RegExp(`/scheduling/featured/${RULE.promoPorto}`));
    });

    test("se il caricamento fallisce lo dice, e «Riprova» ricarica", async ({ page }) => {
        let failing = true;
        await page.route(/\/rest\/v1\/schedules(\?|$)/, route =>
            failing && route.request().method() === "GET"
                ? route.fulfill({ status: 500, json: { code: "E2E", message: "giù" } })
                : route.fallback()
        );
        await openBusinessPage(page, "scheduling", "Programmazione");
        await expect(main(page).getByText("Non riusciamo a caricare le regole.")).toBeVisible({ timeout: 15_000 });
        failing = false;
        await main(page).getByRole("button", { name: "Riprova" }).click();
        await expect(rule(page, "carta")).toBeVisible();
    });

    test("ricerca senza risultati: «Azzera filtri» rimette le regole", async ({ page }) => {
        await openList(page);
        await searchFor(page, "nessunaregolacosì");
        await expect(main(page).getByText(/Nessun(a regola trovata| risultato)/)).toBeVisible();
        await main(page).getByRole("button", { name: /Azzera/ }).click();
        await expect(rule(page, "carta")).toBeVisible();
    });

    test("cablaggio: elimina una regola dopo la conferma (schedules.DELETE)", async ({ page }) => {
        // Fino a P3 il clic su «Elimina» del menù ⋯ risaliva alla riga e apriva
        // il dettaglio (mucchio 2/10): la riga di DataTable ignora i clic dei
        // controlli, e la pagina resta sull'elenco.
        stub.onWrite("schedules.DELETE", () => null);
        await openList(page);
        await actionsOf(rule(page, "aperitivo")).click();
        await page.getByRole("menuitem", { name: "Elimina" }).click();
        const confirm = page.getByRole("alertdialog");
        await expect(confirm).toBeVisible();
        expect(writesOf(stub, "schedules.DELETE")).toHaveLength(0);
        await confirm.getByRole("button", { name: /^Elimina/ }).click({ timeout: 5_000 });
        await expect.poll(() => writesOf(stub, "schedules.DELETE").length).toBe(1);
        expect(writesOf(stub, "schedules.DELETE")[0].params.get("id")).toBe(`eq.${RULE.aperitivo}`);
        await expect(page).toHaveURL(/\/scheduling(\?|$)/);
    });

    test("cablaggio: eliminazione multipla (schedules.DELETE per ogni regola)", async ({ page }) => {
        stub.onWrite("schedules.DELETE", () => null);
        await openList(page);
        await checkboxOf(rule(page, "aperitivo")).check();
        await checkboxOf(rule(page, "natale")).check();
        await page.getByRole("toolbar", { name: "Azioni sulla selezione" }).getByRole("button", { name: /Elimina/ }).click();
        // P1: prima si conferma, e la conferma dice quali.
        const confirm = page.getByRole("alertdialog");
        await expect(confirm.getByRole("heading", { name: "Eliminare 2 regole?" })).toBeVisible();
        await expect(confirm).toContainText(RULE_NAME.aperitivo);
        await expect(confirm).toContainText(RULE_NAME.natale);
        expect(writesOf(stub, "schedules.DELETE")).toHaveLength(0);
        await confirm.getByRole("button", { name: "Elimina 2 regole" }).click();
        await expect.poll(() => writesOf(stub, "schedules.DELETE").length).toBe(2);
        const ids = writesOf(stub, "schedules.DELETE").map(w => w.params.get("id"));
        expect(ids.sort()).toEqual([`eq.${RULE.aperitivo}`, `eq.${RULE.natale}`].sort());
        await expect(page.getByText("2 regole eliminate.")).toBeVisible();
    });

    test("eliminazione multipla a metà: il messaggio dice quale regola resta", async ({ page }) => {
        stub.onWrite("schedules.DELETE", call =>
            call.params.get("id") === `eq.${RULE.natale}` ? new StubError(500) : null
        );
        await openList(page);
        await checkboxOf(rule(page, "aperitivo")).check();
        await checkboxOf(rule(page, "natale")).check();
        await page.getByRole("toolbar", { name: "Azioni sulla selezione" }).getByRole("button", { name: /Elimina/ }).click();
        await page.getByRole("alertdialog").getByRole("button", { name: "Elimina 2 regole" }).click();
        await expect(page.getByText(`1 regola non eliminata: ${RULE_NAME.natale}.`)).toBeVisible();
        await expect(checkboxOf(rule(page, "natale"))).toBeChecked();
    });

    test("cablaggio: «Nuova regola» crea la bozza e apre il dettaglio", async ({ page }) => {
        const NEW_ID = "e2e0d000-0000-4000-a000-000000000777";
        stub.onWrite("schedules.POST", () => ({ id: NEW_ID }));
        stub.onWrite("schedules.PATCH", () => null);
        await openList(page, "price");
        await page.getByRole("button", { name: /^Nuova regola/ }).first().click();
        await expect.poll(() => writesOf(stub, "schedules.POST").length).toBe(1);
        const body = writesOf(stub, "schedules.POST")[0].body as Record<string, unknown>;
        expect(body.rule_type).toBe("price");
        expect(body.enabled).toBe(false);
        await expect(page).toHaveURL(new RegExp(`/scheduling/${NEW_ID}`));
    });

    test("cablaggio: duplica (schedules.POST + copia dei prezzi)", async ({ page }) => {
        const COPY_ID = "e2e0d000-0000-4000-a000-000000000778";
        stub.onWrite("schedules.POST", () => ({ id: COPY_ID }));
        stub.onWrite("schedules.PATCH", () => null);
        stub.onWrite("schedule_targets.POST", () => null);
        stub.onWrite("schedule_price_overrides.POST", () => null);
        await openList(page);
        await actionsOf(rule(page, "spritz")).click();
        await page.getByRole("menuitem", { name: "Duplica" }).click();
        await expect.poll(() => writesOf(stub, "schedule_price_overrides.POST").length).toBe(1);
        const copied = writesOf(stub, "schedule_price_overrides.POST")[0].body as Array<Record<string, unknown>>;
        expect(copied.every(r => r.schedule_id === COPY_ID)).toBe(true);
        expect(copied).toHaveLength(3);
    });

    test("senza scrittura non si crea, non si spegne, non si seleziona", async ({ page }) => {
        await stub.revoke("scheduling.write");
        await openList(page);
        await stub.revoked;
        await expect(rule(page, "carta")).toBeVisible();
        await expect(page.getByRole("button", { name: /^Nuova regola/ })).toHaveCount(0);
        await expect(page.getByRole("switch")).toHaveCount(0);
        await expect(checkboxOf(rule(page, "carta"))).toHaveCount(0);
    });
});

test.describe("Programmazione — permesso di lettura", () => {
    let stub: ProgrammazioneStub;
    test.beforeEach(async ({ page }) => {
        stub = await stubProgrammazione(page);
    });

    // P3: il gate viene prima della fetch (CLAUDE.md, «skip fetch pre-check»).
    for (const target of ["elenco", "dettaglio"] as const) {
        test(`senza lettura, ${target}: pagina bloccata e nessuna richiesta di regole`, async ({ page }) => {
            await stub.revoke("scheduling.read");
            await openBusinessPage(page, "overview", "Panoramica");
            await stub.revoked;
            // Le letture delle regole di Programmazione (elenco, dettaglio,
            // resolver) chiedono sempre `time_mode`; il conteggio della
            // Panoramica (`getTenantSetupStatus`), che può partire tardi, no.
            const ruleReads: string[] = [];
            page.on("request", request => {
                const url = new URL(request.url());
                if (/\/rest\/v1\/schedules$/.test(url.pathname) && (url.searchParams.get("select") ?? "").includes("time_mode")) {
                    ruleReads.push(request.url());
                }
            });
            const path = target === "elenco" ? "scheduling" : `scheduling/${RULE.pranzo}`;
            await page.goto(page.url().replace(/overview.*$/, path));
            await expect(page.getByText("Non hai accesso a questa sezione")).toBeVisible({ timeout: 15_000 });
            expect(ruleReads).toEqual([]);
        });
    }
});

test.describe("Programmazione — settimana, simulatore, guida", () => {
    test.beforeEach(async ({ page }) => {
        await stubProgrammazione(page);
    });

    test("la Settimana si apre sulla settimana di oggi e si sfoglia", async ({ page }) => {
        await openList(page, "layout");
        await openWeek(page);
        await expect(main(page).getByText(/21 set/)).toBeVisible();
        // Una scheda per regola accesa, con la sua finestra (P1 del 2-bis):
        // la competizione, che vive per sede, non si risolve qui (mucchio 2/3).
        await expect(main(page).getByRole("button", { name: new RegExp(`${RULE_NAME.pranzo}.*11:00`) }).first()).toBeVisible();
        await main(page).getByRole("button", { name: /(Settimana|Giorno) successiv/ }).click();
        await expect(main(page).getByText(/28 set|25 set|Giovedì 24/)).toBeVisible();
    });

    test("sotto 768 la Settimana mostra un giorno alla volta", async ({ page }) => {
        await openList(page, "layout");
        await page.setViewportSize({ width: 375, height: 812 });
        await openWeek(page);
        await expect(main(page).getByText("Mercoledì 23 settembre")).toBeVisible();
        const days = main(page).getByRole("radiogroup", { name: "Giorno" });
        await expect(days.getByRole("radio")).toHaveCount(7);
        await expect(days.getByRole("radio", { name: /Mer 23/ })).toBeChecked();
        await expect(main(page).getByRole("button", { name: new RegExp(`${RULE_NAME.pranzo}.*11:00`) })).toHaveCount(1);
        await main(page).getByRole("button", { name: "Giorno successivo" }).click();
        await expect(main(page).getByText("Giovedì 24 settembre")).toBeVisible();
        await days.getByRole("radio", { name: /Dom 27/ }).click();
        await expect(main(page).getByText("Domenica 27 settembre")).toBeVisible();
        // Domenica il pranzo di Centro (lun–ven) non c'è.
        await expect(main(page).getByRole("button", { name: new RegExp(RULE_NAME.pranzo) })).toHaveCount(0);
        await main(page).getByRole("button", { name: "Giorno successivo" }).click();
        await expect(main(page).getByText("Lunedì 28 settembre")).toBeVisible();
        await main(page).getByRole("button", { name: "Oggi" }).click();
        await expect(main(page).getByText("Mercoledì 23 settembre")).toBeVisible();
        await noHorizontalScroll(page);
    });

    test("sopra 768 la Settimana mostra sette giorni", async ({ page }) => {
        await openList(page, "layout");
        await openWeek(page);
        for (const day of ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"]) {
            await expect(main(page).getByText(day, { exact: true })).toBeVisible();
        }
        await expect(main(page).getByRole("radiogroup", { name: "Giorno" })).toHaveCount(0);
    });

    test("il simulatore dice cosa vince in una sede; l'anteprima è spenta per la sede sospesa", async ({ page }) => {
        await openList(page);
        const drawer = await openSimulator(page);
        await drawer.getByRole("combobox", { name: /Sede/ }).selectOption({ label: "Centro e2e" });
        await expect(drawer.getByText(RULE_NAME.pranzo)).toBeVisible({ timeout: 15_000 });
        await expect(drawer.getByText(RULE_NAME.spritz)).toBeVisible();
        await expect(drawer.getByText(RULE_NAME.stagionali)).toBeVisible();
        await expect(drawer.getByRole("button", { name: /anteprima/ })).toBeEnabled();
        await drawer.getByRole("combobox", { name: /Sede/ }).selectOption({ label: "Lago e2e" });
        await expect(drawer.getByText(/Sede sospesa/)).toBeVisible();
        await expect(drawer.getByRole("button", { name: /anteprima/ })).toBeDisabled();
    });

    test("il simulatore è un drawer md; ogni tipo è una riga che apre la regola che vince", async ({ page }) => {
        await openList(page);
        const drawer = await openSimulator(page);
        const box = await drawer.boundingBox();
        expect(Math.round(box?.width ?? 0)).toBe(520);
        await expect(drawer.getByText("Scegli sede e momento.")).toBeVisible();
        await drawer.getByRole("combobox", { name: /Sede/ }).selectOption({ label: "Centro e2e" });
        // A Centro vincono menù, prezzi e disponibilità; in evidenza nessuna (le promo sono di Porto).
        for (const [layer, winner] of [[/e stile/, RULE_NAME.pranzo], [/Prezzi/, RULE_NAME.spritz], [/Disponibilità/, RULE_NAME.stagionali]]) {
            await expect(drawer.getByRole("link", { name: layer }).filter({ hasText: winner })).toBeVisible({ timeout: 15_000 });
        }
        await expect(drawer.getByText("In evidenza", { exact: true })).toBeVisible();
        await expect(drawer.getByText("Nessuna regola")).toBeVisible();
        await expect(drawer.getByRole("link", { name: /In evidenza/ })).toHaveCount(0);
        await drawer.getByRole("link", { name: new RegExp(RULE_NAME.pranzo) }).click();
        await expect(page).toHaveURL(new RegExp(`/scheduling/${RULE.pranzo}`));
        await expect(page.getByRole("heading", { name: /Simula/ })).toHaveCount(0);
    });

    test("il simulatore: l'andamento della giornata si apre dal chevron, una fascia per riga", async ({ page }) => {
        await openList(page);
        const drawer = await openSimulator(page);
        await drawer.getByRole("combobox", { name: /Sede/ }).selectOption({ label: "Centro e2e" });
        const toggle = drawer.getByRole("button", { name: "Mostra Andamento della giornata" });
        await expect(toggle).toHaveAttribute("aria-expanded", "false", { timeout: 15_000 });
        // L'andamento si calcola in memoria sulle regole della pagina (mucchio
        // 2/9): aprirlo non chiede niente al database.
        const reads: string[] = [];
        page.on("request", request => {
            if (request.url().includes("/rest/v1/")) reads.push(request.url());
        });
        await toggle.click();
        await expect(drawer.getByRole("button", { name: "Nascondi Andamento della giornata" })).toHaveAttribute("aria-expanded", "true");
        await expect(drawer.getByText(/^11:00–15:00$/)).toBeVisible();
        expect(reads).toEqual([]);
    });

    test("il simulatore: se il calcolo fallisce lo dice nel drawer, e «Riprova» ricalcola", async ({ page }) => {
        let fail = true;
        // Il resolver legge i gruppi della sede (`activity_id=eq.`): la pagina no.
        await page.route(/\/rest\/v1\/activity_group_members\?.*activity_id=eq\./, route =>
            fail ? route.fulfill({ status: 500, json: { code: "E2E", message: "rotto" } }) : route.fallback()
        );
        await openList(page);
        const drawer = await openSimulator(page);
        await drawer.getByRole("combobox", { name: /Sede/ }).selectOption({ label: "Centro e2e" });
        const banner = drawer.getByRole("alert").filter({ hasText: "Non riusciamo a simulare questo momento." });
        await expect(banner).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole("status").filter({ hasText: /simul/i })).toHaveCount(0);
        fail = false;
        await banner.getByRole("button", { name: "Riprova" }).click();
        await expect(drawer.getByRole("link", { name: new RegExp(RULE_NAME.pranzo) })).toBeVisible({ timeout: 15_000 });
    });

    test("la guida parla col dizionario: menù e stile, sopra e sotto il menù", async ({ page }) => {
        await openList(page, "layout");
        await main(page).getByRole("button", { name: /Come funzion/ }).first().click();
        const guide = page.getByRole("dialog");
        await expect(guide.getByRole("heading", { name: "Come funzionano le regole di menù e stile" })).toBeVisible();
        await expect(guide).not.toContainText(/layout|target/i);
        await guide.getByRole("button", { name: "Chiudi" }).last().click();
        await chooseType(page, /Menù e stile/, /In evidenza/);
        await main(page).getByRole("button", { name: /Come funzion/ }).first().click();
        await expect(page.getByRole("dialog")).toContainText("Sopra il menù");
        await expect(page.getByRole("dialog")).toContainText("Sotto il menù");
    });

    test("la guida di «Tutte» dice l'ordine in cui i tipi si sommano e cosa dice il pallino", async ({ page }) => {
        await openList(page, "all");
        await main(page).getByRole("button", { name: /Come funzion/ }).first().click();
        const guide = page.getByRole("dialog");
        await expect(guide.getByRole("heading", { name: "I tipi si sommano, in quest'ordine." })).toBeVisible();
        await expect(guide).toContainText("poi le modifiche fatte a mano nella sede, che vincono su tutto");
        await expect(guide).toContainText("Menù e stile");
        await expect(guide).toContainText(/Verde.*Ambra.*Grigio/s);
    });

    test("in tema scuro le cinque guide si leggono (contrasto del testo almeno 4,5:1)", async ({ page }) => {
        test.slow(); // cinque guide in fila
        await page.addInitScript(() => localStorage.setItem("theme", "dark"));
        await openList(page, "all");
        for (const type of ["layout", "featured", "price", "visibility", "all"]) {
            await page.goto(`${new URL(page.url()).pathname}?type=${type}`);
            await main(page).getByRole("button", { name: /Come funzion/ }).first().click();
            const guide = page.getByRole("dialog");
            await expect(guide.getByRole("heading", { name: /Come funziona/ })).toBeVisible();
            const worst = await guide.evaluate(root => {
                /** [r, g, b, alpha] di un colore calcolato; null se trasparente. */
                const rgba = (c: string): number[] | null => {
                    const m = c.match(/rgba?\(([^)]+)\)/);
                    if (m) {
                        const [r, g, b, a = "1"] = m[1].split(/[ ,/]+/).filter(Boolean);
                        return Number(a) === 0 ? null : [Number(r), Number(g), Number(b), Number(a)];
                    }
                    const s = c.match(/color\(srgb ([^)]+)\)/);
                    if (s) {
                        const [r, g, b, a = "1"] = s[1].split(/[ /]+/).filter(Boolean);
                        return Number(a) === 0 ? null : [...[r, g, b].map(v => Number(v) * 255), Number(a)];
                    }
                    return null;
                };
                /** Il fondo sotto `el`: i fondi trasparenti degli antenati, composti fino al primo pieno. */
                const backdrop = (el: HTMLElement): number[] => {
                    const layers: number[][] = [];
                    for (let a: HTMLElement | null = el; a; a = a.parentElement) {
                        const c = rgba(getComputedStyle(a).backgroundColor);
                        if (!c) continue;
                        layers.push(c);
                        if (c[3] >= 1) break;
                    }
                    let out = [255, 255, 255];
                    for (const [r, g, b, a] of layers.reverse()) out = [r, g, b].map((v, i) => v * a + out[i] * (1 - a));
                    return out;
                };
                const lum = ([r, g, b]: number[]) => {
                    const ch = (v: number) => {
                        const x = v / 255;
                        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
                    };
                    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
                };
                let min = 21;
                let where = "";
                for (const el of Array.from(root.querySelectorAll<HTMLElement>("h2, h3, p, span, li, figcaption, div, s"))) {
                    if (!Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent?.trim())) continue;
                    const fg = rgba(getComputedStyle(el).color);
                    if (!fg) continue;
                    const [l1, l2] = [lum(fg), lum(backdrop(el))].sort((x, y) => y - x);
                    const ratio = (l1 + 0.05) / (l2 + 0.05);
                    if (ratio < min) {
                        min = ratio;
                        where = el.textContent?.trim().slice(0, 40) ?? "";
                    }
                }
                return { min: Math.round(min * 100) / 100, where };
            });
            expect(worst.min, `${type}, testo meno leggibile: «${worst.where}»`).toBeGreaterThanOrEqual(4.5);
            await guide.getByRole("button", { name: "Chiudi" }).last().click();
        }
    });

    test("la guida si apre da «Come funziona» e porta al simulatore", async ({ page }) => {
        await openList(page, "layout");
        await main(page).getByRole("button", { name: /Come funzion/ }).first().click();
        const guide = page.getByRole("dialog");
        await expect(guide.getByRole("heading", { name: /Come funzionano/ })).toBeVisible();
        await guide.getByRole("button", { name: /Simula/ }).click();
        await expect(dialog(page).getByRole("heading", { name: /Simula/ })).toBeVisible();
    });
});

test.describe("Programmazione — dettaglio", () => {
    let stub: ProgrammazioneStub;
    test.beforeEach(async ({ page }) => {
        stub = await stubProgrammazione(page);
    });

    test("una regola che non esiste lo dice, e riporta a Programmazione", async ({ page }) => {
        await openList(page);
        await page.goto(page.url().replace(/scheduling.*$/, `scheduling/${MISSING_RULE}`));
        await expect(main(page).getByRole("heading", { name: "Regola non trovata" })).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByText("Forse è stata eliminata.")).toBeVisible();
        await main(page).getByRole("button", { name: "Torna a Programmazione" }).click();
        await expect(page).toHaveURL(/\/scheduling(\?|$)/);
    });

    test("se la regola non si carica lo dice, e «Riprova» la ricarica", async ({ page }) => {
        let fail = true;
        await openList(page);
        // Il dettaglio legge le regole dell'azienda (`time_mode` nel select), come l'elenco.
        await page.route(/\/rest\/v1\/schedules\?/, route =>
            fail && route.request().method() === "GET" && (new URL(route.request().url()).searchParams.get("select") ?? "").includes("time_mode")
                ? route.fulfill({ status: 500, json: { code: "E2E", message: "rotto" } })
                : route.fallback()
        );
        await page.goto(page.url().replace(/scheduling.*$/, `scheduling/${RULE.pranzo}`));
        const banner = main(page).getByRole("alert").filter({ hasText: "Non riusciamo a caricare la regola." });
        await expect(banner).toBeVisible({ timeout: 15_000 });
        fail = false;
        await banner.getByRole("button", { name: "Riprova" }).click();
        await expect(main(page).getByRole("textbox", { name: /Nome/ })).toHaveValue(RULE_NAME.pranzo, { timeout: 15_000 });
    });

    test("«Come funziona» nella testata del dettaglio apre la guida del tipo", async ({ page }) => {
        await openRule(page, "spritz");
        await main(page).getByRole("button", { name: "Come funzionano le regole di prezzo" }).click();
        const guide = page.getByRole("dialog");
        await expect(guide.getByRole("heading", { name: "Come funzionano le regole di prezzo" })).toBeVisible();
        // Nel dettaglio il simulatore non c'è: la guida non lo propone.
        await expect(guide.getByRole("button", { name: /Simula/ })).toHaveCount(0);
        await guide.getByRole("button", { name: "Chiudi" }).first().click();
        // L'uscita è animata: sotto carico ci mette più dei 5 s di default.
        await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });
    });

    test("le due rotte sono lo stesso dettaglio: tipo nel titolo, «Salva» e «Annulla» solo con modifiche", async ({ page }) => {
        for (const key of ["pranzo", "promoPorto"] as const) {
            await openRule(page, key);
            await expect(page.getByText(key === "pranzo" ? "Menù e stile" : "In evidenza", { exact: true }).first()).toBeVisible();
            await expect(page.getByRole("button", { name: "Salva", exact: true })).toHaveCount(0);
            await expect(page.getByRole("status").filter({ hasText: "Salvato" }).first()).toBeVisible();
            await main(page).getByRole("textbox", { name: /Nome/ }).fill(`${RULE_NAME[key]} bis`);
            await expect(page.getByRole("button", { name: "Salva", exact: true }).first()).toBeVisible();
            await page.getByRole("button", { name: "Annulla", exact: true }).first().click();
            await dialog(page).getByRole("button", { name: "Scarta" }).click();
            await expect(main(page).getByRole("textbox", { name: /Nome/ })).toHaveValue(RULE_NAME[key]);
        }
    });

    test("una regola in evidenza aperta dalla rotta generica va sulla sua", async ({ page }) => {
        await openList(page);
        await page.goto(page.url().replace(/scheduling.*$/, `scheduling/${RULE.promoPorto}`));
        await expect(page).toHaveURL(new RegExp(`/scheduling/featured/${RULE.promoPorto}`), { timeout: 15_000 });
        await expect(main(page).getByText("Serata jazz e2e")).toBeVisible();
    });

    test("uscire con modifiche non salvate chiede: «Resta» resta, «Esci senza salvare» esce", async ({ page }) => {
        await openRule(page, "aperitivo");
        await main(page).getByRole("textbox", { name: /Nome/ }).fill("Aperitivo lungo e2e");
        await page.getByRole("navigation", { name: "Menu principale" }).getByRole("link", { name: "Prodotti" }).click();
        const guard = dialog(page);
        await expect(guard.getByText(/modifiche non salvate/i).first()).toBeVisible();
        await guard.getByRole("button", { name: "Resta" }).click();
        await expect(page).toHaveURL(new RegExp(`/scheduling/${RULE.aperitivo}`));
        await expect(main(page).getByRole("textbox", { name: /Nome/ })).toHaveValue("Aperitivo lungo e2e");
        await page.getByRole("navigation", { name: "Menu principale" }).getByRole("link", { name: "Prodotti" }).click();
        await dialog(page).getByRole("button", { name: "Esci senza salvare" }).click();
        await expect(page).toHaveURL(/\/products/);
    });

    test("con modifiche «Duplica» è spenta e dice perché; la bozza non si accende e dice perché", async ({ page }) => {
        await openRule(page, "aperitivo");
        await main(page).getByRole("textbox", { name: /Nome/ }).fill("Aperitivo lungo e2e");
        await page.getByRole("button", { name: /Altre azioni sulla regola/ }).first().click();
        const duplica = page.getByRole("menuitem", { name: /Duplica/ });
        await expect(duplica).toBeDisabled();
        await expect(duplica).toContainText("Salva o annulla le modifiche per duplicarla.");
        await page.keyboard.press("Escape");

        await openRule(page, "bozza");
        const toggle = page.getByRole("switch", { name: new RegExp(`Attiva o disattiva ${RULE_NAME.bozza}`) }).first();
        await expect(toggle).toBeDisabled();
        await expect(page.getByLabel("Completa la regola per attivarla.").first()).toBeVisible();
        expect(writesOf(stub, "schedules.PATCH")).toHaveLength(0);
    });

    test("«Dove si applica» sui controlli di sistema: tre scelte, sedi a caselle, gruppi a chip", async ({ page }) => {
        stub.onWrite("schedules.PATCH", () => null);
        stub.onWrite("schedule_layout.PATCH", () => null);
        stub.onWrite("schedule_layout.POST", () => null);
        stub.onWrite("rpc.update_schedule_targets", () => null);
        await openRule(page, "pranzo");
        const where = main(page).getByRole("radiogroup", { name: "Si applica a" });
        await expect(where.getByRole("radio")).toHaveCount(3);
        await expect(where.getByRole("radio", { name: /Alcune sedi/ })).toBeChecked();
        const sedi = main(page).getByRole("group", { name: "Sedi disponibili" });
        await expect(sedi.getByRole("checkbox", { name: "Centro e2e" })).toBeChecked();
        await sedi.getByRole("checkbox", { name: "Porto e2e" }).check();

        await where.getByRole("radio", { name: /Gruppi di sedi/ }).check();
        const gruppi = main(page).getByRole("group", { name: "Gruppi di sedi" });
        await expect(gruppi.getByRole("checkbox")).not.toHaveCount(0);
        await where.getByRole("radio", { name: /Alcune sedi/ }).check();
        await sedi.getByRole("checkbox", { name: "Centro e2e" }).check();
        await sedi.getByRole("checkbox", { name: "Porto e2e" }).check();

        await page.getByRole("button", { name: "Salva", exact: true }).first().click();
        await expect.poll(() => writesOf(stub, "rpc.update_schedule_targets").length).toBe(1);
        const body = JSON.stringify(writesOf(stub, "rpc.update_schedule_targets")[0].body);
        expect(body).toContain(SEDE.centro);
        expect(body).toContain(SEDE.porto);
    });

    test("«Quando» sui controlli di sistema: interruttori con nome, giorni a chip", async ({ page }) => {
        await openRule(page, "pranzo");
        await expect(main(page).getByRole("switch", { name: "Sempre attiva" })).not.toBeChecked();
        await expect(main(page).getByRole("switch", { name: "In certi giorni" })).toBeChecked();
        const days = main(page).getByRole("group", { name: "Giorni della settimana" });
        await expect(days.getByRole("checkbox")).toHaveCount(7);
        await expect(days.getByRole("checkbox", { name: "Lun" })).toHaveAttribute("aria-checked", "true");
        await expect(days.getByRole("checkbox", { name: "Dom" })).toHaveAttribute("aria-checked", "false");
    });

    test("prezzi: una tabella con prezzo e listino barrato, i prodotti dal drawer condiviso", async ({ page }) => {
        stub.onWrite("schedules.PATCH", () => null);
        stub.onWrite("schedule_price_overrides.DELETE", () => null);
        stub.onWrite("schedule_price_overrides.POST", () => null);
        stub.onWrite("rpc.update_schedule_targets", () => null);
        await openRule(page, "spritz");
        // Una riga per prezzo: Margherita, e Spritz per formato.
        await expect(main(page).getByRole("textbox", { name: "Prezzo di Margherita e2e" })).toHaveValue("6.5");
        await expect(main(page).getByRole("textbox", { name: "Prezzo di Spritz e2e, Piccolo" })).toHaveValue("4");
        await expect(main(page).getByRole("switch", { name: "Listino barrato per Spritz e2e, Piccolo" })).toBeChecked();
        await expect(main(page).getByRole("switch", { name: "Listino barrato per Margherita e2e" })).not.toBeChecked();
        // Niente muro di pill: i prodotti si aggiungono dal drawer, come la disponibilità.
        await main(page).getByRole("button", { name: "Aggiungi prodotti" }).click();
        const drawer = dialog(page);
        await expect(drawer.getByRole("heading", { name: "Aggiungi prodotti" })).toBeVisible();
        await drawer
            .getByText("Birra e2e", { exact: true })
            .locator("xpath=ancestor::*[.//*[@role='checkbox' or @type='checkbox']][1]")
            .getByRole("checkbox")
            .first()
            .click();
        await drawer.getByRole("button", { name: "Applica" }).click();
        const birra = main(page).getByRole("textbox", { name: "Prezzo di Birra e2e" });
        await expect(birra).toHaveValue("");
        await birra.fill("3,50");
        await page.getByRole("button", { name: "Salva", exact: true }).first().click();
        await expect.poll(() => writesOf(stub, "schedule_price_overrides.POST").length).toBe(1);
        const rows = writesOf(stub, "schedule_price_overrides.POST")[0].body as Array<Record<string, unknown>>;
        expect(rows).toHaveLength(4);
        expect(rows.some(r => r.override_price === 3.5)).toBe(true);
    });

    test("disponibilità: «Comportamento» è larga quanto il controllo, a 1280, 768 e 375", async ({ page }) => {
        await openRule(page, "stagionali");
        for (const width of [1280, 768, 375]) {
            await page.setViewportSize({ width, height: 900 });
            const control = main(page).getByRole("radiogroup").filter({ has: page.getByRole("radio", { name: /Non disponibile/ }) }).first();
            await expect(control).toBeVisible();
            // Prima, a 180 px, «Non disponibile» usciva dalla cella tagliato.
            const fits = await control.evaluate(el => {
                const cell = el.closest("[role='cell'], td") ?? el.parentElement!;
                const box = el.getBoundingClientRect();
                const cellBox = cell.getBoundingClientRect();
                return el.scrollWidth <= el.clientWidth + 1 && box.right <= cellBox.right + 1 && box.left >= cellBox.left - 1;
            });
            expect(fits, `a ${width}`).toBe(true);
        }
    });

    test("in evidenza: i contenuti si aggiungono da una Select di sistema, per posizione", async ({ page }) => {
        await openRule(page, "promoPorto");
        const before = main(page).getByRole("combobox", { name: "Aggiungi un contenuto sopra il menù" });
        await expect(before).toBeVisible();
        // Le voci sono i contenuti non ancora usati dalla regola: Natale.
        await expect(before.getByRole("option", { name: "Luci di Natale e2e" })).toHaveCount(1);
        await expect(before.getByRole("option", { name: "Promo autunno e2e" })).toHaveCount(0);
        await before.selectOption({ label: "Luci di Natale e2e" });
        await expect(main(page).getByText("Luci di Natale e2e", { exact: true })).toBeVisible();
        // Aggiunto, il contenuto esce dalle scelte e la Select torna vuota.
        await expect(before).toHaveValue("");
        await expect(before).toBeDisabled();
    });

    test("cablaggio: salvare una regola in evidenza (schedules.PATCH + contenuti riscritti)", async ({ page }) => {
        stub.onWrite("schedules.PATCH", () => null);
        stub.onWrite("schedule_featured_contents.DELETE", () => null);
        stub.onWrite("schedule_featured_contents.POST", () => null);
        stub.onWrite("rpc.update_schedule_targets", () => null);
        await openRule(page, "promoPorto");
        await main(page).getByRole("textbox", { name: /Nome/ }).fill("Promo Porto lunga e2e");
        await page.getByRole("button", { name: "Salva", exact: true }).first().click();
        await expect
            .poll(() => writesOf(stub, "schedules.PATCH").some(w => (w.body as Record<string, unknown>).name === "Promo Porto lunga e2e"))
            .toBe(true);
        await expect.poll(() => writesOf(stub, "schedule_featured_contents.POST").length).toBe(1);
        await expect(page).toHaveURL(/\/scheduling\?type=featured/);
    });

    test("il dettaglio mostra dove, cosa e quando per ogni tipo", async ({ page }) => {
        await openRule(page, "pranzo");
        await expect(main(page).getByRole("textbox", { name: /Nome/ })).toHaveValue(RULE_NAME.pranzo);
        await expect(main(page).getByRole("combobox", { name: /Catalogo|Menù/ })).toHaveValue(/./);
        await expect(main(page).getByText("Centro e2e").first()).toBeVisible();

        await page.goto(page.url().replace(RULE.pranzo, RULE.stagionali));
        await expect(main(page).getByText("Tiramisù e2e")).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByText("Birra e2e")).toBeVisible();

        await page.goto(page.url().replace(`scheduling/${RULE.stagionali}`, `scheduling/featured/${RULE.promoPorto}`));
        await expect(main(page).getByText("Promo autunno e2e")).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByText("Serata jazz e2e")).toBeVisible();
    });

    test("cablaggio: rinominare e salvare (schedules.PATCH col nome nuovo)", async ({ page }) => {
        stub.onWrite("schedules.PATCH", () => null);
        stub.onWrite("schedule_layout.PATCH", () => null);
        stub.onWrite("schedule_layout.POST", () => null);
        stub.onWrite("rpc.update_schedule_targets", () => null);
        await openRule(page, "aperitivo");
        const name = main(page).getByRole("textbox", { name: /Nome/ });
        await name.fill("Aperitivo lungo e2e");
        await page.getByRole("button", { name: /^Salva( regola)?$/ }).first().click();
        await expect
            .poll(() => writesOf(stub, "schedules.PATCH").some(w => (w.body as Record<string, unknown>).name === "Aperitivo lungo e2e"))
            .toBe(true);
        await expect.poll(() => writesOf(stub, "rpc.update_schedule_targets").length).toBe(1);
        const targets = writesOf(stub, "rpc.update_schedule_targets");
        expect(JSON.stringify(targets[0].body)).toContain(SEDE.porto);
        await expect(page).toHaveURL(/\/scheduling\?type=layout/);
    });

    /** L'errore sta sul campo, una volta sola nella pagina: niente toast. */
    async function fieldError(page: Page, field: Locator, message: string): Promise<void> {
        await expect(field).toHaveAttribute("aria-invalid", "true");
        await expect(main(page).getByText(message)).toBeVisible();
        await expect(page.getByText(message)).toHaveCount(1);
    }

    async function periodOn(page: Page): Promise<void> {
        const periodSwitch = main(page)
            .getByText(/^In un periodo$/)
            .locator("xpath=ancestor::*[.//*[@role='switch']][1]")
            .getByRole("switch")
            .first();
        await press(periodSwitch);
    }

    test("una fine prima dell'inizio non si salva: l'errore è sul campo, in italiano", async ({ page }) => {
        await openRule(page, "aperitivo");
        await periodOn(page);
        await main(page).getByLabel(/Data (di )?inizio/).fill("2026-10-10");
        const end = main(page).getByLabel(/Data (di )?fine/);
        await end.fill("2026-10-01");
        // Il form non passa dalla validazione del browser (il suo fumetto per
        // il `min` della fine è in inglese): i messaggi sono i nostri.
        expect(await main(page).locator("form").first().evaluate(f => (f as HTMLFormElement).noValidate)).toBe(true);
        await page.getByRole("button", { name: "Salva", exact: true }).first().click();
        await fieldError(page, end, "La fine viene prima dell'inizio.");
        expect(writesOf(stub, "schedules.PATCH")).toHaveLength(0);
        // L'errore segue il campo: corretta la data, sparisce.
        await end.fill("2026-10-20");
        await expect(end).not.toHaveAttribute("aria-invalid", "true");
        await expect(main(page).getByText("La fine viene prima dell'inizio.")).toHaveCount(0);
    });

    test("il nome vuoto non si salva: «Scrivi un nome.» sul campo", async ({ page }) => {
        await openRule(page, "aperitivo");
        const name = main(page).getByRole("textbox", { name: /Nome/ });
        await name.fill("");
        await page.getByRole("button", { name: "Salva", exact: true }).first().click();
        await fieldError(page, name, "Scrivi un nome.");
        await expect(name).toBeFocused();
        expect(writesOf(stub, "schedules.PATCH")).toHaveLength(0);
    });

    test("un'ora sola: «Manca l'ora di fine.» sul campo; una finestra vuota lo dice su «Quando»", async ({ page }) => {
        await openRule(page, "aperitivo");
        const to = main(page).getByLabel(/Ora di fine/);
        await to.fill("");
        await page.getByRole("button", { name: "Salva", exact: true }).first().click();
        await fieldError(page, to, "Manca l'ora di fine.");

        const hoursSwitch = main(page)
            .getByText(/^In certe ore$/)
            .locator("xpath=ancestor::*[.//*[@role='switch']][1]")
            .getByRole("switch")
            .first();
        await press(hoursSwitch);
        const when = "Scegli un periodo, delle ore o dei giorni, oppure accendi «Sempre attiva».";
        await expect(main(page).getByText(when)).toBeVisible();
        await expect(page.getByText(when)).toHaveCount(1);
        expect(writesOf(stub, "schedules.PATCH")).toHaveLength(0);
    });

    test("«In certi giorni» acceso senza giorni non si salva: lo dice su «Quando»", async ({ page }) => {
        await openRule(page, "pranzo");
        const days = main(page).getByRole("group", { name: "Giorni della settimana" });
        for (const day of ["Lun", "Mar", "Mer", "Gio", "Ven"]) {
            await days.getByRole("checkbox", { name: day }).click();
        }
        await expect(main(page).getByRole("switch", { name: "In certi giorni" })).toBeChecked();
        await page.getByRole("button", { name: "Salva", exact: true }).first().click();
        await expect(main(page).getByText("Scegli almeno un giorno, oppure spegni «In certi giorni».")).toBeVisible();
        expect(writesOf(stub, "schedules.PATCH")).toHaveLength(0);
    });
});

// F5: il filtro per tipo sta nella testata, nello slot delle tab. A 1024 e
// 1280 con la sidebar aperta non sta in riga con le azioni: due righe, azioni
// sopra e tab sotto, mai la barra compatta. La prima tab è sul filo del
// contenuto sotto.
for (const width of [1024, 1280]) {
    test(`a ${width} le tab del tipo stanno nella testata, sotto le azioni`, async ({ page }) => {
        await stubProgrammazione(page);
        await openList(page);
        await page.setViewportSize({ width, height: 900 });
        const tabs = main(page).getByRole("tablist", { name: "Tipo di regola" });
        await expect(tabs.getByRole("tab", { name: /^Tutte 12$/ })).toBeVisible();
        const create = main(page).getByRole("button", { name: "Nuova regola" });
        await expect(create).toBeVisible();
        const tabsBox = (await tabs.boundingBox())!;
        const createBox = (await create.boundingBox())!;
        expect(tabsBox.y).toBeGreaterThanOrEqual(createBox.y + createBox.height);
        const description = main(page).getByText("Tutte le regole, di ogni tipo.");
        expect(tabsBox.y).toBeLessThan((await description.boundingBox())!.y);
        const firstLabel = tabs.getByRole("tab").first().getByText("Tutte");
        expect(Math.round((await firstLabel.boundingBox())!.x)).toBe(Math.round((await description.boundingBox())!.x));
    });
}

for (const width of [375, 768, 1280]) {
    test.describe(`Programmazione a ${width}`, () => {
        test.beforeEach(async ({ page }) => {
            await stubProgrammazione(page);
        });

        // Si entra a 1280 (sotto 768 la sidebar è un cassetto) e si stringe
        // la finestra sulla pagina, come in Menù e Comande.
        if (width >= 768) {
            test("«Dove si applica» non va a capo: la colonna è larga quanto il contenuto", async ({ page }) => {
                await openList(page);
                await page.setViewportSize({ width, height: 900 });
                const label = main(page).getByText("Gruppo vuoto e2e", { exact: true }).first();
                await expect(label).toBeVisible();
                const box = await label.boundingBox();
                // Una riga di body-sm (21 px), non due.
                expect(box!.height).toBeLessThan(24);
                expect(await label.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
            });
        }

        test("elenco, settimana e dettaglio senza scroll di lato", async ({ page }) => {
            await openList(page);
            await page.setViewportSize({ width, height: 900 });
            await noHorizontalScroll(page);
            await openWeek(page);
            await expect(main(page).getByText(/set/).first()).toBeVisible();
            await noHorizontalScroll(page);
            await page.goto(page.url().replace(/scheduling.*$/, `scheduling/${RULE.spritz}`));
            await expect(main(page).locator("form").first()).toBeVisible({ timeout: 15_000 });
            await noHorizontalScroll(page);
        });
    });
}

// Banda del momento e matrice sedi × strati (§20, decisioni §50.7). Scritti
// prima della banda: `test.fail` finché la pagina non li rende veri (P10).
test.describe("Programmazione — banda e matrice", () => {
    test.beforeEach(async ({ page }) => {
        await stubProgrammazione(page, { matrix: true });
    });

    /** La banda del momento: la regione col cursore dell'ora. */
    function band(page: Page): Locator {
        return main(page).getByRole("region", { name: "Il momento" });
    }

    /** La matrice (sopra 768): la tabella «Cosa vede ogni sede». */
    function matrix(page: Page): Locator {
        return main(page).getByRole("table", { name: "Cosa vede ogni sede" });
    }

    function seatRow(page: Page, name: string): Locator {
        return matrix(page).getByRole("row").filter({ has: page.getByRole("link", { name, exact: true }) });
    }

    test("la banda dice quante sedi mostrano un menù adesso, e chi ha modifiche a mano", async ({ page }) => {
        await openList(page);
        await expect(band(page)).toContainText("Oggi alle 12:00");
        await expect(band(page)).toContainText("2 sedi su 3 stanno mostrando un menù");
        await expect(band(page)).toContainText("1 ha modifiche a mano in corso, che vincono sulle regole.");
        await expect(band(page).getByRole("slider", { name: "Ora" })).toBeVisible();
    });

    test("la matrice: una riga per sede, cinque strati, chi vince e perché una cella è vuota", async ({ page }) => {
        await openList(page);
        for (const name of ["Sede", "Menù", "Disponibilità", "Prezzi", "In evidenza", "A mano"]) {
            await expect(matrix(page).getByRole("columnheader", { name, exact: true })).toBeVisible();
        }
        const centro = seatRow(page, "Centro e2e");
        for (const text of ["Pranzo e2e", RULE_NAME.pranzo, RULE_NAME.stagionali, RULE_NAME.spritz, "1 regola, fuori fascia adesso", "3 modifiche", "hanno l'ultima parola"]) {
            await expect(centro).toContainText(text);
        }
        const porto = seatRow(page, "Porto e2e");
        for (const text of ["Carta e2e", RULE_NAME.carta, "1 bozza, non attiva", RULE_NAME.promoPorto, "nessuna"]) {
            await expect(porto).toContainText(text);
        }
        const lago = seatRow(page, "Lago e2e");
        await expect(lago).toContainText("Sospesa");
        await expect(lago).toContainText("1 regola scaduta");
        // La bozza in più sta anche nell'elenco, fra le Bozze.
        await expect(main(page).getByText(MATRIX_RULE_NAME.bozzaPorto).first()).toBeVisible();
    });

    test("il cursore sposta banda e matrice, non l'elenco; «Torna ad adesso» rimette l'ora", async ({ page }) => {
        await openList(page);
        await band(page).getByRole("slider", { name: "Ora" }).fill(String(19 * 60), { timeout: 10_000 });
        await expect(band(page)).toContainText("Oggi alle 19:00");
        await expect(seatRow(page, "Porto e2e")).toContainText(RULE_NAME.aperitivo);
        await expect(seatRow(page, "Centro e2e")).not.toContainText(RULE_NAME.pranzo);
        // L'elenco resta ad adesso: «Pranzo Centro» è ancora in «Adesso».
        await expect(group(page, GROUP.adesso)).toContainText(RULE_NAME.pranzo);
        await band(page).getByRole("button", { name: "Torna ad adesso" }).click();
        await expect(band(page)).toContainText("Oggi alle 12:00");
        await expect(band(page).getByRole("button", { name: "Torna ad adesso" })).toHaveCount(0);
        await expect(seatRow(page, "Centro e2e")).toContainText(RULE_NAME.pranzo);
    });

    test("il nome della sede porta alla sua pagina, la regola che vince al suo dettaglio", async ({ page }) => {
        await openList(page);
        await seatRow(page, "Porto e2e").getByRole("link", { name: RULE_NAME.promoPorto }).click({ timeout: 10_000 });
        await expect(page).toHaveURL(new RegExp(`/scheduling/featured/${RULE.promoPorto}`));
        await page.goBack();
        await seatRow(page, "Centro e2e").getByRole("link", { name: "Centro e2e", exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`/locations/${SEDE.centro}/disponibilita`));
    });

    test("sotto la matrice la nota dice che le colonne sono passaggi in fila", async ({ page }) => {
        await openList(page);
        await expect(main(page).getByText(/Le colonne non sono elenchi paralleli: sono i passaggi in fila/)).toBeVisible();
        await expect(main(page).getByText(/«A mano» non è una regola/)).toBeVisible();
    });

    test("le tab del tipo filtrano l'elenco, non la matrice", async ({ page }) => {
        await openList(page, "price");
        await expect(matrix(page).getByRole("columnheader")).toHaveCount(6);
        await expect(seatRow(page, "Centro e2e")).toContainText(RULE_NAME.pranzo);
    });

    test("nella Settimana non c'è la banda", async ({ page }) => {
        await openList(page);
        await expect(band(page)).toBeVisible();
        await openWeek(page);
        await expect(main(page).getByText(/set/).first()).toBeVisible();
        await expect(band(page)).toHaveCount(0);
        await expect(matrix(page)).toHaveCount(0);
    });

    test("col filtro sede la matrice ha una riga e la banda parla al singolare", async ({ page }) => {
        await page.addInitScript(
            ([key, value]) => window.sessionStorage.setItem(key, value),
            [`cataloglobe:sedeScope:${TENANT_ID}`, SEDE.centro] as const
        );
        await openList(page);
        await expect(band(page)).toContainText("Centro e2e sta mostrando Pranzo e2e");
        await expect(band(page)).toContainText("Ha modifiche a mano in corso, che vincono sulle regole.");
        await expect(matrix(page).getByRole("row")).toHaveCount(2);
    });

    test("abbonamento non attivo: la banda dice che nessuna sede mostra un menù", async ({ page }) => {
        await page.route(/\/rest\/v1\/user_tenants_view/, async route => {
            const response = await route.fetch();
            const rows = (await response.json()) as Array<Record<string, unknown>>;
            for (const row of rows) if (row.id === TENANT_ID) row.subscription_status = "suspended";
            await route.fulfill({ response, json: rows });
        });
        await openList(page);
        await expect(band(page)).toContainText("Nessuna sede mostra un menù: l'abbonamento non è attivo.");
    });

    test("la banda si aggancia in alto e diventa compatta: ora, esito, cursore", async ({ page }) => {
        await openList(page);
        await page.setViewportSize({ width: 1280, height: 700 });
        await expect(band(page)).toContainText("Sposta l'ora");
        await band(page).evaluate(el => {
            let node = el.parentElement;
            while (node && getComputedStyle(node).overflowY !== "auto") node = node.parentElement;
            node?.scrollBy(0, 900);
        });
        const top = await band(page).evaluate(el => {
            let node = el.parentElement;
            while (node && getComputedStyle(node).overflowY !== "auto") node = node.parentElement;
            return el.getBoundingClientRect().top - (node?.getBoundingClientRect().top ?? 0);
        });
        expect(Math.abs(top)).toBeLessThan(2);
        await expect(band(page).getByText("Sposta l'ora", { exact: false })).toBeHidden();
        await expect(band(page)).toContainText("Oggi alle 12:00");
        await expect(band(page).getByRole("slider", { name: "Ora" })).toBeVisible();
    });

    test("sotto 768 un blocco per sede, gli strati su due colonne, senza scroll di lato", async ({ page }) => {
        await openList(page);
        await page.setViewportSize({ width: 375, height: 800 });
        const blocks = main(page).getByRole("list", { name: "Cosa vede ogni sede" });
        const centro = blocks.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Centro e2e", exact: true }) });
        await expect(centro).toContainText("Disponibilità");
        await expect(centro).toContainText(RULE_NAME.stagionali);
        await expect(blocks.getByRole("listitem")).toHaveCount(3);
        await expect(matrix(page)).toBeHidden();
        await noHorizontalScroll(page);
    });
});
