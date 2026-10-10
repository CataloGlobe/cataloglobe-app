import { expect, test, type Locator, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";
import { sidebarLink } from "./nav";
import { MISSING_STYLE, RULE, STYLE, stubStili, type StiliStub, type WriteCall } from "./stiliStub";
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

function writes(stub: StiliStub, key: string): WriteCall[] {
    return stub.writes.filter(w => w.key === key);
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

async function noSideScroll(page: Page): Promise<void> {
    const overflow = await page.evaluate(() => {
        const de = document.documentElement;
        const scrollers = [de, ...Array.from(document.querySelectorAll<HTMLElement>("main"))];
        return Math.max(...scrollers.map(el => el.scrollWidth - el.clientWidth));
    });
    expect(overflow).toBeLessThanOrEqual(0);
}

/** Il campo del nome nell'editor. */
function nameField(page: Page): Locator {
    return main(page).getByRole("textbox", { name: /^Nome stile/ });
}

/**
 * Cambia un token (Arrotondamento → Morbido): una modifica che il pubblico
 * vede. Il solo nome non crea una versione né chiede l'avviso (S3).
 */
async function touchToken(page: Page): Promise<void> {
    await main(page).getByRole("radio", { name: "Morbido", exact: true }).click();
}

/** Salva dell'editor: in fondo al pannello oggi, in testata domani. */
function saveButton(page: Page): Locator {
    return page.getByRole("button", { name: "Salva", exact: true }).first();
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

    test("lista: versione e uso, la riga apre l'editor", async ({ page }) => {
        await openList(page, "list");
        await expect(main(page).getByText("Versione 3")).toBeVisible();
        await styleName(page, "Sera e2e").click();
        await expect(page).toHaveURL(new RegExp(`/styles/${STYLE.sera}$`));
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

    test("crea uno stile e apre l'editor", async ({ page }) => {
        wireStyleWrites(stub);
        await openList(page);
        await page.getByRole("button", { name: "Crea stile" }).first().click();
        const drawer = dialog(page);
        await drawer.getByRole("textbox", { name: /^Nome stile/ }).fill("Autunno e2e");
        await drawer.getByRole("button", { name: /^Crea/ }).click();
        await expect.poll(() => write(stub, "styles.POST")?.body).toMatchObject({ name: "Autunno e2e" });
        await expect.poll(() => writes(stub, "style_versions.POST").length).toBe(1);
        await expect(page).toHaveURL(/\/styles\/e2e5e000-0000-4000-a000-0000000009\d\d$/);
        await expect(nameField(page)).toHaveValue("Autunno e2e", { timeout: 15_000 });
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
        await expect(main(page).getByRole("link", { name: "Estate e2e" })).toHaveAttribute("href", new RegExp(`/styles/${STYLE.estate}$`));
        // ST3: testo davanti all'uso, non più una pillola.
        await expect(main(page).getByText(/^Di sistema · /)).toBeVisible();
    });

    test("chi non scrive: il «⋯» apre, non modifica", async ({ page }) => {
        await stub.revoke("styles.write");
        await openList(page);
        await stub.revoked;
        await actionsOf(styleName(page, "Sera e2e")).click();
        await page.getByRole("menuitem", { name: "Apri" }).click();
        await expect(page).toHaveURL(new RegExp(`/styles/${STYLE.sera}$`));
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

test.describe("Stili — editor", () => {
    test("bozza: Salva crea una versione, lo stile in uso chiede conferma", async ({ page }) => {
        wireStyleWrites(stub);
        await openStyle(page, STYLE.estate);
        await expect(nameField(page)).toHaveValue("Estate e2e", { timeout: 15_000 });
        await nameField(page).fill("Estate 2026 e2e");
        await touchToken(page);
        await saveButton(page).click();
        const confirm = page.getByRole("alertdialog");
        await expect(confirm).toContainText("Stile in uso");
        await confirm.getByRole("button", { name: "Salva comunque" }).click();
        await expect.poll(() => write(stub, "style_versions.POST")?.body).toMatchObject({ style_id: STYLE.estate, version: 4 });
        await expect.poll(() => write(stub, "styles.PATCH")?.body).toMatchObject({ name: "Estate 2026 e2e" });
    });

    test("uno stile che non veste niente si salva senza conferma", async ({ page }) => {
        wireStyleWrites(stub);
        await openStyle(page, STYLE.sera);
        await expect(nameField(page)).toHaveValue("Sera e2e", { timeout: 15_000 });
        await nameField(page).fill("Sera tardi e2e");
        await saveButton(page).click();
        await expect.poll(() => write(stub, "styles.PATCH")?.body).toMatchObject({ name: "Sera tardi e2e" });
        await expect(page.getByRole("alertdialog")).toHaveCount(0);
    });

    test("Annulla torna al salvato senza scrivere", async ({ page }) => {
        await openStyle(page, STYLE.sera);
        await expect(nameField(page)).toHaveValue("Sera e2e", { timeout: 15_000 });
        await nameField(page).fill("Da buttare");
        await page.getByRole("button", { name: "Annulla", exact: true }).first().click();
        // Da P3 «Annulla» chiede conferma (HeaderSaveAction); oggi torna subito.
        const confirm = page.getByRole("alertdialog");
        if (await confirm.isVisible().catch(() => false)) {
            await confirm.getByRole("button", { name: /Annulla le modifiche|Scarta|Esci senza salvare/ }).click();
        }
        await expect(nameField(page)).toHaveValue("Sera e2e");
        expect(stub.writes.filter(w => !w.key.startsWith("translation"))).toHaveLength(0);
    });

    test("Versioni: elenco, ripristino come versione nuova", async ({ page }) => {
        wireStyleWrites(stub);
        await openStyle(page, STYLE.estate);
        await expect(nameField(page)).toHaveValue("Estate e2e", { timeout: 15_000 });
        await page.getByRole("button", { name: /Versione 3/ }).first().click();
        await expect(page.getByRole("button", { name: /^v3\b/ })).toBeVisible();
        await expect(page.getByRole("button", { name: /^v1\b/ })).toBeVisible();
        await page.getByRole("button", { name: /^v2\b/ }).click();
        await page.getByRole("button", { name: /^Ripristina/ }).click();
        // Estate è in uso: il ripristino passa dall'avviso, come il Salva (S2).
        await page.getByRole("alertdialog").getByRole("button", { name: "Ripristina comunque" }).click();
        await expect.poll(() => write(stub, "style_versions.POST")?.body).toMatchObject({
            style_id: STYLE.estate,
            version: 4,
            config: { colors: { primary: "#ef4444" } }
        });
    });

    test("stile di sistema: «Duplica e personalizza» apre la copia", async ({ page }) => {
        wireStyleWrites(stub);
        await openStyle(page, STYLE.base);
        const duplicate = page.getByRole("button", { name: "Duplica e personalizza" });
        await expect(duplicate).toBeVisible({ timeout: 15_000 });
        await duplicate.click();
        await expect.poll(() => (write(stub, "styles.POST")?.body as Row | undefined)?.name).toBe("Copia di Stile base e2e");
        await expect(page).toHaveURL(/\/styles\/e2e5e000-0000-4000-a000-0000000009\d\d$/);
    });
});

test.describe("Stili — editor ricomposto (P3)", () => {
    test("stile che non esiste: lo dice, e riporta all'elenco", async ({ page }) => {
        await openStyle(page, MISSING_STYLE);
        await expect(main(page).getByText("Stile non trovato")).toBeVisible({ timeout: 15_000 });
        await main(page).getByRole("button", { name: "Torna a Stili" }).click();
        await expect(page).toHaveURL(/\/styles$/);
    });

    test("errore di caricamento: non è «non trovato», e «Riprova» ricarica", async ({ page }) => {
        let fail = true;
        await page.route(/\/rest\/v1\/styles\?/, route =>
            fail && route.request().method() === "GET" ? route.fulfill({ status: 500, json: { message: "e2e" } }) : route.fallback()
        );
        await openStyle(page, STYLE.sera);
        await expect(main(page).getByText("Non è stato possibile caricare lo stile")).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole("button", { name: "Salva", exact: true })).toHaveCount(0);
        fail = false;
        await main(page).getByRole("button", { name: "Riprova" }).click();
        await expect(nameField(page)).toHaveValue("Sera e2e");
    });

    test("uscita con modifiche: la guardia chiede, «Annulla» resta", async ({ page }) => {
        await openStyle(page, STYLE.sera);
        await expect(nameField(page)).toHaveValue("Sera e2e", { timeout: 15_000 });
        await nameField(page).fill("Sera e2e bis");
        await (await sidebarLink(page, "Menù")).click();
        const guard = page.getByRole("alertdialog");
        await expect(guard).toContainText("Modifiche non salvate");
        await guard.getByRole("button", { name: /^(Annulla|Resta)/ }).click();
        await expect(page).toHaveURL(new RegExp(`/styles/${STYLE.sera}$`));
        await expect(nameField(page)).toHaveValue("Sera e2e bis");
    });

    test("l'avviso «in uso» non si spegne: niente «Non chiedere più»", async ({ page }) => {
        await openStyle(page, STYLE.estate);
        await expect(nameField(page)).toHaveValue("Estate e2e", { timeout: 15_000 });
        await nameField(page).fill("Estate bis e2e");
        await touchToken(page);
        await saveButton(page).click();
        const confirm = page.getByRole("alertdialog");
        await expect(confirm).toContainText("Versioni");
        await expect(confirm.getByRole("checkbox")).toHaveCount(0);
        await confirm.getByRole("button", { name: "Annulla" }).click();
        expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("cataloglobe-style-skip-confirm")))).toEqual([]);
    });

    test("stile di sistema: lo stesso pannello, spento, anche per chi scrive", async ({ page }) => {
        await openStyle(page, STYLE.base);
        await expect(page.getByRole("button", { name: "Duplica e personalizza" })).toBeVisible({ timeout: 15_000 });
        await expect(nameField(page)).toBeDisabled();
        await expect(main(page).getByText("Tipografia", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Salva", exact: true })).toHaveCount(0);
    });
});

test.describe("Stili — editor a 375 (P4)", () => {
    test("il pannello sta nello schermo e si comprime", async ({ page }) => {
        await openStyle(page, STYLE.sera);
        await expect(nameField(page)).toBeVisible({ timeout: 15_000 });
        await page.setViewportSize({ width: 375, height: 800 });
        await page.reload();
        await expect(nameField(page)).toBeVisible({ timeout: 15_000 });
        const panel = page.locator("aside").filter({ hasText: "Proprietà stile" });
        const box = await panel.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(375);
        // Il bordo destro del campo nome non è tagliato.
        const field = await nameField(page).boundingBox();
        expect(field!.x + field!.width).toBeLessThanOrEqual(box!.x + box!.width);
        await page.getByRole("button", { name: "Comprimi pannello" }).click();
        await expect(page.getByRole("button", { name: "Apri proprietà stile" })).toBeVisible();
        await expect(panel).toHaveCount(0);
    });
});

test.describe("Stili — permessi (P1)", () => {
    test("editor senza styles.write: sola lettura, niente Salva né ripristino", async ({ page }) => {
        await stub.revoke("styles.write");
        await openStyle(page, STYLE.estate);
        await stub.revoked;
        await expect(main(page).getByText(/^Sola lettura/)).toBeVisible({ timeout: 15_000 });
        await expect(nameField(page)).toBeDisabled();
        await expect(page.getByRole("button", { name: "Salva", exact: true })).toHaveCount(0);
        await page.getByRole("button", { name: /Versione 3/ }).first().click();
        await page.getByRole("button", { name: /^v2\b/ }).click();
        await expect(page.getByRole("button", { name: /^Ripristina/ })).toHaveCount(0);
    });

    test("stile di sistema senza styles.write: niente «Duplica e personalizza»", async ({ page }) => {
        await stub.revoke("styles.write");
        await openStyle(page, STYLE.base);
        await stub.revoked;
        await expect(main(page).getByText("Stile di sistema").first()).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole("button", { name: "Duplica e personalizza" })).toHaveCount(0);
    });

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

    test("editor: l'avviso nomina le sedi che vedono la modifica subito", async ({ page }) => {
        await openStyle(page, STYLE.estate);
        await expect(nameField(page)).toHaveValue("Estate e2e", { timeout: 15_000 });
        await nameField(page).fill("Estate bis e2e");
        await touchToken(page);
        await saveButton(page).click();
        const confirm = page.getByRole("alertdialog");
        await expect(confirm).toContainText("Centro e2e e Porto e2e");
        await expect(confirm).toContainText("subito");
        await expect(confirm).toContainText("Versioni");
        // La sede sospesa non vede niente, e non è nominata.
        await expect(confirm).not.toContainText("Lago e2e");
    });

    test("editor: uno stile solo su regole ferme si salva senza avviso", async ({ page }) => {
        wireStyleWrites(stub);
        await openStyle(page, STYLE.autunno);
        await expect(nameField(page)).toHaveValue("Autunno e2e", { timeout: 15_000 });
        await nameField(page).fill("Autunno 2026 e2e");
        await saveButton(page).click();
        await expect.poll(() => write(stub, "styles.PATCH")?.body, { timeout: 5_000 }).toMatchObject({ name: "Autunno 2026 e2e" });
        await expect(page.getByRole("alertdialog")).toHaveCount(0);
    });

    test("editor: programmato e nessuna sede adesso, l'avviso lo dice", async ({ page }) => {
        // Lo stile di sistema non si modifica: la regola programmata passa su Sera.
        stub.tables.schedule_layout.find(l => l.schedule_id === RULE.seraPorto)!.style_id = STYLE.sera;
        await openStyle(page, STYLE.sera);
        await expect(nameField(page)).toHaveValue("Sera e2e", { timeout: 15_000 });
        await nameField(page).fill("Sera bis e2e");
        await touchToken(page);
        await saveButton(page).click();
        const confirm = page.getByRole("alertdialog");
        await expect(confirm).toContainText("Nessuna sede lo mostra adesso");
        await expect(confirm).toContainText("Porto e2e");
    });
});

test.describe("Stili — larghezze", () => {
    for (const width of [1280, 768, 375]) {
        test(`${width}: elenco ed editor senza scroll di lato`, async ({ page }) => {
            await openList(page);
            await page.setViewportSize({ width, height: 900 });
            await page.reload();
            await expect(styleName(page, "Estate e2e")).toBeVisible({ timeout: 15_000 });
            await noSideScroll(page);
            await openStyle(page, STYLE.estate);
            await expect(nameField(page)).toBeVisible({ timeout: 15_000 });
            await noSideScroll(page);
        });
    }
});

/**
 * Lotto bug A (censimento del 01/10/2026): ogni caso nasce in `test.fail` e
 * passa a `test` col commit che lo corregge.
 */
test.describe("Stili — lotto bug A", () => {
    test("S1: se la rilettura dopo il Salva fallisce, il salvataggio resta riuscito", async ({ page }) => {
        wireStyleWrites(stub);
        await page.route(/\/rest\/v1\/styles\?/, route =>
            route.request().method() === "GET" && write(stub, "styles.PATCH")
                ? route.fulfill({ status: 500, json: { message: "e2e" } })
                : route.fallback()
        );
        await openStyle(page, STYLE.sera);
        await expect(nameField(page)).toHaveValue("Sera e2e", { timeout: 15_000 });
        await touchToken(page);
        await saveButton(page).click();
        await expect(page.getByText(/^Stile aggiornato/)).toBeVisible();
        await expect(page.getByRole("status").filter({ hasText: /^Salvato$/ }).first()).toBeVisible();
        // L'errore arriverebbe dopo il successo, con la rilettura.
        await page.waitForTimeout(1_000);
        // Conteggio secco: `toHaveCount(0)` aspetterebbe che il toast se ne vada.
        expect(await page.getByText("Impossibile salvare lo stile.").count()).toBe(0);
    });

    test("S1: dopo il Salva, senza ricaricare, versione e data sono quelle scritte", async ({ page }) => {
        wireStyleWrites(stub);
        await openStyle(page, STYLE.sera);
        await expect(nameField(page)).toHaveValue("Sera e2e", { timeout: 15_000 });
        await expect(page.getByRole("button", { name: /Versione 1/ }).first()).toContainText("Aggiornata 19/03/2026");
        await touchToken(page);
        await saveButton(page).click();
        await expect(page.getByRole("status").filter({ hasText: /^Salvato$/ }).first()).toBeVisible();
        // Pannello: versione nuova e data della scrittura (orologio fermo al 23/09).
        const control = page.getByRole("button", { name: /Versione 2/ }).first();
        await expect(control).toContainText("Aggiornata 23/09/2026");
        await control.click();
        const current = page.getByRole("button", { name: /^v2\b/ });
        await expect(current).toBeVisible();
        await expect(current).toContainText("attiva");
        await expect(page.getByRole("button", { name: /^v1\b/ })).not.toContainText("attiva");
        // Nessuna seconda lettura dello stile dopo la scrittura.
        expect(writes(stub, "styles.PATCH")).toHaveLength(1);
    });

    test("S3: cambiare solo il nome non crea una versione", async ({ page }) => {
        wireStyleWrites(stub);
        await openStyle(page, STYLE.sera);
        await expect(nameField(page)).toHaveValue("Sera e2e", { timeout: 15_000 });
        await nameField(page).fill("Sera tardi e2e");
        await saveButton(page).click();
        await expect.poll(() => write(stub, "styles.PATCH")?.body).toMatchObject({ name: "Sera tardi e2e" });
        expect(writes(stub, "style_versions.POST")).toHaveLength(0);
    });

    test("S3: il solo nome di uno stile in uso si salva senza avviso", async ({ page }) => {
        wireStyleWrites(stub);
        await openStyle(page, STYLE.estate);
        await expect(nameField(page)).toHaveValue("Estate e2e", { timeout: 15_000 });
        await nameField(page).fill("Estate 2026 e2e");
        await saveButton(page).click();
        await expect.poll(() => write(stub, "styles.PATCH")?.body, { timeout: 5_000 }).toMatchObject({ name: "Estate 2026 e2e" });
        await expect(page.getByRole("alertdialog")).toHaveCount(0);
    });

    test("S2: con modifiche non salvate «Ripristina» è spento", async ({ page }) => {
        await openStyle(page, STYLE.estate);
        await expect(nameField(page)).toHaveValue("Estate e2e", { timeout: 15_000 });
        await touchToken(page);
        await page.getByRole("button", { name: /Versione 3/ }).first().click();
        await page.getByRole("button", { name: /^v2\b/ }).click();
        await expect(page.getByRole("button", { name: /^Ripristina/ })).toBeDisabled();
        await expect(page.getByText(/Salva o annulla le modifiche/)).toBeVisible();
    });

    test("S2: ripristinare uno stile in uso passa dall'avviso «Stile in uso»", async ({ page }) => {
        wireStyleWrites(stub);
        await openStyle(page, STYLE.estate);
        await expect(nameField(page)).toHaveValue("Estate e2e", { timeout: 15_000 });
        await page.getByRole("button", { name: /Versione 3/ }).first().click();
        await page.getByRole("button", { name: /^v2\b/ }).click();
        await page.getByRole("button", { name: /^Ripristina/ }).click();
        const confirm = page.getByRole("alertdialog");
        await expect(confirm).toContainText("Stile in uso");
        await expect(confirm).toContainText("Centro e2e e Porto e2e");
        expect(writes(stub, "style_versions.POST")).toHaveLength(0);
        await confirm.getByRole("button", { name: /comunque$/ }).click();
        await expect.poll(() => write(stub, "style_versions.POST")?.body).toMatchObject({
            style_id: STYLE.estate,
            config: { colors: { primary: "#ef4444" } }
        });
    });

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

    for (const size of [
        { width: 768, height: 900 },
        { width: 1280, height: 600 }
    ]) {
        test(`S7: a ${size.width}×${size.height} l'anteprima mobile sta nel suo spazio`, async ({ page }) => {
            await page.setViewportSize(size);
            await openStyle(page, STYLE.sera);
            await expect(nameField(page)).toBeVisible({ timeout: 15_000 });
            const frame = page.locator(".preview-mobile");
            await expect(frame).toBeVisible();
            await page.waitForTimeout(600);
            const fits = await frame.evaluate(el => {
                const host = el.parentElement!.parentElement!.getBoundingClientRect();
                const box = el.getBoundingClientRect();
                return box.left >= host.left - 1 && box.right <= host.right + 1 && box.top >= host.top - 1 && box.bottom <= host.bottom + 1;
            });
            expect(fits).toBe(true);
        });
    }

    test("S8: l'avviso «Stile in uso» resta aperto se la finestra si stringe", async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await openStyle(page, STYLE.estate);
        await expect(nameField(page)).toHaveValue("Estate e2e", { timeout: 15_000 });
        await touchToken(page);
        await saveButton(page).click();
        const confirm = page.getByRole("alertdialog");
        await expect(confirm).toContainText("Stile in uso");
        await page.setViewportSize({ width: 700, height: 900 });
        await page.waitForTimeout(500);
        await expect(confirm).toContainText("Stile in uso");
    });

    test("S8: «Scartare le modifiche?» resta aperto se la finestra si stringe", async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await openStyle(page, STYLE.sera);
        await expect(nameField(page)).toHaveValue("Sera e2e", { timeout: 15_000 });
        await nameField(page).fill("Sera bis e2e");
        await page.getByRole("button", { name: "Annulla", exact: true }).first().click();
        const confirm = page.getByRole("alertdialog");
        await expect(confirm).toContainText("Scartare le modifiche");
        await page.setViewportSize({ width: 700, height: 900 });
        await page.waitForTimeout(500);
        await expect(confirm).toContainText("Scartare le modifiche");
    });
});
