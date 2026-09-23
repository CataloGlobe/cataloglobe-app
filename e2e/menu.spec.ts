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

function dialog(page: Page): Locator {
    return page.getByRole("dialog").last();
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
    await expect(main(page).getByRole("heading", { name, exact: true }).or(main(page).getByText(name, { exact: true }).nth(1))).toBeVisible();
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
        await expect(carta).toContainText(/7 (categorie|portate)/);
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
        await dialog(page).getByRole("textbox", { name: /Nome/ }).fill("Cena");
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

    test("eliminazione multipla: oggi parte senza conferma", async ({ page }) => {
        stub.onWrite("catalogs.DELETE", () => null);
        await openList(page);
        await page.getByRole("radio", { name: "Vista lista" }).click();
        await checkboxOf(main(page).getByText("Carta e2e")).check();
        await checkboxOf(main(page).getByText("Vuoto e2e")).check();
        await page.getByRole("toolbar", { name: "Azioni sulla selezione" }).getByRole("button", { name: /Elimina/ }).click();
        await expect.poll(() => stub.writes.filter(w => w.key === "catalogs.DELETE").length).toBe(2);
        const ids = stub.writes.filter(w => w.key === "catalogs.DELETE").map(w => w.params.get("id"));
        expect(ids.sort()).toEqual([`eq.${MENU.carta}`, `eq.${MENU.vuoto}`].sort());
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

    test("bozza: rinomina, Annulla ripristina, Salva manda il PATCH del nome", async ({ page }) => {
        stub.onWrite("catalog_categories.PATCH", ({ body }) => ({ id: CAT.antipasti, catalog_id: MENU.carta, level: 1, parent_category_id: null, sort_order: 0, created_at: new Date().toISOString(), ...(body as object) }));
        await openCarta(page);
        await selectCategory(page, "Antipasti");

        const rename = async (name: string) => {
            await main(page).getByRole("button", { name: "Modifica categoria" }).click();
            await dialog(page).getByRole("textbox", { name: /Nome/ }).fill(name);
            await dialog(page).getByRole("button", { name: /^(Salva|Applica)$/ }).click();
            await expect(node(page, name)).toBeVisible();
        };

        await rename("Stuzzichini");
        expect(stub.writes.filter(w => w.key === "catalog_categories.PATCH")).toHaveLength(0);
        await page.getByRole("button", { name: /^Annulla( modifiche)?$/ }).first().click();
        // Dopo P3 l'«Annulla» della testata chiede conferma.
        const discard = page.getByRole("button", { name: /^(Annulla modifiche|Scarta|Esci senza salvare)$/ });
        if (await discard.isVisible().catch(() => false)) await discard.click();
        await expect(node(page, "Antipasti")).toBeVisible();

        await rename("Stuzzichini");
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

    test("crea una categoria principale: POST con livello e genitore", async ({ page }) => {
        stub.onWrite("catalog_categories.POST", ({ body }) => ({ id: "e2e0c000-0000-4000-a000-000000000999", created_at: new Date().toISOString(), ...(body as object[])[0] }));
        await openCarta(page);
        await main(page).getByRole("button", { name: /^(Crea categoria principale|Nuova (categoria|portata))$/ }).first().click();
        await dialog(page).getByRole("textbox", { name: /Nome/ }).fill("Contorni");
        await dialog(page).getByRole("button", { name: /^(Salva|Crea)$/ }).click();
        await expect.poll(() => write(stub, "catalog_categories.POST")).toBeTruthy();
        expect(write(stub, "catalog_categories.POST")!.body).toEqual([
            expect.objectContaining({ catalog_id: MENU.carta, name: "Contorni", level: 1, parent_category_id: null })
        ]);
    });

    test("con la bozza aperta non si crea una categoria", async ({ page }) => {
        await openCarta(page);
        await selectCategory(page, "Antipasti");
        await main(page).getByRole("button", { name: "Modifica categoria" }).click();
        await dialog(page).getByRole("textbox", { name: /Nome/ }).fill("Stuzzichini");
        await dialog(page).getByRole("button", { name: /^(Salva|Applica)$/ }).click();
        await expect(node(page, "Stuzzichini")).toBeVisible();

        const create = main(page).getByRole("button", { name: /^(Crea categoria principale|Nuova (categoria|portata))$/ }).first();
        if (await create.isEnabled()) await create.click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        expect(stub.writes.filter(w => w.key === "catalog_categories.POST")).toHaveLength(0);
    });

    test("elimina una categoria: DELETE sul suo id", async ({ page }) => {
        stub.onWrite("catalog_categories.DELETE", () => null);
        await openCarta(page);
        // Il «⋯» del nodo compare al passaggio del puntatore.
        await node(page, "Dessert").hover();
        await actionsOf(node(page, "Dessert")).click();
        await page.getByRole("menuitem", { name: "Elimina" }).click();
        await dialog(page).getByRole("button", { name: "Elimina" }).click();
        await expect.poll(() => write(stub, "catalog_categories.DELETE")).toBeTruthy();
        expect(write(stub, "catalog_categories.DELETE")!.params.get("id")).toBe(`eq.${CAT.dessert}`);
    });

    test("sposta una categoria al primo livello: PATCH con genitore e livello", async ({ page }) => {
        stub.onWrite("catalog_categories.PATCH", ({ body }) => ({ id: CAT.rossi, catalog_id: MENU.carta, name: "Rossi", created_at: new Date().toISOString(), ...(body as object) }));
        await openCarta(page);
        await selectCategory(page, "Rossi");
        await main(page).getByRole("button", { name: "Modifica categoria" }).click();
        await dialog(page).getByRole("combobox", { name: /Sposta/ }).selectOption({ label: "Nessuna (categoria principale)" });
        await dialog(page).getByRole("button", { name: /^(Salva|Sposta)$/ }).click();
        await expect.poll(() => write(stub, "catalog_categories.PATCH")).toBeTruthy();
        const call = write(stub, "catalog_categories.PATCH")!;
        expect(call.params.get("id")).toBe(`eq.${CAT.rossi}`);
        expect(call.body).toEqual(expect.objectContaining({ parent_category_id: null, level: 1 }));
    });

    test("la scheda Traduzioni c'è", async ({ page }) => {
        await openCarta(page);
        await selectCategory(page, "Antipasti");
        await page.getByRole("tab", { name: "Traduzioni" }).click();
        await expect(main(page).getByText(/Traduzioni nome categoria/)).toBeVisible();
    });

    test("un menù inesistente non resta una pagina rotta", async ({ page }) => {
        await openList(page);
        const url = page.url().replace(/\/catalogs$/, `/catalogs/${MISSING_MENU}`);
        await page.goto(url);
        // Oggi rimbalza all'elenco; dopo P3 è uno stato «non trovato» con il ritorno.
        await expect(
            main(page).getByText("Carta e2e").or(main(page).getByText(/non trovato/))
        ).toBeVisible({ timeout: 15_000 });
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
            await noSideScroll(page);
        });
    });
}
