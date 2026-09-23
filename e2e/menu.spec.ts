import { expect, test, type Locator, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";
import { CAT, MENU, MISSING_MENU, PRODUCT, linkOf, stubMenu, type MenuStub, type WriteCall } from "./menuStub";

/**
 * Menù (lotto `ds-5-menu`, passo 2 P0). Scritto sulla pagina di **oggi**,
 * prima di ricomporla: deve restare verde passo dopo passo.
 *
 * Dati: menù, categorie, collegamenti e prodotti sono finti (`menuStub.ts`);
 * permessi, azienda e sidebar sono veri. Nessuna scrittura parte: ogni gesto
 * che scrive ha un test di cablaggio che controlla tabella, filtri e corpo.
 *
 * Dove un nome cambierà nei passi successivi il locator accetta il nome di
 * oggi e quello di domani. Locator per ruolo o per testo visibile; dove una
 * riga non ha un ruolo, si risale al contenitore che porta il suo «Azioni».
 */

function main(page: Page) {
    return page.getByRole("main");
}

/** Il «⋯» della riga (card, riga di tabella, nodo) che contiene `anchor`. */
function actionsOf(anchor: Locator): Locator {
    return anchor
        .locator("xpath=ancestor::*[.//button[starts-with(@aria-label,'Azioni')]][1]")
        .getByRole("button", { name: /^Azioni/ })
        .first();
}

/** La casella di selezione della riga di tabella che contiene `anchor`. */
function checkboxOf(anchor: Locator): Locator {
    return anchor
        .locator("xpath=ancestor::*[.//*[@aria-label='Seleziona riga']][1]")
        .getByRole("checkbox", { name: "Seleziona riga" });
}

/** L'ultimo dialogo aperto: drawer (`dialog`) o conferma (`alertdialog`). */
function dialog(page: Page): Locator {
    return page.getByRole("dialog").or(page.getByRole("alertdialog")).last();
}

async function openList(page: Page): Promise<void> {
    await openBusinessPage(page, "catalogs", "Menù");
    await expect(main(page).getByText("Carta e2e")).toBeVisible({ timeout: 15_000 });
}

async function openCarta(page: Page): Promise<void> {
    await openList(page);
    await main(page).getByText("Carta e2e").click();
    await expect(page).toHaveURL(new RegExp(`/catalogs/${MENU.carta}`));
    await expect(node(page, "Antipasti")).toBeVisible({ timeout: 15_000 });
}

/** Il nodo dell'albero: il bottone che sceglie la categoria. */
function node(page: Page, name: string): Locator {
    return main(page).getByRole("button", { name, exact: true });
}

async function selectCategory(page: Page, name: string): Promise<void> {
    await node(page, name).click();
    // Il titolo della card della categoria: sul telefono l'albero sparisce, e
    // il nome resta una volta sola.
    await expect(page).toHaveURL(/categoryId=/);
    await expect(main(page).getByText(name, { exact: true }).last()).toBeVisible();
}

/** Apre una voce del kebab nella testata della categoria scelta. */
async function categoryMenu(page: Page, item: string | RegExp): Promise<void> {
    await main(page).getByRole("button", { name: /^Azioni della/ }).click();
    await page.getByRole("menuitem", { name: item }).click();
}

/** Rinomina la categoria scelta: in bozza, «Applica». */
async function renameCategory(page: Page, name: string): Promise<void> {
    await categoryMenu(page, "Rinomina");
    await dialog(page).getByRole("textbox", { name: /Nome/ }).fill(name);
    await dialog(page).getByRole("button", { name: "Applica" }).click();
    await expect(node(page, name)).toBeVisible();
}

function write(stub: MenuStub, key: string): WriteCall | undefined {
    return stub.writes.find(w => w.key === key);
}

async function noSideScroll(page: Page): Promise<void> {
    const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
}

/** Salva la bozza: oggi la barra nella pagina, dopo P3 `HeaderSaveAction` in testata. */
async function saveDraft(page: Page): Promise<void> {
    await page.getByRole("button", { name: /^Salva( modifiche)?$/ }).first().click();
}

let stub: MenuStub;

test.beforeEach(async ({ page }) => {
    stub = await stubMenu(page);
});

test.describe("Menù — elenco", () => {
    test("testata e griglia con i conteggi", async ({ page }) => {
        await openList(page);
        await expect(page).toHaveTitle(/^Menù — .+ \| CataloGlobe$/);
        await expect(page.getByRole("radio", { name: "Vista griglia" })).toBeVisible();
        await expect(page.getByRole("radio", { name: "Vista lista" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Importa con AI" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Crea menù" })).toBeVisible();

        for (const name of ["Carta e2e", "Pranzo e2e", "Vuoto e2e"]) {
            await expect(main(page).getByText(name)).toBeVisible();
        }
        // Carta: 7 categorie, 22 collegamenti (le due varianti comprese).
        const carta = main(page).getByText("Carta e2e").locator("xpath=ancestor::*[contains(., 'Creato il') and contains(., 'prodotti')][1]");
        await expect(carta).toContainText(/7 categorie/);
        await expect(carta).toContainText(/22\s*prodotti/);
    });

    test("la ricerca filtra, e il vuoto filtrato lo dice", async ({ page }) => {
        await openList(page);
        const search = page.getByRole("searchbox").or(page.getByPlaceholder(/Cerca menù/)).first();
        await search.fill("pranzo");
        await expect(main(page).getByText("Pranzo e2e")).toBeVisible();
        await expect(main(page).getByText("Carta e2e")).toHaveCount(0);
        await search.fill("zzz");
        await expect(main(page).getByText("Nessun risultato")).toBeVisible();
    });

    test("la vista lista apre il menù dalla riga", async ({ page }) => {
        await openList(page);
        await page.getByRole("radio", { name: "Vista lista" }).click();
        await expect(page.getByRole("checkbox", { name: "Seleziona tutte le righe" })).toBeVisible();
        await main(page).getByText("Carta e2e").click();
        await expect(page).toHaveURL(new RegExp(`/catalogs/${MENU.carta}`));
    });

    test("il kebab del menù ha le tre azioni", async ({ page }) => {
        await openList(page);
        await actionsOf(main(page).getByText("Carta e2e")).click();
        await expect(page.getByRole("menuitem", { name: /Aggiungi prodotti con AI/ })).toBeVisible();
        await expect(page.getByRole("menuitem", { name: /^(Modifica nome|Rinomina)$/ })).toBeVisible();
        await expect(page.getByRole("menuitem", { name: "Elimina menù" })).toBeVisible();
    });

    test("crea un menù: POST con il nome", async ({ page }) => {
        stub.onWrite("catalogs.POST", ({ body }) => ({ id: "e2e0c000-0000-4000-a000-000000000777", created_at: new Date().toISOString(), ...(body as object[])[0] }));
        await openList(page);
        await page.getByRole("button", { name: "Crea menù" }).click();
        // Senza nome l'errore sta sul campo, e non parte niente.
        await dialog(page).getByRole("button", { name: /^Crea/ }).click();
        await expect(dialog(page).getByText("Scrivi un nome.")).toBeVisible();
        expect(write(stub, "catalogs.POST")).toBeUndefined();
        // Il nome si salva senza gli spazi ai lati (#240).
        await dialog(page).getByRole("textbox", { name: /Nome/ }).fill("  Cena  ");
        await dialog(page).getByRole("button", { name: /^Crea/ }).click();
        await expect.poll(() => write(stub, "catalogs.POST")).toBeTruthy();
        expect(write(stub, "catalogs.POST")!.body).toEqual([expect.objectContaining({ name: "Cena" })]);
    });

    test("rinomina un menù: PATCH sul suo id", async ({ page }) => {
        stub.onWrite("catalogs.PATCH", ({ body }) => ({ id: MENU.carta, created_at: new Date().toISOString(), ...(body as object) }));
        await openList(page);
        await actionsOf(main(page).getByText("Carta e2e")).click();
        await page.getByRole("menuitem", { name: /^(Modifica nome|Rinomina)$/ }).click();
        const name = dialog(page).getByRole("textbox", { name: /Nome/ });
        await expect(name).toHaveValue("Carta e2e");
        await name.fill("Carta sera");
        await dialog(page).getByRole("button", { name: /^Salva/ }).click();
        await expect.poll(() => write(stub, "catalogs.PATCH")).toBeTruthy();
        const call = write(stub, "catalogs.PATCH")!;
        expect(call.params.get("id")).toBe(`eq.${MENU.carta}`);
        expect(call.body).toEqual({ name: "Carta sera" });
    });

    test("un menù usato da una regola non si elimina", async ({ page }) => {
        await openList(page);
        await actionsOf(main(page).getByText("Pranzo e2e")).click();
        await page.getByRole("menuitem", { name: "Elimina menù" }).click();
        await expect(dialog(page)).toContainText("Pranzo feriale");
        await expect(dialog(page).getByRole("button", { name: "Elimina" })).toBeDisabled();
        expect(stub.writes.filter(w => w.key === "catalogs.DELETE")).toHaveLength(0);
    });

    test("elimina un menù libero: DELETE sul suo id", async ({ page }) => {
        stub.onWrite("catalogs.DELETE", () => null);
        await openList(page);
        await actionsOf(main(page).getByText("Vuoto e2e")).click();
        await page.getByRole("menuitem", { name: "Elimina menù" }).click();
        await dialog(page).getByRole("button", { name: "Elimina" }).click();
        await expect.poll(() => write(stub, "catalogs.DELETE")).toBeTruthy();
        expect(write(stub, "catalogs.DELETE")!.params.get("id")).toBe(`eq.${MENU.vuoto}`);
    });

    test("eliminazione multipla: chiede conferma col conteggio, poi due DELETE", async ({ page }) => {
        stub.onWrite("catalogs.DELETE", () => null);
        await openList(page);
        await page.getByRole("radio", { name: "Vista lista" }).click();
        await checkboxOf(main(page).getByText("Carta e2e")).check();
        await checkboxOf(main(page).getByText("Vuoto e2e")).check();
        const bulk = page.getByRole("toolbar", { name: "Azioni sulla selezione" }).getByRole("button", { name: /Elimina/ });

        // Annullare non scrive e rimette la selezione com'era.
        await bulk.click();
        const confirm = page.getByRole("alertdialog").or(page.getByRole("dialog")).last();
        await expect(confirm).toContainText("Eliminare 2 menù?");
        await expect(confirm).toContainText(/categorie e i collegamenti/);
        await confirm.getByRole("button", { name: "Annulla" }).click();
        expect(stub.writes.filter(w => w.key === "catalogs.DELETE")).toHaveLength(0);
        await expect(checkboxOf(main(page).getByText("Carta e2e"))).toBeChecked();
        await expect(checkboxOf(main(page).getByText("Vuoto e2e"))).toBeChecked();

        await bulk.click();
        await confirm.getByRole("button", { name: "Elimina 2 menù" }).click();
        await expect.poll(() => stub.writes.filter(w => w.key === "catalogs.DELETE").length).toBe(2);
        const ids = stub.writes.filter(w => w.key === "catalogs.DELETE").map(w => w.params.get("id"));
        expect(ids.sort()).toEqual([`eq.${MENU.carta}`, `eq.${MENU.vuoto}`].sort());
        await expect(page.getByRole("alertdialog")).toHaveCount(0);
    });

    test("in sola lettura: niente azioni che scrivono", async ({ page }) => {
        await stub.revoke("catalogs.write");
        await openList(page);
        await stub.revoked;
        // Il controllo positivo prima: la pagina è quella giusta e carica.
        await expect(page.getByRole("radio", { name: "Vista lista" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Crea menù" })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Importa con AI" })).toHaveCount(0);
        await expect(main(page).getByRole("button", { name: /^Azioni/ })).toHaveCount(0);
        await page.getByRole("radio", { name: "Vista lista" }).click();
        await expect(page.getByRole("checkbox", { name: "Seleziona riga" })).toHaveCount(0);
    });

    test("«Importa con AI» apre il suo drawer, senza analizzare", async ({ page }) => {
        await openList(page);
        await page.getByRole("button", { name: "Importa con AI" }).click();
        await expect(dialog(page)).toContainText("Importa menù con AI");
        expect(stub.writes.filter(w => w.key.startsWith("fn."))).toHaveLength(0);
    });
});

test.describe("Menù — dettaglio", () => {
    test("albero a tre livelli, conteggi, selezione nell'URL", async ({ page }) => {
        await openCarta(page);
        for (const name of ["Antipasti", "Pizze", "Vini", "Bianchi", "Rossi", "Dessert"]) {
            await expect(node(page, name)).toBeVisible();
        }
        // Il terzo livello è sotto «Bianchi», chiuso finché non lo si apre.
        await expect(node(page, "Fruttati e aromatici")).toHaveCount(0);
        await node(page, "Bianchi")
            .locator("xpath=ancestor::*[.//button[starts-with(@aria-label,'Espandi')]][1]")
            .getByRole("button", { name: /^Espandi/ })
            .click();
        await expect(node(page, "Fruttati e aromatici")).toBeVisible();

        await selectCategory(page, "Vini");
        await expect(page).toHaveURL(new RegExp(`categoryId=${CAT.vini}`));
        await expect(main(page)).toContainText(/1 prodott/);
    });

    test("l'albero dice i conteggi, le vuote e il tetto dei livelli", async ({ page }) => {
        await openCarta(page);
        // Il numero è il totale con le sotto-categorie, e il nome accessibile lo spiega.
        await expect(node(page, "Vini")).toHaveAccessibleDescription("4 prodotti, 3 nelle sotto-categorie");
        await expect(node(page, "Dessert")).toHaveAccessibleDescription(/vuota/);
        await expect(node(page, "Bianchi").locator("xpath=ancestor::li[1]")).toContainText("2");
        // Il chevron dice se è aperto.
        await expect(main(page).getByRole("button", { name: "Comprimi Vini" })).toHaveAttribute("aria-expanded", "true");
        await main(page).getByRole("button", { name: "Espandi Bianchi" }).click();
        await expect(main(page).getByRole("button", { name: "Comprimi Bianchi" })).toHaveAttribute("aria-expanded", "true");

        // Al terzo livello «Crea sotto-categoria» c'è, spenta, col perché.
        await node(page, "Fruttati e aromatici").hover();
        await main(page).getByRole("button", { name: "Azioni Fruttati e aromatici" }).click();
        const sub = page.getByRole("menuitem", { name: /Crea sotto-categoria/ });
        await expect(sub).toHaveAttribute("aria-disabled", "true");
        await expect(sub).toContainText("Massimo tre livelli.");
        await page.keyboard.press("Escape");
        // Al secondo livello si può.
        await node(page, "Bianchi").hover();
        await main(page).getByRole("button", { name: "Azioni Bianchi" }).click();
        await expect(page.getByRole("menuitem", { name: /Crea sotto-categoria/ })).not.toHaveAttribute("aria-disabled", "true");
    });

    test("riordino da tastiera fra sorelle, in bozza, poi Salva", async ({ page }) => {
        stub.onWrite("catalog_categories.PATCH", ({ params, body }) => ({ id: params.get("id")!.slice(3), catalog_id: MENU.carta, name: "x", level: 1, parent_category_id: null, created_at: new Date().toISOString(), ...(body as object) }));
        await openCarta(page);
        const handle = main(page).getByRole("button", { name: "Riordina Pizze" });
        await handle.focus();
        await page.keyboard.press("Space");
        await page.waitForTimeout(200);
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(300);
        await page.keyboard.press("Space");
        await page.waitForTimeout(200);
        // Ora Vini viene prima di Pizze, e niente è ancora scritto.
        const order = await main(page).getByRole("list", { name: "Categorie" }).getByRole("button", { name: /^(Antipasti|Pizze|Vini|Dessert)$/ }).allTextContents();
        expect(order).toEqual(["Antipasti", "Vini", "Pizze", "Dessert"]);
        expect(stub.writes.filter(w => w.key === "catalog_categories.PATCH")).toHaveLength(0);

        await saveDraft(page);
        await expect.poll(() => stub.writes.filter(w => w.key === "catalog_categories.PATCH").length).toBe(2);
        const patches = stub.writes.filter(w => w.key === "catalog_categories.PATCH");
        const byId = Object.fromEntries(patches.map(w => [w.params.get("id"), w.body]));
        expect(byId[`eq.${CAT.vini}`]).toEqual({ sort_order: 10 });
        expect(byId[`eq.${CAT.pizze}`]).toEqual({ sort_order: 20 });
    });

    test("prodotti della categoria: prezzi, segni, codice, ricerca", async ({ page }) => {
        await openCarta(page);
        await selectCategory(page, "Antipasti");
        for (const name of ["Bruschetta", "Tagliere", "Olive ascolane", "Frittatine"]) {
            await expect(main(page).getByText(name, { exact: true })).toBeVisible();
        }
        await expect(main(page).getByText("Senza prezzo").first()).toBeVisible();
        await expect(main(page).getByText(/da €8[.,]00/)).toBeVisible();
        await expect(main(page).getByText("ANT-003")).toBeVisible();
        await expect(main(page).getByText(/€5[.,]50/)).toBeVisible();

        const search = main(page).getByPlaceholder(/Cerca/).last();
        await search.fill("ANT-003");
        await expect(main(page).getByText("Olive ascolane", { exact: true })).toBeVisible();
        await expect(main(page).getByText("Bruschetta", { exact: true })).toHaveCount(0);
    });

    test("riordino dei prodotti: la maniglia è l'unico controllo, da tastiera, in bozza", async ({ page }) => {
        stub.onWrite("catalog_category_products.PATCH", ({ params, body }) => ({ id: params.get("id")!.slice(3), created_at: new Date().toISOString(), ...(body as object) }));
        await openCarta(page);
        await selectCategory(page, "Antipasti");
        const handles = main(page).getByRole("button", { name: /^Riordina (Bruschetta|Tagliere|Olive ascolane|Frittatine)$/ });
        await expect(handles).toHaveCount(4);
        // Ogni elemento trascinabile è una maniglia con il suo nome: la riga
        // intera non è un bottone.
        const sortables = main(page).locator('[aria-roledescription="sortable"]');
        for (const el of await sortables.all()) {
            await expect(el).toHaveAttribute("aria-label", /^Riordina /);
        }

        await main(page).getByRole("button", { name: "Riordina Tagliere" }).focus();
        await page.keyboard.press("Space");
        await page.waitForTimeout(200);
        await page.keyboard.press("ArrowUp");
        await page.waitForTimeout(300);
        await page.keyboard.press("Space");
        await page.waitForTimeout(200);
        const order = await Promise.all((await handles.all()).map(h => h.getAttribute("aria-label")));
        expect(order).toEqual(["Riordina Tagliere", "Riordina Bruschetta", "Riordina Olive ascolane", "Riordina Frittatine"]);
        expect(stub.writes.filter(w => w.key === "catalog_category_products.PATCH")).toHaveLength(0);

        await saveDraft(page);
        await expect.poll(() => stub.writes.filter(w => w.key === "catalog_category_products.PATCH").length).toBeGreaterThan(0);
    });

    test("varianti sotto il loro prodotto, vuoto con l'azione, togliere più prodotti", async ({ page }) => {
        await openCarta(page);
        await selectCategory(page, "Pizze");
        await expect(main(page).getByText("Margherita baby")).toHaveCount(0);
        const toggle = main(page).getByRole("button", { name: "Mostra le varianti di Margherita", exact: true });
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        await toggle.click();
        await expect(main(page).getByText("Margherita baby")).toBeVisible();
        await expect(main(page).getByText("Variante").first()).toBeVisible();
        await expect(main(page).getByRole("button", { name: "Nascondi le varianti di Margherita", exact: true })).toHaveAttribute("aria-expanded", "true");

        // Togliere più prodotti: in bozza, e un toast lo dice.
        await checkboxOf(main(page).getByText("Diavola", { exact: true })).check();
        await checkboxOf(main(page).getByText("Marinara", { exact: true })).check();
        await page.getByRole("toolbar", { name: "Azioni sulla selezione" }).getByRole("button", { name: /Togli da qui/ }).click();
        await expect(main(page).getByText("Diavola", { exact: true })).toHaveCount(0);
        await expect(page.getByText(/2 tolti da Pizze\. Si pubblicano con Salva\./)).toBeVisible();
        expect(stub.writes.filter(w => w.key === "catalog_category_products.DELETE")).toHaveLength(0);

        // Una categoria vuota lo dice e porta ad aggiungere.
        await selectCategory(page, "Dessert");
        await expect(main(page).getByText("Nessun prodotto in Dessert")).toBeVisible();
        await expect(main(page).getByText(/non compare ai clienti/)).toBeVisible();
        await expect(main(page).getByRole("button", { name: "Aggiungi prodotti" })).toHaveCount(2);
    });

    test("bozza: rinomina, Annulla ripristina, Salva manda il PATCH del nome", async ({ page }) => {
        stub.onWrite("catalog_categories.PATCH", ({ body }) => ({ id: CAT.antipasti, catalog_id: MENU.carta, level: 1, parent_category_id: null, sort_order: 0, created_at: new Date().toISOString(), ...(body as object) }));
        await openCarta(page);
        await selectCategory(page, "Antipasti");

        await renameCategory(page, "Stuzzichini");
        expect(stub.writes.filter(w => w.key === "catalog_categories.PATCH")).toHaveLength(0);
        await page.getByRole("button", { name: /^Annulla( modifiche)?$/ }).first().click();
        // Dopo P3 l'«Annulla» della testata chiede conferma.
        const discard = page.getByRole("button", { name: /^(Annulla modifiche|Scarta|Esci senza salvare)$/ });
        if (await discard.isVisible().catch(() => false)) await discard.click();
        await expect(node(page, "Antipasti")).toBeVisible();

        await renameCategory(page, "Stuzzichini");
        await saveDraft(page);
        await expect.poll(() => write(stub, "catalog_categories.PATCH")).toBeTruthy();
        const call = write(stub, "catalog_categories.PATCH")!;
        expect(call.params.get("id")).toBe(`eq.${CAT.antipasti}`);
        expect(call.body).toEqual(expect.objectContaining({ name: "Stuzzichini" }));
    });

    test("bozza: togliere un prodotto e salvare manda la DELETE del collegamento", async ({ page }) => {
        stub.onWrite("catalog_category_products.DELETE", () => null);
        await openCarta(page);
        await selectCategory(page, "Antipasti");
        await actionsOf(main(page).getByText("Bruschetta", { exact: true })).click();
        await page.getByRole("menuitem", { name: /^(Rimuovi dalla categoria|Togli da qui)$/ }).click();
        // Oggi un drawer di conferma; dopo P6 il gesto è in bozza senza conferma.
        const confirm = dialog(page).getByRole("button", { name: "Rimuovi" });
        if (await confirm.isVisible().catch(() => false)) await confirm.click();
        await expect(main(page).getByText("Bruschetta", { exact: true })).toHaveCount(0);
        expect(stub.writes.filter(w => w.key === "catalog_category_products.DELETE")).toHaveLength(0);

        await saveDraft(page);
        await expect.poll(() => write(stub, "catalog_category_products.DELETE")).toBeTruthy();
        expect(write(stub, "catalog_category_products.DELETE")!.params.get("id")).toBe(`eq.${linkOf(CAT.antipasti, PRODUCT.bruschetta)}`);
    });

    test("bozza: aggiungere un prodotto esistente e salvare manda il POST", async ({ page }) => {
        stub.onWrite("catalog_category_products.POST", ({ body }) => ({ id: "e2e0c000-0000-4000-a000-000000000888", created_at: new Date().toISOString(), ...(body as object[])[0] }));
        await openCarta(page);
        await selectCategory(page, "Dessert");
        await main(page).getByRole("button", { name: /Aggiungi prodott/ }).first().click();
        const tab = dialog(page).getByRole("tab", { name: "Esistente" });
        if (await tab.isVisible().catch(() => false)) await tab.click();
        await checkboxOf(dialog(page).getByText("Tiramisù", { exact: true })).check();
        await dialog(page).getByRole("button", { name: /^(Associa selezionati|Aggiungi) \(1\)$/ }).click();
        await expect(main(page).getByText("Tiramisù", { exact: true })).toBeVisible();

        await saveDraft(page);
        await expect.poll(() => write(stub, "catalog_category_products.POST")).toBeTruthy();
        expect(write(stub, "catalog_category_products.POST")!.body).toEqual([
            expect.objectContaining({ catalog_id: MENU.carta, category_id: CAT.dessert, product_id: PRODUCT.tiramisu, variant_product_id: null })
        ]);
    });

    test("aggiungere: l'elenco è il drawer, creare è l'uscita, gli ereditati bloccati", async ({ page }) => {
        await openCarta(page);
        await selectCategory(page, "Bianchi");
        await main(page).getByRole("button", { name: "Aggiungi prodotti" }).first().click();
        await expect(dialog(page)).toContainText("Aggiungi prodotti");
        await expect(dialog(page)).toContainText("In Bianchi");
        await expect(dialog(page).getByRole("tab")).toHaveCount(0);
        // Prosecco sta in Vini, che contiene Bianchi: si vede, non si sceglie.
        const prosecco = dialog(page).getByText("Prosecco", { exact: true });
        await expect(prosecco.locator("xpath=ancestor::*[.//*[@aria-label='Seleziona riga']][1]")).toContainText("Già nella categoria che la contiene");
        await expect(checkboxOf(prosecco)).toBeDisabled();
        // Il kebab della riga apre solo il prodotto.
        await dialog(page).getByRole("button", { name: "Azioni Tiramisù" }).click();
        await expect(page.getByRole("menuitem")).toHaveCount(1);
        await expect(page.getByRole("menuitem", { name: "Apri il prodotto" })).toBeVisible();
        // Esc chiude il livello più in alto: il menu, non il drawer sotto.
        await page.keyboard.press("Escape");
        await expect(page.getByRole("menu")).toHaveCount(0);
        await expect(dialog(page)).toContainText("Aggiungi prodotti");

        await dialog(page).getByRole("button", { name: "Crea un prodotto" }).click();
        await expect(dialog(page)).toContainText("Nuovo prodotto");
        await expect(dialog(page).getByRole("button", { name: "Crea e aggiungi" })).toBeVisible();
        await dialog(page).getByRole("button", { name: "Torna all'elenco" }).click();
        await expect(dialog(page).getByText("Tiramisù", { exact: true })).toBeVisible();
        // Senza niente sopra, Esc chiude il drawer.
        await page.keyboard.press("Escape");
        await expect(dialog(page)).toHaveCount(0);
    });

    test("crea una categoria principale: POST con livello e genitore", async ({ page }) => {
        stub.onWrite("catalog_categories.POST", ({ body }) => ({ id: "e2e0c000-0000-4000-a000-000000000999", created_at: new Date().toISOString(), ...(body as object[])[0] }));
        await openCarta(page);
        await main(page).getByRole("button", { name: "Nuova categoria" }).first().click();
        await dialog(page).getByRole("textbox", { name: /Nome/ }).fill("Contorni");
        await dialog(page).getByRole("button", { name: /^(Salva|Crea)$/ }).click();
        await expect.poll(() => write(stub, "catalog_categories.POST")).toBeTruthy();
        expect(write(stub, "catalog_categories.POST")!.body).toEqual([
            expect.objectContaining({ catalog_id: MENU.carta, name: "Contorni", level: 1, parent_category_id: null })
        ]);
    });

    test("con la bozza aperta i gesti che scrivono subito sono spenti, col perché", async ({ page }) => {
        await openCarta(page);
        await selectCategory(page, "Antipasti");
        await renameCategory(page, "Stuzzichini");

        await expect(main(page).getByRole("button", { name: "Nuova categoria" })).toBeDisabled();
        await expect(main(page).getByText("Con modifiche da salvare si rinomina e si riordina soltanto.")).toBeVisible();
        await main(page).getByRole("button", { name: /^Azioni della/ }).click();
        for (const item of [/^Sposta in/, /^Crea sotto-categoria/, /^Elimina/]) {
            const entry = page.getByRole("menuitem", { name: item });
            await expect(entry).toHaveAttribute("aria-disabled", "true");
            await expect(entry).toContainText("Salva o annulla le modifiche prima.");
        }
        await expect(page.getByRole("menuitem", { name: "Rinomina" })).not.toHaveAttribute("aria-disabled", "true");
        await page.keyboard.press("Escape");
        expect(stub.writes.filter(w => w.key.startsWith("catalog_categories."))).toHaveLength(0);
    });

    test("elimina una categoria: DELETE sul suo id", async ({ page }) => {
        stub.onWrite("catalog_categories.DELETE", () => null);
        await openCarta(page);
        // Il «⋯» del nodo compare al passaggio del puntatore.
        await node(page, "Dessert").hover();
        await main(page).getByRole("button", { name: "Azioni Dessert" }).click();
        await page.getByRole("menuitem", { name: "Elimina" }).click();
        await expect(dialog(page)).toContainText("Eliminare «Dessert»?");
        await expect(dialog(page)).toContainText("I prodotti restano.");
        await dialog(page).getByRole("button", { name: "Elimina" }).click();
        await expect.poll(() => write(stub, "catalog_categories.DELETE")).toBeTruthy();
        expect(write(stub, "catalog_categories.DELETE")!.params.get("id")).toBe(`eq.${CAT.dessert}`);
    });

    test("sposta una categoria al primo livello: PATCH con genitore e livello", async ({ page }) => {
        stub.onWrite("catalog_categories.PATCH", ({ body }) => ({ id: CAT.rossi, catalog_id: MENU.carta, name: "Rossi", created_at: new Date().toISOString(), ...(body as object) }));
        await openCarta(page);
        await selectCategory(page, "Rossi");
        await categoryMenu(page, /^Sposta in/);
        await dialog(page).getByRole("combobox", { name: "Dentro" }).selectOption({ label: "Nessuna (categoria principale)" });
        await dialog(page).getByRole("button", { name: "Sposta" }).click();
        await expect.poll(() => write(stub, "catalog_categories.PATCH")).toBeTruthy();
        const call = write(stub, "catalog_categories.PATCH")!;
        expect(call.params.get("id")).toBe(`eq.${CAT.rossi}`);
        expect(call.body).toEqual(expect.objectContaining({ parent_category_id: null, level: 1 }));
    });

    test("Traduzioni: il nome italiano si salva subito, e «Annulla» della bozza non lo riporta indietro", async ({ page }) => {
        stub.onWrite("catalog_categories.PATCH", ({ params, body }) => ({ id: params.get("id")!.slice(3), catalog_id: MENU.carta, level: 1, parent_category_id: null, sort_order: 0, created_at: new Date().toISOString(), ...(body as object) }));
        await openCarta(page);
        await selectCategory(page, "Antipasti");
        await page.getByRole("tab", { name: "Traduzioni" }).click();
        await expect(main(page).getByText("Traduzioni del nome della categoria")).toBeVisible();

        await main(page).getByRole("tabpanel").or(main(page)).getByRole("button", { name: "Modifica", exact: true }).first().click();
        await main(page).getByRole("textbox").filter({ hasText: "" }).last().fill("Stuzzichini");
        await main(page).getByRole("button", { name: "Salva", exact: true }).last().click();
        await expect.poll(() => write(stub, "catalog_categories.PATCH")).toBeTruthy();
        expect(write(stub, "catalog_categories.PATCH")!.body).toEqual(expect.objectContaining({ name: "Stuzzichini" }));
        await expect(node(page, "Stuzzichini")).toBeVisible();

        // Una bozza su un'altra categoria, poi «Annulla»: Stuzzichini resta.
        await page.getByRole("tab", { name: "Prodotti" }).click();
        await selectCategory(page, "Pizze");
        await renameCategory(page, "Pizze e focacce");
        await page.getByRole("button", { name: "Annulla", exact: true }).first().click();
        await page.getByRole("alertdialog").getByRole("button", { name: "Scarta" }).click();
        await expect(node(page, "Pizze")).toBeVisible();
        await expect(node(page, "Stuzzichini")).toBeVisible();
    });

    test("in sola lettura il dettaglio si guarda e basta", async ({ page }) => {
        await stub.revoke("catalogs.write");
        await openCarta(page);
        await stub.revoked;
        await selectCategory(page, "Antipasti");
        await expect(main(page).getByText("Olive ascolane", { exact: true })).toBeVisible();
        await expect(main(page).getByRole("button", { name: "Nuova categoria" })).toHaveCount(0);
        await expect(main(page).getByRole("button", { name: /^Azioni della/ })).toHaveCount(0);
        await expect(main(page).getByRole("button", { name: /Aggiungi prodott/ })).toHaveCount(0);
        await expect(main(page).getByRole("button", { name: /^Riordina/ })).toHaveCount(0);
        await expect(page.getByRole("checkbox", { name: "Seleziona riga" })).toHaveCount(0);
        await expect(page.getByRole("tab", { name: "Traduzioni" })).toHaveCount(0);
        // Resta solo l'apertura del prodotto.
        await actionsOf(main(page).getByText("Olive ascolane", { exact: true })).click();
        await expect(page.getByRole("menuitem")).toHaveCount(1);
        await expect(page.getByRole("menuitem", { name: /^Apri/ })).toBeVisible();
    });

    test("si apre sulla prima categoria, col conteggio nella testata", async ({ page }) => {
        await openCarta(page);
        await expect(page).toHaveURL(new RegExp(`categoryId=${CAT.antipasti}`));
        await expect(main(page).getByRole("status").filter({ hasText: /^4 prodotti$/ })).toBeVisible();
        // Le varianti non contano due volte: Pizze ha 12 prodotti su 14 righe.
        await selectCategory(page, "Pizze");
        await expect(main(page).getByRole("status").filter({ hasText: /^12 prodotti$/ })).toBeVisible();
        await selectCategory(page, "Vini");
        await expect(main(page).getByRole("status").filter({ hasText: /^1 prodotto$/ })).toBeVisible();
        // A bozza pulita la testata dice «Salvato».
        await expect(page.getByRole("status").filter({ hasText: "Salvato" }).first()).toBeVisible();
    });

    test("uscire con la bozza aperta chiede cosa fare", async ({ page }) => {
        await openCarta(page);
        await renameCategory(page, "Stuzzichini");

        await page.getByRole("navigation", { name: "Menu principale" }).getByRole("link", { name: "Prodotti" }).click();
        const guard = page.getByRole("alertdialog").filter({ hasText: "Modifiche non salvate" });
        await expect(guard).toBeVisible();
        await guard.getByRole("button", { name: "Resta" }).click();
        await expect(page).toHaveURL(new RegExp(`/catalogs/${MENU.carta}`));
        await expect(node(page, "Stuzzichini")).toBeVisible();
    });

    test("un menù inesistente non resta una pagina rotta", async ({ page }) => {
        await openList(page);
        const url = page.url().replace(/\/catalogs$/, `/catalogs/${MISSING_MENU}`);
        await page.goto(url);
        // Uno stato della pagina con il ritorno, non un rimbalzo con un toast (#246).
        await expect(main(page).getByText("Menù non trovato")).toBeVisible({ timeout: 15_000 });
        await main(page).getByRole("button", { name: "Torna a Menù" }).click();
        await expect(page).toHaveURL(/\/catalogs$/);
    });
});

for (const viewport of [
    { width: 768, height: 1024 },
    { width: 375, height: 812 }
]) {
    test.describe(`Menù a ${viewport.width}`, () => {
        // Si entra a 1280 (sotto 768 la sidebar è un cassetto) e si stringe
        // la finestra sulla pagina, come in Comande.
        test("elenco e dettaglio senza scroll di lato", async ({ page }) => {
            await openList(page);
            await page.setViewportSize(viewport);
            await expect(main(page).getByText("Carta e2e")).toBeVisible();
            await noSideScroll(page);
            await main(page).getByText("Carta e2e").click();
            await expect(page).toHaveURL(new RegExp(`/catalogs/${MENU.carta}`));
            await expect(node(page, "Antipasti")).toBeVisible({ timeout: 15_000 });
            await selectCategory(page, "Antipasti");
            await expect(main(page).getByText("Olive ascolane", { exact: true })).toBeVisible();
            // Il prezzo resta nella riga anche sul telefono.
            await expect(main(page).getByText("€5.50")).toBeVisible();
            await noSideScroll(page);
            if (viewport.width < 768) {
                // Due viste: la categoria prende il posto dell'albero, e si torna.
                await expect(node(page, "Pizze")).toHaveCount(0);
                await main(page).getByRole("button", { name: "Categorie" }).click();
                await expect(node(page, "Pizze")).toBeVisible();
                await expect(main(page).getByText("Olive ascolane", { exact: true })).toHaveCount(0);
                await expect(page).not.toHaveURL(/categoryId=/);
            } else {
                // Due colonne: l'albero resta accanto.
                await expect(node(page, "Pizze")).toBeVisible();
            }
        });

        test("il piè della tabella resta su una riga", async ({ page }) => {
            await openList(page);
            await page.setViewportSize(viewport);
            await main(page).getByText("Carta e2e").click();
            await expect(node(page, "Pizze")).toBeVisible({ timeout: 15_000 });
            await selectCategory(page, "Pizze");
            const pageSize = main(page).getByRole("combobox", { name: "Righe per pagina" });
            await expect(pageSize).toBeVisible();
            // Contatore, selettore ed eventuali frecce sulla stessa riga, e
            // nessuna etichetta spezzata su più righe.
            const middle = async (l: import("@playwright/test").Locator) => {
                const b = (await l.boundingBox())!;
                return b.y + b.height / 2;
            };
            const y = await middle(pageSize);
            const count = main(page).getByText(/^(\d+ elementi|\d+–\d+ di \d+)$/);
            expect(Math.abs((await middle(count)) - y)).toBeLessThan(4);
            expect((await count.boundingBox())!.height).toBeLessThan(28);
            const next = main(page).getByRole("button", { name: "Pagina successiva" });
            if (await next.count()) expect(Math.abs((await middle(next)) - y)).toBeLessThan(4);
            const label = main(page).getByText("Per pagina", { exact: true });
            if (await label.isVisible()) expect((await label.boundingBox())!.height).toBeLessThan(28);
        });
    });
}
