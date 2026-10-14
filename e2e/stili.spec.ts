import { expect, test, type Locator, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";
import { RULE, STYLE, stubStili, type StiliStub, type WriteCall } from "./stiliStub";
import type { Row } from "./restStub";

/**
 * Stili (lotto `ds-5-stili-storie-evidenza`, P0). Scritto sulla pagina di
 * **oggi**, prima di ricomporla: deve restare verde passo dopo passo.
 *
 * Dati finti in `stiliStub.ts`; permessi, azienda e sidebar veri. Nessuna
 * scrittura parte: ogni gesto che scrive ha un test di cablaggio che controlla
 * tabella, filtri e corpo. Dove un nome o un controllo cambierà nei passi
 * successivi il locator accetta quello di oggi e quello di domani.
 */

function main(page: Page) {
    return page.getByRole("main");
}

function dialog(page: Page): Locator {
    return page.getByRole("dialog").or(page.getByRole("alertdialog")).last();
}

function write(stub: StiliStub, key: string): WriteCall | undefined {
    return stub.writes.find(w => w.key === key);
}

/** Il nome dello stile, in griglia o in lista. */
function styleName(page: Page, name: string): Locator {
    return main(page).getByText(name, { exact: true }).first();
}

/** Il «⋯» della card o della riga che contiene `anchor`. */
function actionsOf(anchor: Locator): Locator {
    return anchor
        .locator("xpath=ancestor::*[.//button[starts-with(@aria-label,'Azioni')]][1]")
        .getByRole("button", { name: /^Azioni/ })
        .first();
}

async function setView(page: Page, view: "list" | "grid"): Promise<void> {
    await page.addInitScript(v => localStorage.setItem("cataloglobe-styles-view-mode", v), view);
}

async function openList(page: Page, view: "list" | "grid" = "grid"): Promise<void> {
    await setView(page, view);
    await openBusinessPage(page, "styles", "Stili");
    await expect(styleName(page, "Estate e2e")).toBeVisible({ timeout: 15_000 });
}

async function openStyle(page: Page, id: string): Promise<void> {
    if (!/\/business\/[0-9a-f-]+\//.test(page.url())) await openBusinessPage(page, "styles", "Stili");
    await page.goto(page.url().replace(/\/business\/([0-9a-f-]+)\/.*$/, `/business/$1/styles/${id}`));
}

async function search(page: Page, text: string): Promise<void> {
    const field = page.getByPlaceholder(/^Cerca/).first();
    if (!(await field.isVisible().catch(() => false))) {
        await page.getByRole("button", { name: "Cerca", exact: true }).click();
    }
    await field.fill(text);
}

/**
 * Le scritture di creazione e salvataggio: POST dello stile, POST della
 * versione, PATCH del puntatore. Tengono aggiornate le tabelle finte, così la
 * pagina che rilegge trova quello che ha scritto.
 */
function wireStyleWrites(stub: StiliStub): void {
    let n = 900;
    stub.onWrite("styles.POST", call => {
        n += 1;
        const body = call.body as Row;
        const row: Row = {
            id: `e2e5e000-0000-4000-a000-${String(n).padStart(12, "0")}`,
            tenant_id: body.tenant_id,
            name: body.name,
            is_system: false,
            is_active: true,
            current_version_id: null,
            created_at: "2026-03-21T10:00:00.000Z",
            updated_at: "2026-03-21T10:00:00.000Z"
        };
        stub.tables.styles.push(row);
        return row;
    });
    stub.onWrite("style_versions.POST", call => {
        n += 1;
        const body = call.body as Row;
        const row: Row = { id: `e2e5e000-0000-4000-a000-${String(n).padStart(12, "0")}`, created_at: "2026-03-21T10:00:00.000Z", ...body };
        stub.tables.style_versions.push(row);
        return row;
    });
    stub.onWrite("styles.PATCH", call => {
        const id = (call.params.get("id") ?? "").replace(/^eq\./, "");
        const row = stub.tables.styles.find(s => s.id === id);
        if (!row) return null;
        Object.assign(row, call.body as Row);
        return { ...row, current_version: stub.tables.style_versions.find(v => v.id === row.current_version_id) ?? null };
    });
}

let stub: StiliStub;

test.beforeEach(async ({ page }) => {
    stub = await stubStili(page);
});

test.describe("Stili — elenco", () => {
    test("griglia: stili, prima gli attivi adesso e poi per nome, uso nelle regole", async ({ page }) => {
        await openList(page);
        await expect(page).toHaveTitle(/^Stili · .+ · CataloGlobe$/);
        await expect(styleName(page, "Stile base e2e")).toBeVisible();
        await expect(styleName(page, "Sera e2e")).toBeVisible();
        await expect(styleName(page, "Notte e2e")).toBeVisible();
        await expect(main(page).getByText("Usato in 1 regola").first()).toBeVisible();
        await expect(main(page).getByText("In nessuna regola").first()).toBeVisible();
        await expect(page.getByRole("button", { name: "Crea stile" }).first()).toBeVisible();
        // ST2: prima gli attivi adesso (Estate), poi per nome.
        await expect(itemOf(page, "Estate e2e")).toContainText("Attivo adesso");
        const order = await main(page).getByText(/^(Stile base|Estate|Sera|Notte) e2e$/).allTextContents();
        expect(order).toEqual(["Estate e2e", "Notte e2e", "Sera e2e", "Stile base e2e"]);
    });

    test("lista: versione e uso, la riga apre il tunnel di modifica", async ({ page }) => {
        await openList(page, "list");
        await expect(main(page).getByText("Versione 3")).toBeVisible();
        await styleName(page, "Sera e2e").click();
        await expect(page).toHaveURL(new RegExp(`/crea/stile/${STYLE.sera}\\?da=stili$`));
    });

    test("griglia/lista si ricorda la scelta", async ({ page }) => {
        await openList(page, "list");
        await expect(page.getByRole("radio", { name: "Vista lista" })).toHaveAttribute("aria-checked", "true");
        await page.getByRole("radio", { name: "Vista griglia" }).click();
        expect(await page.evaluate(() => localStorage.getItem("cataloglobe-styles-view-mode"))).toBe("grid");
    });

    test("ricerca", async ({ page }) => {
        await openList(page);
        await search(page, "sera");
        await expect(styleName(page, "Sera e2e")).toBeVisible();
        await expect(styleName(page, "Estate e2e")).toHaveCount(0);
    });

    // D124: si crea nel tunnel; i salvataggi li prova `crea.spec.ts`.
    test("«Crea stile» apre il tunnel di creazione", async ({ page }) => {
        await openList(page);
        await page.getByRole("button", { name: "Crea stile" }).first().click();
        await expect(page).toHaveURL(/\/crea\/stile\?da=stili$/);
        await expect(page).toHaveTitle(/Nuovo stile/);
    });

    test("duplica dal «⋯»", async ({ page }) => {
        wireStyleWrites(stub);
        await openList(page);
        await actionsOf(styleName(page, "Sera e2e")).click();
        await page.getByRole("menuitem", { name: "Duplica" }).click();
        await expect.poll(() => (write(stub, "styles.POST")?.body as Row | undefined)?.name).toMatch(/Copia.*Sera e2e|Sera e2e.*Copia/);
        const version = write(stub, "style_versions.POST")?.body as Row;
        expect(version.config).toMatchObject({ colors: { primary: "#0ea5e9" } });
    });

    test("lo stile di sistema non si elimina", async ({ page }) => {
        await openList(page);
        await actionsOf(styleName(page, "Stile base e2e")).click();
        await expect(page.getByRole("menuitem", { name: "Duplica" })).toBeVisible();
        await expect(page.getByRole("menuitem", { name: "Elimina" })).toHaveCount(0);
    });

    test("elimina uno stile che non veste niente", async ({ page }) => {
        stub.onWrite("styles.DELETE", () => null);
        await openList(page);
        await actionsOf(styleName(page, "Notte e2e")).click();
        await page.getByRole("menuitem", { name: "Elimina" }).click();
        await dialog(page).getByRole("button", { name: /^(Conferma eliminazione|Elimina)/i }).click();
        await expect.poll(() => write(stub, "styles.DELETE")?.params.get("id")).toBe(`eq.${STYLE.notte}`);
        expect(write(stub, "schedule_layout.PATCH")).toBeUndefined();
    });

    test("elimina uno stile in uso: il sostitutivo è obbligatorio e ripunta le regole", async ({ page }) => {
        stub.onWrite("schedule_layout.PATCH", () => null);
        stub.onWrite("styles.DELETE", () => null);
        await openList(page);
        await actionsOf(styleName(page, "Estate e2e")).click();
        await page.getByRole("menuitem", { name: "Elimina" }).click();
        const confirm = dialog(page);
        await expect(confirm).toContainText("Pranzo e2e");
        await expect(confirm.getByRole("button", { name: /^(Conferma eliminazione|Elimina)/i })).toBeDisabled();
        await confirm.getByRole("combobox", { name: /Sostitu/ }).selectOption({ label: "Sera e2e" });
        await confirm.getByRole("button", { name: /^(Conferma eliminazione|Elimina)/i }).click();
        await expect.poll(() => write(stub, "schedule_layout.PATCH")?.body).toEqual({ style_id: STYLE.sera });
        await expect.poll(() => write(stub, "styles.DELETE")?.params.get("id")).toBe(`eq.${STYLE.estate}`);
    });

    test("senza styles.write: niente crea, duplica, elimina", async ({ page }) => {
        await stub.revoke("styles.write");
        await openList(page);
        await stub.revoked;
        await expect(page.getByRole("button", { name: "Crea stile" })).toHaveCount(0);
        await actionsOf(styleName(page, "Sera e2e")).click();
        await expect(page.getByRole("menuitem", { name: "Duplica" })).toHaveCount(0);
        await expect(page.getByRole("menuitem", { name: "Elimina" })).toHaveCount(0);
    });
});

test.describe("Stili — elenco ricomposto (P2)", () => {
    test("errore di caricamento: lo stato lo dice, «Riprova» ricarica", async ({ page }) => {
        let fail = true;
        await page.route(/\/rest\/v1\/styles\?/, route =>
            fail && route.request().method() === "GET" ? route.fulfill({ status: 500, json: { message: "e2e" } }) : route.fallback()
        );
        await openBusinessPage(page, "styles", "Stili");
        await expect(main(page).getByText("Non è stato possibile caricare gli stili")).toBeVisible({ timeout: 15_000 });
        fail = false;
        await main(page).getByRole("button", { name: "Riprova" }).click();
        await expect(styleName(page, "Estate e2e")).toBeVisible();
    });

    for (const view of ["grid", "list"] as const) {
        test(`${view}: ricerca senza esito, e si azzera`, async ({ page }) => {
            await openList(page, view);
            await search(page, "nessuno stile si chiama così");
            await expect(main(page).getByText("Nessun risultato")).toBeVisible();
            await main(page).getByRole("button", { name: /Azzera|Cancella|Rimuovi i filtri/ }).first().click();
            await expect(styleName(page, "Estate e2e")).toBeVisible();
        });
    }

    test("la card è un link allo stile; di sistema lo dice a parole", async ({ page }) => {
        await openList(page, "grid");
        await expect(main(page).getByRole("link", { name: "Estate e2e" })).toHaveAttribute("href", new RegExp(`/crea/stile/${STYLE.estate}\\?da=stili$`));
        // ST3: testo davanti all'uso, non più una pillola.
        await expect(main(page).getByText(/^Di sistema · /)).toBeVisible();
    });

    test("chi non scrive: il «⋯» apre lo stile da guardare, spento", async ({ page }) => {
        await stub.revoke("styles.write");
        await openList(page);
        await stub.revoked;
        await actionsOf(styleName(page, "Sera e2e")).click();
        await page.getByRole("menuitem", { name: "Apri" }).click();
        await expect(page).toHaveURL(new RegExp(`/crea/stile/${STYLE.sera}\\?da=stili$`));
        // lo guarda com'è, spento: le stesse parti del tunnel e la pagina vera nel telefono
        await expect(main(page).getByText(/Puoi guardare questo stile, non cambiarlo/)).toBeVisible();
        await expect(main(page).getByRole("button", { name: "Sottolineata" })).toBeDisabled();
        await expect(main(page).getByRole("switch", { name: "Il logo" })).toBeDisabled();
        await expect(main(page).getByRole("button", { name: "Versioni di prima" })).toHaveCount(0);
        await expect(page.getByLabel("Così lo vede il cliente").getByText("Happy Hour Estivo").first()).toBeVisible();
        await main(page).getByRole("button", { name: "Torna agli stili" }).click();
        await expect(page).toHaveURL(/\/styles$/);
    });

    test("eliminare uno stile non usato è una conferma, non un drawer", async ({ page }) => {
        await openList(page);
        await actionsOf(styleName(page, "Notte e2e")).click();
        await page.getByRole("menuitem", { name: "Elimina" }).click();
        const confirm = page.getByRole("alertdialog");
        await expect(confirm).toContainText("Eliminare «Notte e2e»?");
        await confirm.getByRole("button", { name: "Annulla" }).click();
        expect(stub.writes).toHaveLength(0);
    });
});

test.describe("Stili — permessi (P1)", () => {
    test("senza styles.read: il blocco, e nessuna lettura degli stili", async ({ page }) => {
        // Senza il permesso la voce «Stili» non è nella sidebar: si entra dalla Panoramica.
        await openBusinessPage(page, "overview", "Panoramica");
        const reads: string[] = [];
        page.on("request", r => {
            if (/\/rest\/v1\/styles\?/.test(r.url())) reads.push(r.url());
        });
        await stub.revoke("styles.read");
        await openStyle(page, STYLE.estate);
        await stub.revoked;
        await expect(main(page).getByText("Non hai accesso a questa sezione")).toBeVisible({ timeout: 15_000 });
        expect(reads).toHaveLength(0);
    });
});

/** La card della griglia, o la riga della lista, che contiene il nome dello stile. */
function itemOf(page: Page, name: string): Locator {
    return styleName(page, name).locator("xpath=ancestor::*[.//button[starts-with(@aria-label,'Azioni')]][1]");
}

test.describe("Stili — dove vestono (§50.13)", () => {
    test("griglia: la pillola solo per «Attivo adesso», l'uso nella riga di testo (ST3)", async ({ page }) => {
        await openList(page);
        await expect(itemOf(page, "Estate e2e")).toContainText("Attivo adesso");
        for (const name of ["Stile base e2e", "Autunno e2e", "Sera e2e"]) {
            await expect(itemOf(page, name)).not.toContainText(/Attivo adesso|Programmato|Nessuna regola attiva|Non utilizzato/);
        }
        // Il numero resta, sotto.
        await expect(itemOf(page, "Autunno e2e")).toContainText("Usato in 1 regola");
    });

    test("lista: la colonna «Utilizzo»", async ({ page }) => {
        await openList(page, "list");
        const table = main(page).getByRole("table", { name: "Stili" });
        await expect(table.getByRole("columnheader", { name: "Utilizzo" })).toBeVisible();
        await expect(table.getByRole("row", { name: /Estate e2e/ })).toContainText("Attivo adesso");
        await expect(table.getByRole("row", { name: /Stile base e2e/ })).not.toContainText("Programmato");
    });

});

/**
 * Lotto bug A (censimento del 01/10/2026): ogni caso nasce in `test.fail` e
 * passa a `test` col commit che lo corregge.
 */
test.describe("Stili — lotto bug A", () => {
    test("S4: elenco letto prima che una regola lo usasse: si apre il sostitutivo, non la conferma", async ({ page }) => {
        await openList(page);
        // Un'altra sessione mette Notte su una regola dopo la lettura dell'elenco.
        const id = "e2e5e000-0000-4000-a000-000000000104";
        stub.tables.schedules.push({ ...stub.tables.schedules.find(r => r.id === RULE.autunno)!, id, name: "Notte nuova e2e", enabled: true });
        stub.tables.schedule_layout.push({ id: `layout-${id}`, tenant_id: stub.tables.styles[0].tenant_id, schedule_id: id, catalog_id: null, style_id: STYLE.notte });
        await actionsOf(styleName(page, "Notte e2e")).click();
        await page.getByRole("menuitem", { name: "Elimina" }).click();
        const drawer = dialog(page);
        await expect(drawer.getByRole("combobox", { name: /Sostitu/ })).toBeVisible();
        await expect(drawer).toContainText("Notte nuova e2e");
    });

});
