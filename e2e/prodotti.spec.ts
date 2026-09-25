import { expect, test, type Locator, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";
import {
    GROUP,
    INGREDIENT,
    MISSING_PRODUCT,
    PRODUCT,
    stubProdotti,
    type ProdottiStub,
    type WriteCall
} from "./prodottiStub";
import { StubError } from "./restStub";

/**
 * Prodotti (lotto `ds-5-prodotti`, P0). Scritto sulla pagina di **oggi**,
 * prima di ricomporla: deve restare verde passo dopo passo.
 *
 * Dati finti in `prodottiStub.ts`; permessi, azienda e sidebar veri. Nessuna
 * scrittura parte: ogni gesto che scrive ha un test di cablaggio che controlla
 * tabella, filtri e corpo. Dove un nome o un controllo cambierà nei passi
 * successivi il locator accetta quello di oggi e quello di domani.
 */

function main(page: Page) {
    return page.getByRole("main");
}

/** Il «⋯» della riga o della card che contiene `anchor`. */
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

function dialog(page: Page): Locator {
    return page.getByRole("dialog").or(page.getByRole("alertdialog")).last();
}

function write(stub: ProdottiStub, key: string): WriteCall | undefined {
    return stub.writes.find(w => w.key === key);
}

/** Il link col nome del prodotto (riga della lista o card della griglia). */
function product(page: Page, name: string): Locator {
    return main(page).getByRole("link", { name, exact: true }).first();
}

async function setView(page: Page, view: "list" | "grid"): Promise<void> {
    await page.addInitScript(v => localStorage.setItem("products_view_mode", v), view);
}

async function openList(page: Page, view: "list" | "grid" = "list"): Promise<void> {
    await setView(page, view);
    await openBusinessPage(page, "products", "Prodotti");
    await expect(product(page, "Hamburger")).toBeVisible({ timeout: 15_000 });
}

/** Ricerca in testata: il campo, o la lente della barra compatta. */
async function search(page: Page, text: string): Promise<void> {
    const field = page.getByPlaceholder(/^Cerca/).first();
    if (!(await field.isVisible().catch(() => false))) {
        await page.getByRole("button", { name: "Cerca", exact: true }).click();
    }
    await field.fill(text);
}

/** Tab della collezione in testata (oggi «Gruppi Prodotti», dopo P2 «Gruppi»). */
function collection(page: Page, name: RegExp): Locator {
    return page.getByRole("tab", { name });
}

/** Apre una collezione: la tab, o il selettore di sezione della barra compatta. */
async function openCollection(page: Page, name: RegExp): Promise<void> {
    const tab = collection(page, name);
    if (await tab.isVisible().catch(() => false)) {
        await tab.click();
        return;
    }
    await main(page).getByRole("button", { name: /^(Prodotti|Gruppi|Ingredienti|Attributi)/ }).first().click();
    await page.getByRole("menuitem", { name }).click();
}

const QUALITY_VALUE = { "Senza prezzo": "missing-price", "Fuori menù": "out-of-catalog", Tutti: "all" } as const;

/** Filtro di qualità: chip (dopo P2) o `Select` (oggi). */
async function quality(page: Page, name: keyof typeof QUALITY_VALUE): Promise<void> {
    const chip = main(page).getByRole("radio", { name: new RegExp(`^${name}`) });
    if ((await chip.count()) > 0) {
        await chip.click();
        return;
    }
    await page.getByRole("combobox", { name: "Filtra per stato del prodotto" }).selectOption(QUALITY_VALUE[name]);
}

async function noSideScroll(page: Page): Promise<void> {
    const overflow = await page.evaluate(() => {
        const de = document.documentElement;
        const scrollers = [de, ...Array.from(document.querySelectorAll<HTMLElement>("main"))];
        return Math.max(...scrollers.map(el => el.scrollWidth - el.clientWidth));
    });
    expect(overflow).toBeLessThanOrEqual(0);
}

async function openProduct(page: Page, id: string, tab?: string): Promise<void> {
    if (!/\/business\/[0-9a-f-]+\//.test(page.url())) await openBusinessPage(page, "products", "Prodotti");
    const url = page.url().replace(/\/business\/([0-9a-f-]+)\/.*$/, `/business/$1/products/${id}${tab ? `?tab=${tab}` : ""}`);
    await page.goto(url);
}

let stub: ProdottiStub;

test.beforeEach(async ({ page }) => {
    stub = await stubProdotti(page);
});

test.describe("Prodotti — elenco", () => {
    // Oggi a 1280 la testata con il filtro di qualità va in barra compatta,
    // dove il filtro non c'è: la pagina di oggi si prova dove si vede intera.
    test.use({ viewport: { width: 1440, height: 900 } });

    test("testata: collezioni, ricerca, vista, crea", async ({ page }) => {
        await openList(page);
        await expect(page).toHaveTitle(/^Prodotti — .+ \| CataloGlobe$/);
        await expect(collection(page, /^Prodotti$/)).toBeVisible();
        await expect(collection(page, /^Gruppi$/)).toBeVisible();
        await expect(collection(page, /^Ingredienti$/)).toBeVisible();
        // Ristorante: niente Attributi.
        await expect(collection(page, /^Attributi$/)).toHaveCount(0);
        await expect(page.getByRole("radio", { name: "Vista griglia" })).toBeVisible();
        await expect(page.getByRole("radio", { name: "Vista lista" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Crea prodotto" })).toBeVisible();
    });

    test("lista: prezzi, formati, varianti espandibili", async ({ page }) => {
        await openList(page);
        await search(page, "Patatine");
        await expect(product(page, "Patatine")).toBeVisible();
        await expect(main(page).getByText(/da (€\s*)?2[.,]50/)).toBeVisible();

        await search(page, "Coca");
        await expect(product(page, "Coca-Cola")).toBeVisible();
        await expect(product(page, "Coca-Cola Zero")).toHaveCount(0);
        await main(page).getByRole("button", { name: /^Espandi|^Mostra varianti/ }).first().click();
        await expect(product(page, "Coca-Cola Zero")).toBeVisible();
        await expect(product(page, "Coca-Cola Light")).toBeVisible();
        await expect(main(page).getByText("Variante").first()).toBeVisible();
    });

    test("riga: prezzo e menù nella riga muta, formati e difetti a parole", async ({ page }) => {
        await openList(page);
        const row = (name: string) => product(page, name).locator("xpath=ancestor::*[@role='row'][1]");
        await expect(row("Hamburger")).toContainText("€ 2,90 · in 2 menù");
        await expect(row("Patatine")).toContainText("da € 2,50 · in 2 menù");
        await expect(row("Patatine")).toContainText("3 formati");
        await expect(row("Muffin al cioccolato")).toContainText("€ 2,20 · in nessun menù");
        await expect(row("Insalatona")).toContainText("senza prezzo · in nessun menù");
        // La descrizione non sta nella riga: è nella Scheda.
        await expect(main(page).getByText("Carne 100% bovino", { exact: false })).toHaveCount(0);

        // Variante: eredita il prezzo e i menù del padre.
        await search(page, "Coca");
        await main(page).getByRole("button", { name: "Mostra varianti di Coca-Cola" }).click();
        await expect(main(page).getByRole("button", { name: "Nascondi varianti di Coca-Cola" })).toHaveAttribute("aria-expanded", "true");
        await expect(row("Coca-Cola Zero")).toContainText("€ 2,50 (ereditato) · in 1 menù");
    });

    test("vista predefinita: lista", async ({ page }) => {
        await openBusinessPage(page, "products", "Prodotti");
        await expect(product(page, "Hamburger")).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole("radio", { name: "Vista lista" })).toHaveAttribute("aria-checked", "true");
    });

    test("errore di caricamento: lo stato lo dice, «Riprova» ricarica", async ({ page }) => {
        let fail = true;
        await page.route(/\/rest\/v1\/products\?/, route =>
            fail && route.request().method() === "GET" ? route.fulfill({ status: 500, json: { message: "e2e" } }) : route.fallback()
        );
        await setView(page, "list");
        await openBusinessPage(page, "products", "Prodotti");
        await expect(main(page).getByText("Non è stato possibile caricare i prodotti")).toBeVisible({ timeout: 15_000 });
        fail = false;
        await main(page).getByRole("button", { name: "Riprova" }).click();
        await expect(product(page, "Hamburger")).toBeVisible();
    });

    test("ricerca e vuoto filtrato", async ({ page }) => {
        await openList(page);
        await search(page, "nessun prodotto si chiama così");
        await expect(main(page).getByText("Nessun risultato")).toBeVisible();
    });

    test("filtri di qualità coi conteggi", async ({ page }) => {
        await openList(page);
        // I conteggi: nelle etichette dei chip (dopo P2) o delle opzioni della select (oggi).
        const control = main(page)
            .getByRole("radiogroup", { name: /qualità|stato/i })
            .or(page.getByRole("combobox", { name: "Filtra per stato del prodotto" }))
            .first();
        await expect(control).toContainText(/Senza prezzo\s*\(?1\)?/);
        await expect(control).toContainText(/Fuori menù\s*\(?2\)?/);

        await quality(page, "Senza prezzo");
        await expect(product(page, "Insalatona")).toBeVisible();
        await expect(product(page, "Hamburger")).toHaveCount(0);

        await quality(page, "Fuori menù");
        await expect(product(page, "Insalatona")).toBeVisible();
        await expect(product(page, "Muffin al cioccolato")).toBeVisible();
        await expect(product(page, "Hamburger")).toHaveCount(0);

        await quality(page, "Tutti");
        await expect(product(page, "Hamburger")).toBeVisible();
    });

    test("chip di qualità a 1280 sopra l'elenco; a zero spento, non nascosto", async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        const insalatona = stub.tables.products.find(p => p.id === PRODUCT.insalatona)!;
        insalatona.base_price = 6;
        await openList(page);
        const chips = main(page).getByRole("radiogroup", { name: "Filtra per qualità del dato" });
        await expect(chips.getByRole("radio", { name: /^Tutti 12$/ })).toHaveAttribute("aria-checked", "true");
        await expect(chips.getByRole("radio", { name: /^Senza prezzo 0$/ })).toHaveAttribute("aria-disabled", "true");
        await expect(chips.getByRole("radio", { name: /^Fuori menù 2$/ })).toBeVisible();
    });

    test("attributi e gruppi: la ricerca è in testata", async ({ page }) => {
        await openList(page);
        await openCollection(page, /^Gruppi$/);
        await expect(main(page).getByText("Bevande e2e", { exact: true })).toBeVisible();
        await search(page, "Contorni");
        await expect(main(page).getByText("Contorni e2e", { exact: true })).toBeVisible();
        await expect(main(page).getByText("Bevande e2e", { exact: true })).toHaveCount(0);
    });

    test("griglia: una card per prodotto e per variante", async ({ page }) => {
        await openList(page, "grid");
        await expect(product(page, "Hamburger")).toBeVisible();
        await expect(main(page).getByText("Coca-Cola Zero")).toBeVisible();
        await expect(main(page).getByRole("list", { name: "Prodotti" }).getByRole("listitem")).toHaveCount(14);
        await page.getByRole("radio", { name: "Vista lista" }).click();
        await expect(main(page).getByRole("checkbox", { name: "Seleziona tutte le righe" })).toBeVisible();
    });

    test("kebab della riga", async ({ page }) => {
        await openList(page);
        await search(page, "Cheeseburger");
        await actionsOf(product(page, "Cheeseburger")).click();
        for (const item of [/^Aggiungi variante$/i, /^Duplica$/, /^Elimina$/]) {
            await expect(page.getByRole("menuitem", { name: item })).toBeVisible();
        }
        // «Modifica» nel drawer non c'è più (§50.9/5): «Apri» porta alla pagina.
        await expect(page.getByRole("menuitem", { name: /^Modifica/ })).toHaveCount(0);
        await page.getByRole("menuitem", { name: "Apri" }).click();
        await expect(page).toHaveURL(new RegExp(`/products/${PRODUCT.cheeseburger}$`));
    });

    test("crea un prodotto: POST col nome e il prezzo", async ({ page }) => {
        stub.onWrite("products.POST", call => [{ ...(call.body as object), id: "e2e0d000-0000-4000-a000-000000000900", tenant_id: stub.tables.products[0].tenant_id }]);
        stub.onWrite("products.PATCH", call => [call.body]);
        stub.onWrite("rpc.replace_product_allergens", () => null);
        stub.onWrite("rpc.replace_product_ingredients", () => null);
        stub.onWrite("product_attribute_values.POST", () => []);
        stub.onWrite("rpc.enqueue_translation_jobs", () => null);
        stub.onWrite("translation_jobs.POST", () => []);
        await openList(page);
        await page.getByRole("button", { name: "Crea prodotto" }).click();
        const name = dialog(page).getByRole("textbox", { name: /^Nome/ });
        // Il form mette il fuoco sul nome appena montato: si scrive dopo.
        await expect(name).toBeFocused();
        await name.fill("Panino e2e");
        await dialog(page).getByRole("spinbutton", { name: /^Prezzo base/ }).fill("6.5");
        await dialog(page).getByRole("button", { name: /^Crea$/ }).click();
        await expect.poll(() => write(stub, "products.POST")?.body).toMatchObject({ name: "Panino e2e", base_price: 6.5 });
    });

    test("duplica: POST della copia", async ({ page }) => {
        stub.onWrite("products.POST", call => [{ ...(call.body as object), id: "e2e0d000-0000-4000-a000-000000000901" }]);
        stub.onWrite("rpc.enqueue_translation_jobs", () => null);
        stub.onWrite("translation_jobs.POST", () => []);
        await openList(page);
        await search(page, "Cheeseburger");
        await actionsOf(product(page, "Cheeseburger")).click();
        await page.getByRole("menuitem", { name: "Duplica" }).click();
        await expect.poll(() => write(stub, "products.POST")?.body).toMatchObject({ name: "Cheeseburger (Copia)" });
    });

    test("elimina un prodotto: impatto e DELETE", async ({ page }) => {
        stub.onWrite("products.DELETE", () => null);
        stub.onWrite("translations.DELETE", () => null);
        stub.onWrite("translation_jobs.DELETE", () => null);
        await openList(page);
        await search(page, "Hamburger");
        await actionsOf(product(page, "Hamburger")).click();
        await page.getByRole("menuitem", { name: /^Elimina$/ }).click();
        // L'impatto: sta in due menù.
        await expect(page.getByRole("alertdialog")).toContainText("Eliminare «Hamburger»?");
        await expect(page.getByRole("alertdialog")).toContainText("2 menù");
        await dialog(page).getByRole("button", { name: /^(Conferma eliminazione|Elimina)$/i }).click();
        await expect.poll(() => write(stub, "products.DELETE")?.params.get("id")).toBe(`eq.${PRODUCT.hamburger}`);
    });

    test("elimina più prodotti: conferma col conteggio, annulla rimette la selezione", async ({ page }) => {
        stub.onWrite("products.DELETE", () => null);
        stub.onWrite("translations.DELETE", () => null);
        stub.onWrite("translation_jobs.DELETE", () => null);
        await openList(page);
        await search(page, "burger");
        await checkboxOf(product(page, "Hamburger")).check();
        await checkboxOf(product(page, "Cheeseburger")).check();
        await page.getByRole("button", { name: /^Elimina/ }).last().click();

        const confirm = page.getByRole("alertdialog");
        await expect(confirm).toContainText("Eliminare 2 prodotti?");
        await confirm.getByRole("button", { name: "Annulla" }).click();
        await expect(confirm).toHaveCount(0);
        expect(stub.writes.filter(w => w.key === "products.DELETE")).toHaveLength(0);
        await expect(checkboxOf(product(page, "Hamburger"))).toBeChecked();

        await page.getByRole("button", { name: /^Elimina/ }).last().click();
        await confirm.getByRole("button", { name: "Elimina 2 prodotti" }).click();
        await expect.poll(() => stub.writes.filter(w => w.key === "products.DELETE").length).toBe(2);
    });

    test("senza products.write: niente crea, selezione, «⋯»", async ({ page }) => {
        await stub.revoke("products.write");
        await openList(page);
        await stub.revoked;
        await expect(page.getByRole("button", { name: "Crea prodotto" })).toHaveCount(0);
        await expect(main(page).getByRole("checkbox", { name: "Seleziona riga" })).toHaveCount(0);
        await expect(main(page).getByRole("button", { name: /^Azioni/ })).toHaveCount(0);

        await page.getByRole("radio", { name: "Vista griglia" }).click();
        await expect(product(page, "Hamburger")).toBeVisible();
        await expect(main(page).getByRole("button", { name: /^Azioni/ })).toHaveCount(0);

        await openCollection(page, /^Gruppi( Prodotti)?$/);
        await expect(main(page).getByText("Panini e2e", { exact: true }).first()).toBeVisible();
        await expect(main(page).getByRole("button", { name: /^Azioni/ })).toHaveCount(0);
        await expect(page.getByRole("button", { name: /^(Crea|Nuovo) gruppo$/ })).toHaveCount(0);

        await openCollection(page, /^Ingredienti$/);
        await expect(main(page).getByText("Cipolla", { exact: true })).toBeVisible();
        await expect(main(page).getByRole("button", { name: /^Azioni/ })).toHaveCount(0);
        await expect(main(page).getByRole("checkbox", { name: "Seleziona riga" })).toHaveCount(0);
    });
});

test.describe("Prodotti — gruppi e ingredienti", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("gruppi: albero, conteggi, sottogruppo solo al primo livello", async ({ page }) => {
        await openList(page);
        await openCollection(page, /^Gruppi( Prodotti)?$/);
        const panini = main(page).getByText("Panini e2e", { exact: true }).first();
        await expect(panini).toBeVisible();
        await expect(main(page).getByText("Manzo e2e", { exact: true })).toBeVisible();
        await expect(main(page).getByText(/2 prodotti/).first()).toBeVisible();

        await actionsOf(panini).click();
        await expect(page.getByRole("menuitem", { name: "Crea sottogruppo" })).toBeVisible();
        await page.keyboard.press("Escape");
        await actionsOf(main(page).getByText("Manzo e2e", { exact: true })).click();
        await expect(page.getByRole("menuitem", { name: "Crea sottogruppo" })).toHaveCount(0);
    });

    test("gruppi: crea (POST) ed elimina (DELETE)", async ({ page }) => {
        stub.onWrite("product_groups.POST", call => [{ ...(call.body as object), id: "e2e0d000-0000-4000-a000-000000000950" }]);
        stub.onWrite("product_groups.DELETE", () => null);
        await openList(page);
        await openCollection(page, /^Gruppi( Prodotti)?$/);
        await page.getByRole("button", { name: /^(Crea|Nuovo) gruppo$/ }).click();
        await dialog(page).getByRole("textbox", { name: /Nome/ }).fill("Dolci e2e");
        await dialog(page).getByRole("button", { name: /^(Crea|Salva)/ }).click();
        await expect.poll(() => write(stub, "product_groups.POST")?.body).toMatchObject({ name: "Dolci e2e" });

        await actionsOf(main(page).getByText("Bevande e2e", { exact: true })).click();
        await page.getByRole("menuitem", { name: "Elimina" }).click();
        await dialog(page).getByRole("button", { name: /^Elimina/ }).click();
        await expect.poll(() => write(stub, "product_groups.DELETE")?.params.get("id")).toBe(`eq.${GROUP.bevande}`);
    });

    test("gruppi ed ingredienti: l'eliminazione multipla chiede conferma", async ({ page }) => {
        stub.onWrite("product_groups.DELETE", () => null);
        stub.onWrite("ingredients.DELETE", call =>
            call.params.get("id") === `eq.${INGREDIENT.pane}` ? new StubError(409, { code: "23503", message: "fk" }) : null
        );
        await openList(page);
        await openCollection(page, /^Gruppi( Prodotti)?$/);
        await checkboxOf(main(page).getByText("Contorni e2e", { exact: true })).check();
        await checkboxOf(main(page).getByText("Bevande e2e", { exact: true })).check();
        await page.getByRole("button", { name: /^Elimina/ }).last().click();
        await page.getByRole("alertdialog").getByRole("button", { name: "Elimina 2 gruppi" }).click();
        await expect.poll(() => stub.writes.filter(w => w.key === "product_groups.DELETE").length).toBe(2);

        await openCollection(page, /^Ingredienti$/);
        await checkboxOf(main(page).getByText("Pane", { exact: true })).check();
        await checkboxOf(main(page).getByText("Cipolla", { exact: true })).check();
        await page.getByRole("button", { name: /^Elimina/ }).last().click();
        await page.getByRole("alertdialog").getByRole("button", { name: "Elimina 2 ingredienti" }).click();
        await expect(page.getByText("1 ingrediente eliminato.")).toBeVisible();
        await expect(page.getByText(/1 ingrediente non eliminato: usato/)).toBeVisible();
    });

    test("ingredienti: elenco, eliminazione bloccata dall'uso", async ({ page }) => {
        stub.onWrite("ingredients.DELETE", () => new StubError(409, { code: "23503", message: "fk" }));
        await openList(page);
        await openCollection(page, /^Ingredienti$/);
        for (const name of ["Pane", "Carne bovina", "Cipolla"]) {
            await expect(main(page).getByText(name, { exact: true })).toBeVisible();
        }
        await actionsOf(main(page).getByText("Pane", { exact: true })).click();
        await page.getByRole("menuitem", { name: "Elimina" }).click();
        const confirm = dialog(page);
        const button = confirm.getByRole("button", { name: /^(Conferma eliminazione|Elimina)$/i });
        if (await button.isEnabled()) {
            await button.click();
            await expect(page.getByText(/utilizzato|usato/i).first()).toBeVisible();
        }
        expect(stub.writes.filter(w => w.key === "ingredients.DELETE").every(w => w.params.get("id") === `eq.${INGREDIENT.pane}`)).toBe(true);
    });
});

test.describe("Prodotti — negozio", () => {
    test.use({ viewport: { width: 1440, height: 900 } });
    test.beforeEach(async ({ page }) => {
        await page.unrouteAll({ behavior: "ignoreErrors" });
        stub = await stubProdotti(page, { vertical: "retail" });
    });

    test("attributi: suggeriti e personalizzati", async ({ page }) => {
        await openList(page);
        await expect(collection(page, /^Attributi$/)).toBeVisible();
        await expect(collection(page, /^Ingredienti$/)).toHaveCount(0);
        await openCollection(page, /^Attributi$/);
        await expect(main(page).getByText("Materiale", { exact: true })).toBeVisible();
        await expect(main(page).getByText("Taglia", { exact: true })).toBeVisible();
        await expect(main(page).getByText("Colore", { exact: true })).toBeVisible();
        await search(page, "tag");
        await expect(main(page).getByText("Taglia", { exact: true })).toBeVisible();
        await expect(main(page).getByText("Colore", { exact: true })).toHaveCount(0);
    });

    test("senza attributes.write: attributi in sola lettura", async ({ page }) => {
        await stub.revoke("attributes.write");
        await openList(page);
        await stub.revoked;
        await openCollection(page, /^Attributi$/);
        await expect(main(page).getByText("Taglia", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: /^(Nuovo|Crea) attributo$/ })).toHaveCount(0);
        await expect(main(page).getByRole("button", { name: /^Azioni/ })).toHaveCount(0);
    });

    test("scheda: tab Attributi, niente allergeni né ingredienti", async ({ page }) => {
        await openProduct(page, PRODUCT.hamburger);
        await expect(page.getByRole("tab", { name: "Attributi" })).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByText("Allergeni", { exact: true })).toHaveCount(0);
    });
});

test.describe("Prodotti — dettaglio", () => {
    test("tab e briciola", async ({ page }) => {
        await openProduct(page, PRODUCT.hamburger);
        for (const tab of ["Scheda", "Prezzi & Opzioni", "Traduzioni", "Utilizzo"]) {
            await expect(page.getByRole("tab", { name: tab })).toBeVisible({ timeout: 15_000 });
        }
        await expect(page.getByRole("tab", { name: "Attributi" })).toHaveCount(0);
        await expect(page.getByRole("navigation", { name: "Breadcrumb" }).getByText("Hamburger")).toBeVisible();
    });

    test("senza products.write: sola lettura, niente Salva", async ({ page }) => {
        await stub.revoke("products.write");
        await openProduct(page, PRODUCT.hamburger);
        await stub.revoked;
        const name = main(page).getByRole("textbox", { name: /^Nome/ });
        await expect(name).toHaveValue("Hamburger", { timeout: 15_000 });
        await expect(name).toBeDisabled();
        await expect(main(page).getByText(/^Sola lettura/)).toBeVisible();
        await expect(page.getByRole("button", { name: /^Salva/ })).toHaveCount(0);
        await page.getByRole("tab", { name: "Prezzi & Opzioni" }).click();
        await expect(main(page).getByRole("button", { name: /^Modifica/ }).first()).toBeDisabled();
    });

    test("una variante non ha Traduzioni", async ({ page }) => {
        await openProduct(page, PRODUCT.cocaZero);
        await expect(page.getByRole("tab", { name: "Scheda" })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole("tab", { name: "Traduzioni" })).toHaveCount(0);
    });

    test("scheda: bozza, Annulla e Salva (PATCH del nome)", async ({ page }) => {
        stub.onWrite("products.PATCH", call => [{ ...stub.tables.products[0], ...(call.body as object) }]);
        stub.onWrite("rpc.enqueue_translation_jobs", () => null);
        stub.onWrite("translation_jobs.POST", () => []);
        await openProduct(page, PRODUCT.hamburger);
        const name = main(page).getByRole("textbox", { name: /^Nome/ });
        await expect(name).toHaveValue("Hamburger", { timeout: 15_000 });
        await expect(main(page).getByText("Carne bovina")).toBeVisible();
        await expect(main(page).getByText("Provenienza").first()).toBeVisible();

        await name.fill("Hamburger e2e");
        await page.getByRole("button", { name: "Annulla" }).first().click();
        const discard = page.getByRole("alertdialog");
        if (await discard.isVisible().catch(() => false)) await discard.getByRole("button", { name: /Annulla le modifiche|Scarta|Esci senza/ }).click();
        await expect(name).toHaveValue("Hamburger");

        await name.fill("Hamburger e2e");
        await page.getByRole("button", { name: /^Salva( modifiche)?$/ }).first().click();
        await expect.poll(() => write(stub, "products.PATCH")?.body).toMatchObject({ name: "Hamburger e2e" });
        expect(write(stub, "products.PATCH")?.params.get("id")).toBe(`eq.${PRODUCT.hamburger}`);
    });

    test("prezzi: prezzo unico (PATCH) e formati", async ({ page }) => {
        stub.onWrite("products.PATCH", call => [{ ...stub.tables.products[0], ...(call.body as object) }]);
        await openProduct(page, PRODUCT.hamburger, "prezzi-opzioni");
        await expect(main(page).getByText(/2[.,]90/).first()).toBeVisible({ timeout: 15_000 });
        await main(page).getByRole("button", { name: /^Modifica( prezzo)?$/ }).first().click();
        await main(page).getByRole("spinbutton").first().fill("3.2");
        await main(page).getByRole("button", { name: /^Salva( prezzo)?$/ }).first().click();
        await expect.poll(() => write(stub, "products.PATCH")?.body).toMatchObject({ base_price: 3.2 });

        await openProduct(page, PRODUCT.patatine, "prezzi-opzioni");
        for (const format of ["Piccole", "Medie", "Grandi"]) {
            await expect(main(page).getByText(format, { exact: true })).toBeVisible({ timeout: 15_000 });
        }
    });

    test("redirect legacy ?tab=pricing", async ({ page }) => {
        await openProduct(page, PRODUCT.hamburger, "pricing");
        await expect(page.getByRole("tab", { name: "Prezzi & Opzioni" })).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
    });

    test("utilizzo: menù e regole", async ({ page }) => {
        await openProduct(page, PRODUCT.hamburger, "usage");
        await expect(main(page).getByText("Carta e2e").first()).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByText("Pranzo e2e").first()).toBeVisible();
        await expect(main(page).getByText("Menu weekend e2e")).toBeVisible();
    });

    test("prodotto inesistente", async ({ page }) => {
        await openProduct(page, MISSING_PRODUCT);
        await expect(main(page).getByText(/non trovato/i).first()).toBeVisible({ timeout: 15_000 });
        await main(page).getByRole("button", { name: /^Torna/ }).or(main(page).getByRole("link", { name: /^Torna/ })).first().click();
        await expect(page).toHaveURL(/\/products$/);
    });
});

test.describe("Prodotti — larghezze", () => {
    for (const width of [1280, 768, 375]) {
        test(`${width}: elenco e dettaglio senza scroll di lato`, async ({ page }) => {
            await openList(page);
            await page.setViewportSize({ width, height: 900 });
            await page.reload();
            await expect(product(page, "Hamburger")).toBeVisible({ timeout: 15_000 });
            await noSideScroll(page);
            await openProduct(page, PRODUCT.hamburger);
            await expect(main(page).getByRole("textbox", { name: /^Nome/ })).toBeVisible({ timeout: 15_000 });
            await noSideScroll(page);
        });
    }
});
