import { expect, test, type Page } from "@playwright/test";
import { openBusinessPageByUrl } from "./business";
import { MENU, PRODUCT, SEDE, TENANT_ID, stubProgrammazione, type ProgrammazioneStub, type WriteCall } from "./programmazioneStub";
import { StubError, type Row } from "./restStub";

/**
 * I tunnel di creazione (D124): menù, stile, in evidenza e storia, a passi
 * dentro l'app. Dati di Programmazione (`programmazioneStub.ts`): sedi, gruppi,
 * menù, stili, prodotti e regole finti; permessi e azienda veri. Ogni
 * scrittura ha la sua risposta finta qui sotto; quelle non previste
 * rispondono 500.
 */

const ID = {
    catalog: "e2ec7000-0000-4000-a000-000000000001",
    category: "e2ec7000-0000-4000-a000-000000000002",
    rule: "e2ec7000-0000-4000-a000-000000000003",
    style: "e2ec7000-0000-4000-a000-000000000004",
    version: "e2ec7000-0000-4000-a000-000000000005",
    featured: "e2ec7000-0000-4000-a000-000000000006",
    story: "e2ec7000-0000-4000-a000-000000000007"
};

const first = (body: unknown): Row => (Array.isArray(body) ? (body[0] as Row) : ((body ?? {}) as Row));
const writesOf = (stub: ProgrammazioneStub, key: string): WriteCall[] => stub.writes.filter(w => w.key === key);
const bodyOf = (stub: ProgrammazioneStub, key: string) => first(writesOf(stub, key)[0]?.body);

function main(page: Page) {
    return page.getByRole("main");
}
const button = (page: Page, name: string | RegExp) => main(page).getByRole("button", { name, exact: typeof name === "string" });
const next = (page: Page) => button(page, "Avanti").click();
/** La fila dei passi (nella barra in alto c'è anche la lista del percorso). */
const rail = (page: Page) => main(page).getByRole("list").filter({ has: page.getByRole("button", { name: /Controlla$/ }) });

async function open(page: Page, slug: string, da = "panoramica") {
    await openBusinessPageByUrl(page, `crea/${slug}?da=${da}`);
    await expect(main(page).getByRole("heading", { level: 2 })).toBeVisible({ timeout: 20_000 });
}

/** Le letture che il menù fa prima di mettere un piatto in una sezione: niente di già messo. */
async function emptyCategories(page: Page) {
    await page.route(/\/rest\/v1\/(catalog_categories|catalog_category_products)(\?|$)/, route =>
        route.request().method() === "GET" ? route.fulfill({ json: [] }) : route.fallback()
    );
}

/** La regola nuova nel Calendario: creata spenta, poi accesa con quando, dove e cosa. */
function wireRule(stub: ProgrammazioneStub) {
    stub.onWrite("schedules.POST", () => ({ id: ID.rule }));
    stub.onWrite("schedules.PATCH", () => [{ id: ID.rule }]);
    stub.onWrite("schedule_layout.POST", () => null);
    stub.onWrite("rpc.update_schedule_targets", () => null);
}

function wireMenu(stub: ProgrammazioneStub) {
    stub.onWrite("catalogs.POST", ({ body }) => ({ id: ID.catalog, created_at: new Date().toISOString(), ...first(body) }));
    stub.onWrite("catalog_categories.POST", ({ body }) => ({ id: ID.category, ...first(body) }));
    stub.onWrite("products.POST", ({ body }) => ({ ...first(body) }));
    stub.onWrite("catalog_category_products.POST", ({ body }) => ({ id: "e2ec7000-0000-4000-a000-000000000010", ...first(body) }));
}

async function walkMenu(page: Page, name = "  Pranzo veloce  ") {
    await button(page, /^Menù classico/).click();
    await next(page);
    await main(page).getByLabel("Nome del menù").fill(name);
    await next(page);
    await main(page).getByLabel("Nome della sezione").fill("Pizze");
    await main(page).getByLabel("Nome della sezione").press("Enter");
    // un piatto che c'è già, preso dai suggerimenti, e uno nuovo col prezzo
    await main(page).getByLabel("Nome del piatto").fill("Marg");
    await main(page).getByRole("option", { name: /Margherita e2e/ }).click();
    await main(page).getByLabel("Nome del piatto").fill("Capricciosa");
    await main(page).getByLabel("Prezzo").fill("9,5");
    await main(page).getByLabel("Prezzo").press("Enter");
    await expect(main(page).getByText("nuovo", { exact: true })).toHaveCount(1);
}

/** Il menù letto dall'AI (D165, D172): un piatto che c'è già, uno nuovo e incerto, una sezione vuota. */
function wireAiRead(stub: ProgrammazioneStub) {
    stub.onWrite("fn.menu-ai-import", () => ({
        success: true,
        data: {
            categories: [
                {
                    name: "Pizze",
                    items: [
                        { name: "Margherita e2e", description: null, base_price: 7, product_type: "simple", confidence: "high" },
                        { name: "Bufalina", description: "Mozzarella di bufala", base_price: 9.5, product_type: "simple", confidence: "low" }
                    ]
                },
                { name: "Bibite", items: [] }
            ]
        }
    }));
}

/** Una foto qualsiasi: l'edge è finta, conta solo che parta. */
const PHOTO = { name: "menu.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64") };
const photoInput = (page: Page) => main(page).locator('input[type="file"][aria-label="Foto o PDF del menù"]');

async function readPhoto(page: Page) {
    await button(page, /^Menù classico/).click();
    await next(page);
    await main(page).getByLabel("Nome del menù").fill("Carta");
    await button(page, /^Da una foto o un PDF/).click();
    await photoInput(page).setInputFiles(PHOTO);
}

let stub: ProgrammazioneStub;

/** Il menù «Carta e2e» com'è nel database: due sezioni, tre piatti. */
const CARTA = { pizze: "e2ed1400-0000-4000-a000-000000000001", dolci: "e2ed1400-0000-4000-a000-000000000002", link: (n: number) => "e2ed1400-0000-4000-a000-00000000010" + n };
async function cartaCom(page: Page) {
    const cat = (id: string, name: string, sort_order: number) => ({ id, tenant_id: TENANT_ID, catalog_id: MENU.carta, parent_category_id: null, name, sort_order, level: 1, created_at: "2026-01-01" });
    const link = (n: number, category_id: string, product_id: string) => ({ id: CARTA.link(n), tenant_id: TENANT_ID, catalog_id: MENU.carta, category_id, product_id, variant_product_id: null, sort_order: n, created_at: "2026-01-01" });
    await page.route(/\/rest\/v1\/catalog_categories\?/, r => (r.request().method() === "GET" ? r.fulfill({ json: [cat(CARTA.pizze, "Pizze", 0), cat(CARTA.dolci, "Dolci", 1)] }) : r.fallback()));
    await page.route(/\/rest\/v1\/catalog_category_products\?/, r =>
        r.request().method() === "GET" ? r.fulfill({ json: [link(0, CARTA.pizze, PRODUCT.margherita), link(1, CARTA.pizze, PRODUCT.diavola), link(2, CARTA.dolci, PRODUCT.tiramisu)] }) : r.fallback()
    );
}

test("Tunnel di modifica dal clic sulla riga: già dentro, un passo alla volta, senza niente di scelto (D175)", async ({ page }) => {
    stub = await stubProgrammazione(page);
    await cartaCom(page);
    await openBusinessPageByUrl(page, `crea/menu/${MENU.carta}?da=menu&dentro=1`);
    await expect(main(page).getByRole("heading", { name: "Il nome" })).toBeVisible({ timeout: 20_000 });
    await next(page);
    await expect(main(page).getByRole("heading", { name: "Sezioni e piatti" })).toBeVisible();
});

test.describe("Tunnel: modificare una cosa già creata (D140)", () => {
    test.beforeEach(async ({ page }) => {
        stub = await stubProgrammazione(page);
        await cartaCom(page);
        await openBusinessPageByUrl(page, `crea/menu/${MENU.carta}?da=menu`);
        await expect(main(page).getByRole("heading", { name: "Cosa vuoi modificare?" })).toBeVisible({ timeout: 20_000 });
    });

    test("il passo 0: «Avanti» va solo ai passi scelti, e senza modifiche non si salva", async ({ page }) => {
        await expect(button(page, "Avanti")).toBeDisabled();
        await expect(main(page).getByText("Scegli almeno una cosa")).toBeVisible();
        await expect(button(page, "Tieni come bozza")).toHaveCount(0);
        await main(page).getByRole("checkbox", { name: /^Sezioni e piatti/ }).click();
        await next(page);
        await expect(main(page).getByRole("heading", { name: "Sezioni e piatti" })).toBeVisible();
        await next(page);
        await expect(main(page).getByRole("heading", { name: "Controlla" })).toBeVisible();
        await expect(button(page, "Salva le modifiche")).toBeDisabled();
        await expect(main(page).getByText("Non hai cambiato niente")).toBeVisible();
    });

    test("si salva solo quello che è cambiato; un passo grigio toccato lo chiede Controlla", async ({ page }) => {
        stub.onWrite("catalogs.PATCH", () => ({ id: MENU.carta, tenant_id: TENANT_ID, name: "Carta d'autunno" }));
        stub.onWrite("catalog_category_products.DELETE", () => []);
        await main(page).getByRole("checkbox", { name: /^Sezioni e piatti/ }).click();
        await next(page);
        await button(page, "Togli Diavola e2e").click();
        // un passo non scelto: ci si va lo stesso, e toccandolo diventa da guardare
        await rail(page).getByRole("button", { name: /Il nome$/ }).click();
        await main(page).getByLabel("Nome del menù").fill("Carta d'autunno");
        await next(page);
        await next(page);
        await expect(main(page).getByText("Hai cambiato anche «Il nome», che non avevi scelto: guardalo prima di salvare.")).toBeVisible();
        await button(page, "Salva le modifiche").click();
        await expect(page.getByText("Modifiche salvate.")).toBeVisible();
        expect(bodyOf(stub, "catalogs.PATCH")).toMatchObject({ name: "Carta d'autunno" });
        const gone = writesOf(stub, "catalog_category_products.DELETE");
        expect(gone).toHaveLength(1);
        expect(gone[0].params.get("id")).toBe("eq." + CARTA.link(1));
        // niente altro: né sezioni, né regole
        expect(stub.writes.map(w => w.key).filter(k => !/^(catalogs\.PATCH|catalog_category_products\.DELETE)$/.test(k))).toEqual([]);
        await expect(page).toHaveURL(/\/catalogs$/);
    });

    test("uscire con una modifica fatta chiede prima", async ({ page }) => {
        await rail(page).getByRole("button", { name: /Il nome$/ }).click();
        await main(page).getByLabel("Nome del menù").fill("Altro");
        await button(page, "Esci").click();
        const dlg = page.getByRole("alertdialog", { name: "Uscire dal tunnel?" });
        await expect(dlg.getByRole("button")).toHaveText(["Resta qui", "Esci senza salvare", "Salva le modifiche ed esci"]);
        await dlg.getByRole("button", { name: "Esci senza salvare" }).click();
        await expect(page).toHaveURL(/\/catalogs$/);
        expect(stub.writes).toEqual([]);
    });
});

test.describe("Tunnel di creazione — ingressi", () => {
    test.beforeEach(async ({ page }) => {
        stub = await stubProgrammazione(page);
    });

    test("Panoramica: «Cosa vuoi creare?» apre i quattro tunnel", async ({ page }) => {
        await openBusinessPageByUrl(page, "overview");
        const tile = (slug: string) => main(page).locator(`a[href$="/crea/${slug}?da=panoramica"]`);
        await expect(tile("menu")).toHaveCount(1, { timeout: 15_000 });
        await expect(tile("stile")).toHaveCount(1);
        await expect(tile("evidenza")).toHaveCount(1);
        await expect(tile("storia")).toHaveCount(1);
        await tile("stile").click();
        await expect(page).toHaveURL(/\/crea\/stile\?da=panoramica$/);
        await expect(main(page).getByRole("heading", { level: 2, name: "Nuovo stile" })).toBeVisible();
        await expect(page).toHaveTitle(/Nuovo stile/);
    });

    test("il percorso torna da dove si è partiti; un indirizzo sbagliato va alla Panoramica", async ({ page }) => {
        await open(page, "evidenza", "evidenza");
        const crumb = main(page).getByRole("navigation", { name: "Percorso" });
        await expect(crumb.getByRole("button", { name: "In evidenza" })).toBeVisible();
        await expect(crumb.getByText("Nuovo contenuto in evidenza")).toBeVisible();
        await crumb.getByRole("button", { name: "In evidenza" }).click();
        await expect(page).toHaveURL(/\/featured$/);
        await page.goto(page.url().replace(/\/featured$/, "/crea/altro"));
        await expect(page).toHaveURL(/\/overview$/);
    });
});

test.describe("Tunnel di creazione — menù", () => {
    test.beforeEach(async ({ page }) => {
        stub = await stubProgrammazione(page);
        await emptyCategories(page);
    });

    test("i passi: Avanti si accende quando il passo è fatto, i fatti si riaprono", async ({ page }) => {
        await open(page, "menu");
        const steps = rail(page);
        await expect(steps.getByRole("button")).toHaveText(["1Che menù è", "2Da dove parti", "3Sezioni e piatti", "4Dove e quando", "5Controlla", "E adesso?"]);
        await expect(button(page, "Avanti")).toBeDisabled();
        await expect(main(page).getByText("Scegli che menù è")).toBeVisible();
        // il multi menù arriva col database nuovo
        await expect(button(page, /^Multi menù/)).toBeDisabled();
        await button(page, /^Menù classico/).click();
        await next(page);
        await expect(main(page).getByRole("heading", { level: 2 })).toHaveText("Nuovo menù");
        await main(page).getByLabel("Nome del menù").fill("Cena");
        await expect(main(page).getByRole("heading", { level: 2 })).toHaveText("Nuovo menù · Cena");
        // il passo fatto si riapre dalla fila
        await steps.getByRole("button", { name: /Che menù è/ }).click();
        await expect(button(page, /^Menù classico/)).toHaveAttribute("aria-pressed", "true");
        await expect(steps.getByRole("button", { name: /Controlla/ })).toBeDisabled();
    });

    test("Tieni come bozza: menù, sezioni e piatti, niente nel Calendario; si atterra sul menù", async ({ page }) => {
        wireMenu(stub);
        await open(page, "menu", "menu");
        await walkMenu(page);
        await button(page, "Tieni come bozza").click();
        await expect(page).toHaveURL(new RegExp(`/catalogs/${ID.catalog}$`), { timeout: 15_000 });
        // il nome senza gli spazi ai lati (#240)
        expect(bodyOf(stub, "catalogs.POST")).toMatchObject({ name: "Pranzo veloce" });
        expect(bodyOf(stub, "catalog_categories.POST")).toMatchObject({ name: "Pizze", catalog_id: ID.catalog, level: 1 });
        expect(writesOf(stub, "products.POST")).toHaveLength(1);
        expect(bodyOf(stub, "products.POST")).toMatchObject({ name: "Capricciosa" });
        expect(writesOf(stub, "catalog_category_products.POST")).toHaveLength(2);
        expect(writesOf(stub, "schedules.POST")).toHaveLength(0);
    });

    test("Metti in onda: la regola nel Calendario, poi «E adesso?» e «Ho finito»", async ({ page }) => {
        wireMenu(stub);
        wireRule(stub);
        await open(page, "menu");
        await walkMenu(page, "Pranzo veloce");
        await next(page);
        // Dove e quando, un passo solo (D145): le sedi col bottone del Calendario, poi solo Porto
        await expect(main(page).getByRole("heading", { name: "Dove e quando" })).toBeVisible();
        await main(page).getByRole("button", { name: /^Tutte le sedi · \d+, anche le nuove$/ }).click();
        await page.getByRole("dialog", { name: "Sedi" }).getByRole("button", { name: "Solo Porto e2e" }).click();
        await page.keyboard.press("Escape");
        await expect(main(page).getByRole("button", { name: "Porto e2e", exact: true })).toBeVisible();
        // sotto, il quando: prima la domanda, poi il modulo del Calendario
        await expect(button(page, /^Sempre/)).toHaveAttribute("aria-pressed", "true");
        await button(page, /^Solo in certi momenti/).click();
        await expect(main(page).getByText("Anteprima · Menù")).toBeVisible();
        await next(page);
        await expect(main(page).getByRole("heading", { name: "Controlla" })).toBeVisible();
        await expect(main(page).getByText(/dal lunedì al venerdì, dalle 12:00 alle 15:00/)).toBeVisible();
        await expect(main(page).getByText("Cosa cambia nel calendario")).toBeVisible();
        await button(page, "Metti in onda").click();
        await expect(main(page).getByRole("heading", { level: 2, name: "Pranzo veloce è in onda" })).toBeVisible({ timeout: 15_000 });
        expect(bodyOf(stub, "schedules.POST")).toMatchObject({ rule_type: "layout", name: expect.stringMatching(/^Pranzo veloce/) });
        const on = writesOf(stub, "schedules.PATCH").map(w => first(w.body)).find(b => "time_mode" in b);
        expect(on).toMatchObject({ enabled: true, days_of_week: [1, 2, 3, 4, 5], time_from: "12:00", time_to: "15:00" });
        expect(bodyOf(stub, "schedule_layout.POST")).toMatchObject({ catalog_id: ID.catalog, schedule_id: ID.rule });
        expect(bodyOf(stub, "rpc.update_schedule_targets")).toMatchObject({ p_targets: [{ target_type: "activity", target_id: SEDE.porto }] });
        // «E adesso?»: tre strade e «Ho finito»
        await expect(button(page, /^Dagli i tuoi colori/)).toBeVisible();
        await expect(button(page, /^Metti qualcosa in evidenza/)).toBeVisible();
        await expect(button(page, /^Racconta una storia/)).toBeVisible();
        await expect(button(page, "Tieni come bozza")).toHaveCount(0);
        await button(page, /^Ho finito/).click();
        await expect(page).toHaveURL(new RegExp(`/catalogs/${ID.catalog}$`));
    });

    test("da «E adesso?»: lo stile ha il quando e il dove del menù, finito si torna lì", async ({ page }) => {
        wireMenu(stub);
        wireRule(stub);
        stub.onWrite("styles.POST", ({ body }) => ({ id: ID.style, ...first(body) }));
        stub.onWrite("style_versions.POST", ({ body }) => ({ id: ID.version, ...first(body) }));
        stub.onWrite("styles.PATCH", ({ body }) => ({ id: ID.style, name: "Pranzo", ...first(body) }));
        await open(page, "menu");
        await walkMenu(page, "Pranzo veloce");
        await next(page);
        await button(page, /^Solo in certi momenti/).click();
        await next(page);
        await button(page, "Metti in onda").click();
        await button(page, /^Dagli i tuoi colori/).click({ timeout: 15_000 });
        await expect(main(page).getByText("Fa parte di «Pranzo veloce»: finito, si torna a «E adesso?».")).toBeVisible();
        await next(page);
        await main(page).getByLabel("Nome dello stile").fill("Pranzo");
        await next(page);
        await button(page, "Blu").click();
        await next(page);
        await expect(button(page, /^Solo in certi momenti/)).toHaveAttribute("aria-pressed", "true");
        await expect(main(page).getByText("Già compilato dal menù «Pranzo veloce»: puoi cambiarlo.")).toBeVisible();
        await next(page);
        await button(page, "Metti in onda").click();
        await expect(main(page).getByRole("heading", { level: 2, name: "Pranzo veloce è in onda" })).toBeVisible({ timeout: 15_000 });
        await expect(button(page, /^Dagli i tuoi colori/)).toContainText("Fatto: puoi aggiungerne un altro.");
    });

    test("Esci con qualcosa scritto: «Resta qui» resta, «Esci senza salvare» torna indietro", async ({ page }) => {
        await open(page, "menu", "menu");
        // senza niente scritto si esce subito
        await button(page, "Esci").click();
        await expect(page).toHaveURL(/\/catalogs$/);
        await page.goBack();
        await button(page, /^Menù classico/).click();
        await button(page, "Esci").click();
        const dlg = page.getByRole("alertdialog", { name: "Uscire dal tunnel?" });
        await expect(dlg).toBeVisible();
        await expect(dlg.getByRole("button")).toHaveText(["Resta qui", "Esci senza salvare", "Tieni come bozza ed esci"]);
        await dlg.getByRole("button", { name: "Resta qui" }).click();
        await expect(dlg).toBeHidden();
        await expect(button(page, /^Menù classico/)).toHaveAttribute("aria-pressed", "true");
        await button(page, "Esci").click();
        await dlg.getByRole("button", { name: "Esci senza salvare" }).click();
        await expect(page).toHaveURL(/\/catalogs$/);
        expect(stub.writes.filter(w => !w.key.startsWith("rpc."))).toHaveLength(0);
    });

    test("il salvataggio che non riesce lo dice, e si resta nel tunnel", async ({ page }) => {
        await open(page, "menu");
        await walkMenu(page);
        await button(page, "Tieni come bozza").click();
        await expect(page.getByText("Non siamo riusciti a salvare il menù. Riprova.")).toBeVisible();
        await expect(page).toHaveURL(/\/crea\/menu/);
    });

    test("da una foto (D165, D172): letti sezioni e piatti, si controllano e solo il Salva scrive il menù", async ({ page }) => {
        wireAiRead(stub);
        stub.onWrite("rpc.import_products_into_catalog", () => ({
            catalog_id: ID.catalog,
            created_categories: 1,
            created_products: 1,
            reused_products: 1,
            skipped: 0,
            product_ids: ["e2ec7000-0000-4000-a000-000000000011"],
            category_ref_map: {}
        }));
        await open(page, "menu", "menu");
        await readPhoto(page);
        await expect(main(page).getByText(/Letti 1 sezione e 2 piatti/)).toBeVisible();
        // ancora niente scritto: la lettura non crea il menù
        expect(stub.writes.filter(w => !w.key.startsWith("fn.") && !w.key.startsWith("rpc."))).toHaveLength(0);
        await next(page);
        await expect(main(page).getByText(/Uno è segnato «da controllare»/)).toBeVisible();
        await expect(main(page).getByText("da controllare", { exact: true })).toHaveCount(1);
        // il piatto che c'è già è collegato, l'altro è nuovo
        await expect(main(page).getByText("nuovo", { exact: true })).toHaveCount(1);
        // si toglie e si aggiunge come se l'avessi scritto tu
        await button(page, "Togli Bufalina").click();
        await main(page).getByLabel("Nome del piatto").fill("Bufalina");
        await main(page).getByLabel("Prezzo").fill("10");
        await main(page).getByLabel("Prezzo").press("Enter");
        await expect(main(page).getByText("da controllare", { exact: true })).toHaveCount(0);
        await next(page);
        await next(page);
        await button(page, "Tieni come bozza").click();
        await expect(page).toHaveURL(new RegExp(`/catalogs/${ID.catalog}$`), { timeout: 15_000 });
        const rpc = bodyOf(stub, "rpc.import_products_into_catalog");
        expect(rpc).toMatchObject({ p_catalog_id: null, p_new_catalog_name: "Carta" });
        expect(rpc.p_categories).toEqual([expect.objectContaining({ name: "Pizze", existing_id: null })]);
        expect(rpc.p_products).toEqual([
            expect.objectContaining({ action: "reuse", product_id: PRODUCT.margherita, sort_order: 0 }),
            expect.objectContaining({ action: "create", sort_order: 1, product: expect.objectContaining({ name: "Bufalina", base_price: 10 }) })
        ]);
        // un colpo solo: niente menù, sezioni o piatti scritti uno per uno
        expect(writesOf(stub, "catalogs.POST")).toHaveLength(0);
        expect(writesOf(stub, "products.POST")).toHaveLength(0);
    });

    test("da una foto: uscendo prima del Salva non si scrive niente; la quota finita lo dice", async ({ page }) => {
        stub.onWrite("fn.menu-ai-import", () => new StubError(402, { error: "quota", reason: "quota_exhausted", reset_at: null }));
        await open(page, "menu", "menu");
        await readPhoto(page);
        await expect(main(page).getByRole("alert")).toBeVisible();
        await expect(button(page, "Carica foto o PDF")).toBeEnabled();
        wireAiRead(stub);
        await photoInput(page).setInputFiles(PHOTO);
        await expect(main(page).getByText(/Letti 1 sezione e 2 piatti/)).toBeVisible();
        await expect(main(page).getByRole("alert")).toHaveCount(0);
        await button(page, "Esci").click();
        await page.getByRole("alertdialog", { name: "Uscire dal tunnel?" }).getByRole("button", { name: "Esci senza salvare" }).click();
        await expect(page).toHaveURL(/\/catalogs$/);
        expect(stub.writes.filter(w => !w.key.startsWith("fn.") && !w.key.startsWith("rpc."))).toHaveLength(0);
        expect(writesOf(stub, "rpc.import_products_into_catalog")).toHaveLength(0);
    });

    test("dal Calendario: «Crea un menù nuovo» tiene da parte la bozza e apre il tunnel", async ({ page }) => {
        await openBusinessPageByUrl(page, "scheduling?type=layout");
        // Calendario e Regole sono le parti della sezione: tab nella barra del titolo.
        await page.getByRole("navigation", { name: "Parti di Calendario" }).getByRole("link", { name: "Calendario", exact: true }).click();
        await expect(page).toHaveURL(/[?&]vista=calendario/);
        await main(page).getByRole("button", { name: "Aggiungi", exact: true }).click();
        await main(page).getByRole("button", { name: /^Menù/ }).first().click();
        await expect(main(page).getByText("Si crea nel tunnel di creazione, dove scegli se è classico o multi: si esce dal Calendario.")).toBeVisible();
        await main(page).getByRole("button", { name: /Crea un menù nuovo/ }).click();
        await expect(page.getByText("Creare un menù nuovo?")).toBeVisible();
        await expect(page.getByText("Si apre il tunnel di creazione: tieni da parte la bozza, e il suo quando e il suo dove vengono con te.")).toBeVisible();
        await page.getByRole("button", { name: "Tieni da parte e vai" }).click();
        await expect(page).toHaveURL(/\/crea\/menu\?da=calendario$/);
        await expect(main(page).getByRole("heading", { level: 2, name: "Nuovo menù" })).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByRole("navigation", { name: "Percorso" }).getByRole("button", { name: "Calendario" })).toBeVisible();
        expect(await page.evaluate(() => sessionStorage.getItem("calendario:da-parte"))).toContain('"kind":"menu"');
    });

    test("dal Calendario con una bozza tenuta da parte: il suo quando e il suo dove", async ({ page }) => {
        await page.addInitScript(porto => {
            const d = { kind: "menu", mode: "new", rule: null, thing: null, pair: null, when: { days: [5, 6] }, where: { all: false, activityIds: [porto], groupIds: [] } };
            sessionStorage.setItem("calendario:da-parte", JSON.stringify(d));
        }, SEDE.porto);
        await open(page, "menu", "calendario");
        await expect(main(page).getByRole("navigation", { name: "Percorso" }).getByRole("button", { name: "Calendario" })).toBeVisible();
        await walkMenu(page);
        await next(page);
        await main(page).getByRole("button", { name: "Porto e2e", exact: true }).click();
        const pop = page.getByRole("dialog", { name: "Sedi" });
        await expect(pop.getByRole("checkbox", { name: "Porto e2e" })).toBeChecked();
        await expect(pop.getByRole("checkbox", { name: "Centro e2e" })).not.toBeChecked();
        await page.keyboard.press("Escape");
        await expect(button(page, /^Solo in certi momenti/)).toHaveAttribute("aria-pressed", "true");
        await expect(main(page).getByText("Dalla bozza che hai tenuto da parte nel Calendario: puoi cambiarlo.")).toBeVisible();
        // uscire senza salvare lascia la bozza dov'è
        await button(page, "Esci").click();
        await page.getByRole("alertdialog").getByRole("button", { name: "Esci senza salvare" }).click();
        await expect(page).toHaveURL(/\/scheduling$/);
        expect(await page.evaluate(() => sessionStorage.getItem("calendario:da-parte"))).toContain('"kind":"menu"');
    });
});

test.describe("Tunnel di creazione — stile, in evidenza, storia", () => {
    test.beforeEach(async ({ page }) => {
        stub = await stubProgrammazione(page);
    });

    test("stile: quattro scelte, la bozza ha i token giusti e si atterra sull'editor", async ({ page }) => {
        stub.onWrite("styles.POST", ({ body }) => ({ id: ID.style, ...first(body) }));
        stub.onWrite("style_versions.POST", ({ body }) => ({ id: ID.version, ...first(body) }));
        stub.onWrite("styles.PATCH", ({ body }) => ({ id: ID.style, name: "Natale", ...first(body) }));
        await open(page, "stile", "stili");
        await next(page);
        await main(page).getByLabel("Nome dello stile").fill("Natale");
        await next(page);
        await expect(button(page, "Avanti")).toBeDisabled();
        await button(page, "Rosso").click();
        await button(page, "Scuro").click();
        await button(page, "Lora").click();
        await button(page, "Compatti").click();
        await button(page, "Tieni come bozza").click();
        await expect(page).toHaveURL(new RegExp(`/styles/${ID.style}$`), { timeout: 15_000 });
        expect(bodyOf(stub, "styles.POST")).toMatchObject({ name: "Natale", is_system: false });
        const config = JSON.stringify(bodyOf(stub, "style_versions.POST").config);
        expect(config).toContain("#be123c");
        expect(config).toContain("#0F172A");
        expect(config).toContain("lora");
        expect(config).toContain("compact");
        expect(writesOf(stub, "schedules.POST")).toHaveLength(0);
    });

    test("in evidenza: una promo coi suoi piatti, pubblicata e nel Calendario", async ({ page }) => {
        stub.onWrite("featured_contents.POST", ({ body }) => ({ id: ID.featured, ...first(body) }));
        stub.onWrite("featured_content_products.POST", () => null);
        stub.onWrite("schedules.POST", () => ({ id: ID.rule }));
        stub.onWrite("schedules.PATCH", () => null);
        stub.onWrite("schedule_featured_contents.DELETE", () => null);
        stub.onWrite("schedule_featured_contents.POST", () => null);
        await open(page, "evidenza", "evidenza");
        await button(page, /^Promo/).click();
        await next(page);
        await main(page).getByLabel("Titolo", { exact: true }).fill("Pizza del giorno");
        await next(page);
        await expect(main(page).getByRole("heading", { name: "Piatti" })).toBeVisible();
        await main(page).getByRole("checkbox", { name: /Margherita e2e/ }).click();
        await next(page);
        await next(page);
        await button(page, "Pubblica").click();
        await expect(page).toHaveURL(new RegExp(`/featured/${ID.featured}$`), { timeout: 15_000 });
        expect(bodyOf(stub, "featured_contents.POST")).toMatchObject({ title: "Pizza del giorno", status: "published", content_type: "promo" });
        expect(writesOf(stub, "featured_content_products.POST")).toHaveLength(1);
        expect(bodyOf(stub, "schedule_featured_contents.POST")).toMatchObject({ featured_content_id: ID.featured, slot: "before_catalog" });
    });

    test("storia: racconto e blocchi, pubblicata", async ({ page }) => {
        stub.onWrite("stories.POST", ({ body }) => ({ id: ID.story, ...first(body) }));
        stub.onWrite("stories.PATCH", ({ body }) => ({ id: ID.story, ...first(body) }));
        await open(page, "storia", "storie");
        await next(page);
        await main(page).getByLabel("Occhiello").fill("Il forno");
        await main(page).getByLabel("Titolo", { exact: true }).fill("Il forno a legna");
        await next(page);
        // un bottone per tipo di blocco, sotto i blocchi
        await expect(main(page).getByRole("button", { name: "Aggiungi", exact: true })).toHaveCount(0);
        await button(page, "Testo").click();
        await main(page).getByRole("textbox", { name: "Scrivi un paragrafo..." }).fill("Lo accendiamo alle sei.");
        await next(page);
        // la storia ha un orario solo: niente «hanno le stesse ore?»
        await expect(main(page).getByRole("radio", { name: "No, cambiano" })).toHaveCount(0);
        await next(page);
        await button(page, "Pubblica").click();
        await expect(page).toHaveURL(new RegExp(`/stories/${ID.story}$`), { timeout: 15_000 });
        expect(bodyOf(stub, "stories.POST")).toMatchObject({ title: "Il forno a legna", eyebrow: "Il forno", status: "draft" });
        const done = bodyOf(stub, "stories.PATCH");
        expect(done).toMatchObject({ status: "published" });
        expect(JSON.stringify(done.body_blocks)).toContain("Lo accendiamo alle sei.");
    });
});

test.describe("Tunnel di creazione — chi non gestisce il Calendario", () => {
    test("niente Quando né Dove; «Salva» lascia la bozza a chi gestisce il Calendario", async ({ page }) => {
        stub = await stubProgrammazione(page);
        await stub.revoke("scheduling.write");
        await open(page, "evidenza");
        await stub.revoked;
        await expect(rail(page).getByRole("button")).toHaveText(["1Che cosa", "2Il contenuto", "3Controlla"]);
        await button(page, /^Annuncio/).click();
        await next(page);
        await main(page).getByLabel("Titolo", { exact: true }).fill("Chiusi per ferie");
        await next(page);
        await expect(button(page, "Salva")).toBeVisible();
        await expect(button(page, "Pubblica")).toHaveCount(0);
    });
});

test.describe("Tunnel di creazione — misure", () => {
    for (const size of [
        { width: 1470, height: 830, name: "MacBook Air 13\"" },
        { width: 1280, height: 720, name: "finestra bassa" }
    ]) {
        test(`${size.name}: niente scroll di lato, il telefono sta tutto sotto la testa`, async ({ page }) => {
            await page.setViewportSize(size);
            stub = await stubProgrammazione(page);
            await open(page, "stile");
            const phone = main(page).getByRole("complementary", { name: "Così lo vede il cliente" });
            await expect(phone).toBeVisible();
            const box = (await phone.boundingBox())!;
            const head = (await main(page).getByRole("heading", { level: 2 }).boundingBox())!;
            expect(box.y).toBeGreaterThan(head.y);
            expect(box.y + box.height).toBeLessThanOrEqual(size.height);
            const side = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            expect(side).toBeLessThanOrEqual(0);
        });
    }

    test("375: il telefono si nasconde, i passi restano usabili", async ({ page }) => {
        stub = await stubProgrammazione(page);
        await open(page, "menu");
        // al telefono la barra laterale è chiusa: si entra da computer e si stringe
        await page.setViewportSize({ width: 375, height: 760 });
        await expect(main(page).getByRole("complementary", { name: "Così lo vede il cliente" })).toBeHidden();
        await button(page, /^Menù classico/).click();
        await expect(button(page, "Avanti")).toBeEnabled();
        const side = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(side).toBeLessThanOrEqual(0);
    });
});
