import { expect, test, type Page } from "@playwright/test";
import { openBusinessPageByUrl } from "./business";
import { FEATURED, MENU, PRODUCT, RULE, SEDE, STYLE, TENANT_ID, stubProgrammazione, type ProgrammazioneStub, type WriteCall } from "./programmazioneStub";
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
/** «Avanti» con qualcosa che manca: resta acceso, non va avanti e lo dice sotto l'elemento da sistemare. */
const stuck = async (page: Page, why: string) => {
    await expect(button(page, "Avanti")).toBeEnabled();
    await next(page);
    await expect(main(page).getByRole("alert").filter({ hasText: why })).toBeVisible();
};
/** Ogni creazione finisce con «E adesso?» (D194): «Ho finito» porta alla sua pagina. */
const finito = async (page: Page) => {
    await expect(main(page).getByRole("heading", { name: "E adesso?" })).toBeVisible({ timeout: 15_000 });
    await button(page, /^Ho finito/).click();
};
/** «Dove» (D189): prima la domanda, «Sì, lo metto in onda». */
const onAir = (page: Page) => button(page, /^Sì, (lo|la) metto in onda/).click();
/** «In quali sedi?»: il riquadro delle sedi del passo «Dove», sempre aperto. */
/** La seconda parte del «Quando»: in quelle ore c'è già un altro, e si sceglie cosa fare. */
const insieme = async (page: Page, name: string) => {
    await expect(main(page).getByRole("navigation", { name: "Parti del Quando" }).getByRole("button", { name: /^2/ })).toHaveAttribute("aria-current", "step");
    await main(page).locator("[data-insieme]").getByRole("button", { name: new RegExp("^" + name) }).click();
};
const sediBox = (page: Page) => main(page).getByRole("group", { name: "Sedi" });
const allSedi = (page: Page) => sediBox(page).getByRole("checkbox", { name: /^Tutte le sedi, anche le nuove/ });
/** Dal passo prima di «Dove» fino a «Controlla», tenendolo pronto: niente sedi né orari, e il «Quando» si salta. */
async function toReady(page: Page) {
    await next(page);
    await button(page, /^No, per ora (lo|la) tengo pront/).click();
    await next(page);
    await expect(main(page).getByRole("heading", { name: "Controlla" })).toBeVisible();
}
const saveReady = (page: Page) => button(page, /^Salva e tieni pront/).click();

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
    await main(page).getByLabel("Nome del menù").fill(name);
    await next(page);
    await button(page, "Aggiungi una categoria").click();
    await main(page).getByLabel("Nome della categoria").fill("Pizze");
    await main(page).getByLabel("Nome della categoria").press("Enter");
    // un piatto che c'è già, preso dai suggerimenti, e uno nuovo: il prezzo si scrive sulla riga
    const dish = main(page).getByLabel("Piatto da aggiungere a Pizze");
    await dish.fill("Marg");
    await main(page).getByRole("option", { name: /Margherita e2e/ }).click();
    await dish.fill("Capricciosa");
    await dish.press("Enter");
    // il prezzo del piatto nuovo si apre da solo
    await main(page).getByLabel("Prezzo di Capricciosa").fill("9,5");
    await main(page).getByLabel("Prezzo di Capricciosa").press("Enter");
    await expect(button(page, "Togli Capricciosa")).toBeVisible();
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
    await main(page).getByLabel("Nome del menù").fill("Carta");
    await button(page, /^Da una foto o un PDF/).click();
    // la foto si carica nel passo dopo, che si apre già sull'import (D180)
    await next(page);
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
    await expect(main(page).getByRole("heading", { name: "Categorie e piatti" })).toBeVisible();
});

test.describe("Tunnel: modificare una cosa già creata (D140)", () => {
    test.beforeEach(async ({ page }) => {
        stub = await stubProgrammazione(page);
        await cartaCom(page);
        await openBusinessPageByUrl(page, `crea/menu/${MENU.carta}?da=menu`);
        await expect(main(page).getByRole("heading", { name: "Cosa vuoi modificare?" })).toBeVisible({ timeout: 20_000 });
    });

    test("il passo 0: «Avanti» va solo ai passi scelti, e senza modifiche non si salva", async ({ page }) => {
        await stuck(page, "Scegli almeno una cosa");
        await main(page).getByRole("checkbox", { name: /^Categorie e piatti/ }).click();
        await next(page);
        await expect(main(page).getByRole("heading", { name: "Categorie e piatti" })).toBeVisible();
        await next(page);
        await expect(main(page).getByRole("heading", { name: "Controlla" })).toBeVisible();
        await expect(button(page, "Salva le modifiche")).toBeDisabled();
        await expect(main(page).getByText("Non hai cambiato niente")).toBeVisible();
    });

    test("da «Controlla», se manca qualcosa «Salva le modifiche» porta al passo e al campo", async ({ page }) => {
        await main(page).getByRole("checkbox", { name: /^Il nome/ }).click();
        await next(page);
        await main(page).getByLabel("Nome del menù").fill("");
        await rail(page).getByRole("button", { name: /Controlla$/ }).click();
        await expect(main(page).getByRole("heading", { name: "Controlla" })).toBeVisible();
        await button(page, "Salva le modifiche").click();
        // niente si salva: si torna al nome, segnato e col fuoco
        await expect(main(page).getByRole("alert").filter({ hasText: "Manca il nome del menù" })).toBeVisible();
        await expect(main(page).getByLabel("Nome del menù")).toBeFocused();
        await expect(main(page).getByLabel("Nome del menù")).toHaveClass(/bad/);
        // sistemato, il segno va via
        await main(page).getByLabel("Nome del menù").fill("Carta d'autunno");
        await expect(main(page).getByRole("alert").filter({ hasText: "Manca il nome del menù" })).toHaveCount(0);
        await expect(main(page).getByLabel("Nome del menù")).not.toHaveClass(/bad/);
        expect(stub.writes).toEqual([]);
    });

    test("si salva solo quello che è cambiato; un passo grigio toccato lo chiede Controlla", async ({ page }) => {
        stub.onWrite("catalogs.PATCH", () => ({ id: MENU.carta, tenant_id: TENANT_ID, name: "Carta d'autunno" }));
        stub.onWrite("catalog_category_products.DELETE", () => []);
        await main(page).getByRole("checkbox", { name: /^Categorie e piatti/ }).click();
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

    test("trascinare una categoria dentro un'altra (D177): il Salva la sposta, senza toccare i piatti", async ({ page }) => {
        stub.onWrite("catalog_categories.PATCH", ({ body }) => [{ id: CARTA.dolci, ...first(body) }]);
        await main(page).getByRole("checkbox", { name: /^Categorie e piatti/ }).click();
        await next(page);
        const row = (name: string) => main(page).locator("[data-tree] [data-drag]", { hasText: name });
        const a = (await row("Dolci").boundingBox())!;
        const b = (await row("Pizze").boundingBox())!;
        await page.mouse.move(a.x + 90, a.y + a.height / 2);
        await page.mouse.down();
        await page.mouse.move(a.x + 95, a.y, { steps: 3 });
        await page.mouse.move(b.x + 90, b.y + b.height / 2, { steps: 6 });
        await page.mouse.up();
        await expect(button(page, "Porta fuori da Pizze")).toBeVisible();
        await next(page);
        await button(page, "Salva le modifiche").click();
        await expect(page.getByText("Modifiche salvate.")).toBeVisible();
        const moved = writesOf(stub, "catalog_categories.PATCH");
        expect(moved).toHaveLength(1);
        expect(moved[0].params.get("id")).toBe("eq." + CARTA.dolci);
        expect(first(moved[0].body)).toMatchObject({ parent_category_id: CARTA.pizze, level: 2 });
        expect(stub.writes.map(w => w.key).filter(k => k !== "catalog_categories.PATCH")).toEqual([]);
    });

    test("uscire con una modifica fatta chiede prima", async ({ page }) => {
        await rail(page).getByRole("button", { name: /Il nome$/ }).click();
        await main(page).getByLabel("Nome del menù").fill("Altro");
        await button(page, "Esci").click();
        const dlg = page.getByRole("alertdialog", { name: "Uscire dal tunnel?" });
        await expect(dlg.getByRole("button")).toHaveText(["Resta", "Esci senza salvare", "Salva le modifiche ed esci"]);
        await dlg.getByRole("button", { name: "Esci senza salvare" }).click();
        await expect(page).toHaveURL(/\/catalogs$/);
        expect(stub.writes).toEqual([]);
    });
});

test.describe("Tunnel: «Salva le modifiche ed esci» passa gli stessi controlli di «Salva»", () => {
    test('"Salva le modifiche ed esci" con un conflitto aperto nel Calendario non salva: lo dice e si resta nel tunnel', async ({ page }) => {
        stub = await stubProgrammazione(page);
        await emptyCategories(page);
        // «Pranzo e2e» va in onda a Centro, dal lunedì al venerdì: portato a tutte le sedi e sempre, pari merito con «carta»
        await openBusinessPageByUrl(page, `crea/menu/${MENU.pranzo}?da=menu`);
        await expect(main(page).getByRole("heading", { name: "Cosa vuoi modificare?" })).toBeVisible({ timeout: 20_000 });
        await main(page).getByRole("checkbox", { name: /^Dove/ }).click();
        await main(page).getByRole("checkbox", { name: /^Quando/ }).click();
        await next(page);
        await expect(main(page).getByRole("heading", { name: "Dove", exact: true })).toBeVisible();
        await allSedi(page).click();
        await expect(main(page).getByText("Tutte, anche quelle che aprirai")).toBeVisible();
        await next(page);
        await expect(main(page).getByRole("heading", { name: "Quando", exact: true })).toBeVisible();
        await button(page, /^Sempre/).click();
        await button(page, "Esci").click();
        await page.getByRole("alertdialog", { name: "Uscire dal tunnel?" }).getByRole("button", { name: "Salva le modifiche ed esci" }).click();
        await expect(page.getByText("Prende il posto di un altro a pari merito: si salva col database nuovo")).toBeVisible();
        await expect(main(page).getByRole("heading", { name: "Quando", exact: true })).toBeVisible();
        await expect(page).not.toHaveURL(/\/catalogs$/);
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

    test("copia da un altro menù: «Quale menù copi?» porta categorie e piatti", async ({ page }) => {
        await cartaCom(page);
        await open(page, "menu");
        await main(page).getByLabel("Nome del menù").fill("Cena");
        await button(page, /^Copia da un altro menù/).click();
        await stuck(page, "Scegli da quale menù copiare");
        await expect(main(page).getByRole("radiogroup", { name: "Menù da copiare" })).toHaveClass(/bad/);
        await main(page).getByLabel("Nome del menù").fill("");
        const list = main(page).getByRole("radiogroup", { name: "Menù da copiare" });
        await expect(main(page).getByRole("heading", { name: "Quale menù copi?" })).toBeVisible();
        const carta = list.getByRole("radio").filter({ hasText: /2 categorie · 3 piatti · (in onda|pronto, non in onda)$/ }).first();
        await carta.click();
        await expect(carta).toHaveAttribute("aria-checked", "true");
        // senza un nome prende quello del menù copiato
        await expect(main(page).getByLabel("Nome del menù")).toHaveValue(/ \(copia\)$/);
        await next(page);
        await expect(main(page).getByRole("heading", { name: "Categorie e piatti" })).toBeVisible();
        await expect(main(page).getByText("Pizze").first()).toBeVisible();
        await expect(main(page).getByText("Dolci").first()).toBeVisible();
    });

    test("i passi: Avanti si accende quando il passo è fatto, i fatti si riaprono", async ({ page }) => {
        await open(page, "menu");
        const steps = rail(page);
        await expect(steps.getByRole("button")).toHaveText(["1Da dove parti", "2Categorie e piatti", "3Dove", "4Quando", "5Controlla", "E adesso?"]);
        // senza nome «Avanti» non va avanti: segna il campo, ci mette il fuoco e dice cosa manca
        await stuck(page, "Manca il nome del menù");
        await expect(main(page).getByLabel("Nome del menù")).toBeFocused();
        await expect(main(page).getByLabel("Nome del menù")).toHaveClass(/bad/);
        await expect(main(page).getByRole("heading", { name: "Da dove parti" })).toBeVisible();
        // il passo «Che menù è» non c'è più: il multi menù non si crea da qui
        await expect(button(page, /^Multi menù/)).toHaveCount(0);
        await expect(main(page).getByRole("heading", { level: 2 })).toHaveText("Nuovo menù");
        await main(page).getByLabel("Nome del menù").fill("Cena");
        await expect(main(page).getByRole("heading", { level: 2 })).toHaveText("Nuovo menù · Cena");
        await next(page);
        // il passo fatto si riapre dalla fila
        await steps.getByRole("button", { name: /Da dove parti/ }).click();
        await expect(main(page).getByLabel("Nome del menù")).toHaveValue("Cena");
        await expect(steps.getByRole("button", { name: /Controlla/ })).toBeDisabled();
    });

    test("Lo tengo pronto (D189): menù, sezioni e piatti, niente nel Calendario; si atterra sul menù", async ({ page }) => {
        wireMenu(stub);
        await open(page, "menu", "menu");
        await walkMenu(page);
        await toReady(page);
        await saveReady(page);
        await finito(page);
        await expect(page).toHaveURL(new RegExp(`/catalogs/${ID.catalog}$`), { timeout: 15_000 });
        // il nome senza gli spazi ai lati (#240)
        expect(bodyOf(stub, "catalogs.POST")).toMatchObject({ name: "Pranzo veloce" });
        expect(bodyOf(stub, "catalog_categories.POST")).toMatchObject({ name: "Pizze", catalog_id: ID.catalog, level: 1 });
        expect(writesOf(stub, "products.POST")).toHaveLength(1);
        expect(bodyOf(stub, "products.POST")).toMatchObject({ name: "Capricciosa" });
        expect(writesOf(stub, "catalog_category_products.POST")).toHaveLength(2);
        expect(writesOf(stub, "schedules.POST")).toHaveLength(0);
    });

    test("il Quando: l'ora si scrive o si sceglie dall'orologio, e una fascia può finire il giorno dopo", async ({ page }) => {
        wireMenu(stub);
        await open(page, "menu");
        await walkMenu(page, "Pranzo veloce");
        await next(page);
        await onAir(page);
        await sediBox(page).getByRole("checkbox", { name: "Porto e2e" }).click();
        await next(page);
        await button(page, /^Solo in certi momenti/).click();
        const dalle = main(page).getByRole("textbox", { name: "Dalle", exact: true }), alle = main(page).getByRole("textbox", { name: "Alle", exact: true });
        await expect(dalle).toHaveValue("12:00");
        await expect(alle).toHaveValue("15:00");
        await expect(main(page).getByText(/Scrivi l'ora \(22, 2230 o 22:30\) o sceglila dall'orologio/)).toBeVisible();
        // scritta senza i due punti; quello che non è un'ora non cambia niente
        await alle.fill("2210");
        await alle.press("Enter");
        await expect(alle).toHaveValue("22:15");
        await alle.fill("ciao");
        await alle.press("Enter");
        await expect(alle).toHaveValue("22:15");
        // le frecce: un quarto d'ora per volta
        await alle.press("ArrowUp");
        await expect(alle).toHaveValue("22:30");
        // l'inizio dopo la fine: la fascia passa la mezzanotte
        await dalle.fill("23");
        await dalle.press("Enter");
        await expect(dalle).toHaveValue("23:00");
        await expect(main(page).getByText("del giorno dopo", { exact: true })).toBeVisible();
        // l'orologio della fine: le ore dello stesso giorno e quelle del giorno dopo
        await main(page).getByRole("button", { name: "Scegli l'ora: Alle", exact: true }).click();
        const clock = main(page).getByRole("dialog", { name: "Alle", exact: true });
        await expect(clock.getByRole("heading", { name: "Stesso giorno" })).toBeVisible();
        await expect(clock.getByRole("heading", { name: "Giorno dopo" })).toBeVisible();
        await clock.getByRole("button", { name: "05", exact: true }).click();
        await expect(alle).toHaveValue("05:30");
        await clock.getByRole("button", { name: ":00", exact: true }).click();
        await expect(clock).toHaveCount(0);
        await expect(alle).toHaveValue("05:00");
        await expect(main(page).getByText("del giorno dopo", { exact: true })).toBeVisible();
        // l'orologio dell'inizio ha tutte le ore
        await button(page, "Scegli l'ora: Dalle").click();
        await expect(main(page).getByRole("dialog", { name: "Dalle" }).getByRole("heading", { name: "Ora", exact: true })).toBeVisible();
        await main(page).getByRole("dialog", { name: "Dalle" }).getByRole("button", { name: "19", exact: true }).click();
        await expect(dalle).toHaveValue("19:00");
        await main(page).getByRole("heading", { name: "Quando", exact: true }).click();
        await expect(main(page).getByRole("dialog")).toHaveCount(0);
        // di sera a Porto c'è già la carta: prima la seconda parte del Quando
        await next(page);
        await insieme(page, "Mostralo al posto degli altri");
        await next(page);
        await expect(main(page).getByRole("heading", { name: "Controlla" })).toBeVisible();
        await expect(main(page).getByText("Dopo mezzanotte: si salva col database nuovo").first()).toBeVisible();
    });

    test("Metti in onda: la regola nel Calendario, poi «E adesso?» e «Ho finito»", async ({ page }) => {
        wireMenu(stub);
        wireRule(stub);
        await open(page, "menu");
        await walkMenu(page, "Pranzo veloce");
        await next(page);
        // il Dove viene prima del Quando: se va in onda, e in quali sedi
        await expect(main(page).getByRole("heading", { name: "Dove", exact: true })).toBeVisible();
        // prima la domanda (D189): finché non si sceglie, niente sedi né ore e non si va avanti
        await stuck(page, "Scegli una delle due per andare avanti");
        await expect(main(page).getByRole("heading", { name: "Dove", exact: true })).toBeVisible();
        await expect(sediBox(page)).toHaveCount(0);
        await onAir(page);
        // le sedi si scelgono apposta: si parte da nessuna
        await expect(main(page).getByText("Nessuna sede scelta")).toBeVisible();
        await stuck(page, "Scegli almeno una sede");
        await expect(main(page).locator("[data-sbox]")).toHaveClass(/bad/);
        await sediBox(page).getByRole("checkbox", { name: "Porto e2e" }).click();
        await expect(main(page).getByText(/^1 di \d+ scelte$/)).toBeVisible();
        await expect(main(page).getByText("Le ore si scelgono nel passo dopo, «Quando».")).toBeVisible();
        await next(page);
        // il Quando: le ore, col modulo del Calendario
        await expect(main(page).getByRole("heading", { name: "Quando", exact: true })).toBeVisible();
        await expect(button(page, /^Sempre/)).toHaveAttribute("aria-pressed", "true");
        // con una sede sola scelta non c'è «Dipende dalla sede»
        await expect(button(page, /^Dipende dalla sede/)).toHaveCount(0);
        await button(page, /^Solo in certi momenti/).click();
        await expect(main(page).getByText("Anteprima · Menù")).toBeVisible();
        // a pranzo a Porto c'è già la carta: il Quando ha una seconda parte, «In onda insieme»
        const parti = main(page).getByRole("navigation", { name: "Parti del Quando" });
        await expect(parti.getByRole("button", { name: /Le ore$/ })).toHaveAttribute("aria-current", "step");
        await button(page, "Avanti: in onda insieme").click();
        await expect(main(page).getByText("Le ore: Lun–Ven · 12:00–15:00")).toBeVisible();
        await expect(main(page).getByText("In quelle ore c'è già un altro menù a Porto e2e.")).toBeVisible();
        await expect(main(page).getByText("Come li mostri ai clienti?")).toBeVisible();
        await expect(main(page).getByText("Scegli una risposta: sotto compaiono gli altri menù con cui si incrocia.")).toBeVisible();
        // finché non si sceglie non si va avanti
        await stuck(page, "Scegli: insieme o al posto degli altri");
        await expect(main(page).getByRole("group", { name: "Insieme o al posto" })).toHaveClass(/bad/);
        // «Cambia» riporta alle ore, e la scelta si fa dopo
        await button(page, "Cambia").click();
        await expect(button(page, /^Solo in certi momenti/)).toHaveAttribute("aria-pressed", "true");
        await next(page);
        await insieme(page, "Mostralo al posto degli altri");
        await expect(main(page).getByRole("button", { name: /^Mostralo al posto degli altri/ })).toHaveAttribute("aria-pressed", "true");
        // una sede sola: sotto, menù per menù, con quello che vede il cliente
        await expect(main(page).getByRole("heading", { name: "A Porto e2e, menù per menù" })).toBeVisible();
        await expect(main(page).getByText("Dal lunedì al venerdì dalle 12 alle 15", { exact: true })).toBeVisible();
        const voce = main(page).getByRole("group", { name: "Porto e2e, Carta e2e" });
        await expect(voce.getByRole("button", { name: "Al posto" })).toHaveAttribute("aria-pressed", "true");
        await expect(main(page).locator("[data-insieme]").getByText("Al posto di", { exact: true })).toBeVisible();
        await voce.getByRole("button", { name: "Insieme" }).click();
        await expect(main(page).locator("[data-insieme]").getByText("Al posto di", { exact: true })).toHaveCount(0);
        await voce.getByRole("button", { name: "Al posto" }).click();
        await next(page);
        await expect(main(page).getByRole("heading", { name: "Controlla" })).toBeVisible();
        await expect(main(page).getByText(/dal lunedì al venerdì, dalle 12:00 alle 15:00/)).toBeVisible();
        // «Cosa cambia nel calendario»: la somma e le sedi per esito
        const cosa = main(page).getByText("Cosa cambia nel calendario").locator("..");
        await expect(cosa.getByText(/^In onda in 1 sede · .*15 ore a settimana/)).toBeVisible();
        await expect(cosa.getByText("Prende il posto di «Carta e2e»")).toBeVisible();
        await expect(cosa.getByRole("button", { name: "Porto e2e" })).toHaveAttribute("aria-pressed", "false");
        await button(page, "Metti in onda").click();
        await expect(main(page).getByRole("heading", { level: 2, name: "Pranzo veloce", exact: true })).toBeVisible({ timeout: 15_000 });
        expect(bodyOf(stub, "schedules.POST")).toMatchObject({ rule_type: "layout", name: expect.stringMatching(/^Pranzo veloce/) });
        const on = writesOf(stub, "schedules.PATCH").map(w => first(w.body)).find(b => "time_mode" in b);
        expect(on).toMatchObject({ enabled: true, days_of_week: [1, 2, 3, 4, 5], time_from: "12:00", time_to: "15:00" });
        expect(bodyOf(stub, "schedule_layout.POST")).toMatchObject({ catalog_id: ID.catalog, schedule_id: ID.rule });
        expect(bodyOf(stub, "rpc.update_schedule_targets")).toMatchObject({ p_targets: [{ target_type: "activity", target_id: SEDE.porto }] });
        // «E adesso?»: cosa hai fatto, tre strade (dal suo primo piatto) e «Ho finito»
        await expect(main(page).getByText(/^«Pranzo veloce» è in onda a Porto e2e, .+\. Vuoi creare subito qualcos'altro\?$/)).toBeVisible();
        await expect(button(page, /^Dagli i tuoi colori/)).toContainText("Uno stile per questo menù. Nelle stesse sedi e ore.");
        await expect(button(page, /^Metti in evidenza «/)).toBeVisible();
        await expect(button(page, /^Racconta «/)).toBeVisible();
        await expect(main(page).getByText("Quello che crei da qui ha già le sedi e le ore di «Pranzo veloce»: puoi cambiarle.")).toBeVisible();
        await button(page, /^Ho finito/).click();
        await expect(page).toHaveURL(new RegExp(`/catalogs/${ID.catalog}$`));
    });

    test("il Quando con più sedi: «Dipende dalla sede», una sede «diversa» e «Torna come le altre»", async ({ page }) => {
        await open(page, "menu");
        await walkMenu(page, "Pranzo veloce");
        await next(page);
        await onAir(page);
        // con alcune sedi scelte c'è «Togli tutte»; con tutte, vale anche per quelle che aprirai
        await sediBox(page).getByRole("checkbox", { name: "Porto e2e" }).click();
        await expect(main(page).getByText("Quello che vale per una sede vince su quello che vale per tutte.")).toBeVisible();
        await button(page, "Togli tutte").click();
        await expect(main(page).getByText("Nessuna sede scelta")).toBeVisible();
        await allSedi(page).click();
        await expect(main(page).getByText("Vale anche per le sedi che aprirai.")).toBeVisible();
        await expect(button(page, "Togli tutte")).toHaveCount(0);
        await next(page);
        await expect(main(page).getByText("Le ore in cui i clienti lo vedono. A destra la settimana della sede che scegli sopra.")).toBeVisible();
        await expect(button(page, /^Sempre/)).toContainText(/In tutte (e due le|e tre le|le \d+) sedi, tutti i giorni, a tutte le ore\./);
        await button(page, /^Solo in certi momenti/).click();
        await button(page, /^Dipende dalla sede/).click();
        await expect(button(page, /^Dipende dalla sede/)).toHaveAttribute("aria-pressed", "true");
        await expect(main(page).getByText("Le ore di ogni sede: la settimana a destra segue la sede che scegli sopra.")).toBeVisible();
        await expect(main(page).getByText(/^Tutte partono da .+\. Apri una sede per cambiarla\.$/)).toBeVisible();
        const porto = main(page).getByRole("button", { name: /^Porto e2e/ });
        await expect(porto).toContainText("come le altre");
        // la settimana a destra: una sede alla volta, con le frecce e «Sede da guardare»
        const guarda = main(page).getByRole("combobox", { name: "Sede da guardare" });
        await expect(guarda).toBeVisible();
        const prima = await guarda.inputValue();
        await expect(main(page).getByText(/^1 di 3/)).toBeVisible();
        await main(page).getByRole("button", { name: /^Sede successiva: / }).click();
        await expect(main(page).getByText(/^2 di 3/)).toBeVisible();
        expect(await guarda.inputValue()).not.toBe(prima);
        // aprire una sede la porta nella settimana
        await porto.click();
        await expect(guarda.locator("option:checked")).toContainText("Porto e2e");
        await expect(main(page).getByText("Cambiando qui, cambia solo Porto e2e.")).toBeVisible();
        await main(page).getByRole("button", { name: "Sab e Dom", exact: true }).click();
        await expect(porto).toContainText("diversa");
        await button(page, "Torna come le altre").click();
        await expect(porto).toContainText("come le altre");
        // una sola risposta alla volta: «Solo in certi momenti» rimette le stesse ore a tutte
        await button(page, /^Solo in certi momenti/).click();
        await expect(main(page).getByRole("button", { name: /^Porto e2e/ })).toHaveCount(0);
    });

    test("da «E adesso?»: lo stile eredita sedi e orari del menù e chiede di confermarli; finito, ha il suo «E adesso?»", async ({ page }) => {
        wireMenu(stub);
        wireRule(stub);
        stub.onWrite("styles.POST", ({ body }) => ({ id: ID.style, ...first(body) }));
        stub.onWrite("style_versions.POST", ({ body }) => ({ id: ID.version, ...first(body) }));
        stub.onWrite("styles.PATCH", ({ body }) => ({ id: ID.style, name: "Pranzo", ...first(body) }));
        await open(page, "menu");
        await walkMenu(page, "Pranzo veloce");
        await next(page);
        await onAir(page);
        await allSedi(page).click();
        await next(page);
        await button(page, /^Solo in certi momenti/).click();
        await next(page);
        // il conto vale per tutte le sedi scelte, non solo per la prima: a Porto c'è già la carta
        await insieme(page, "Mostralo al posto degli altri");
        // «È uguale per tutte e tre le sedi?»: con «No, cambia» le sedi dove si incrocia, una per riga
        const box = main(page).locator("[data-insieme]");
        const uguale = box.getByRole("group", { name: "È uguale per tutte e tre le sedi?" });
        await uguale.getByRole("button", { name: "No, cambia" }).click();
        await expect(box.getByText("1 di 2 sedi viste")).toBeVisible();
        await expect(box.getByRole("button", { name: /Lago e2e.*1 menù/ })).toHaveAttribute("aria-expanded", "true");
        await expect(box.getByText("Centro e2e non ha altri menù: niente da scegliere.")).toBeVisible();
        // la prossima sede si apre da sola, e la settimana a destra passa a lei
        await box.getByRole("button", { name: "Prossima sede: Porto e2e" }).click();
        await expect(box.getByText("2 di 2 sedi viste")).toBeVisible();
        await expect(box.getByText("Le hai viste tutte.")).toBeVisible();
        await expect(box.getByRole("button", { name: /Porto e2e.*1 menù/ })).toHaveAttribute("aria-expanded", "true");
        await expect(main(page).getByRole("combobox", { name: "Sede da guardare" }).locator("option:checked")).toHaveText(/^Porto e2e/);
        // una sede diversa dalle altre si vede, ma il database di oggi tiene una risposta sola
        await box.getByRole("group", { name: "Porto e2e, Carta e2e" }).getByRole("button", { name: "Insieme" }).click();
        await expect(box.getByText("diversa", { exact: true })).toBeVisible();
        await expect(box.getByText("· 1 diversa")).toBeVisible();
        await next(page);
        await expect(main(page).getByText("Scelte diverse fra le sedi: si salva col database nuovo").first()).toBeVisible();
        await button(page, "Indietro").click();
        await uguale.getByRole("button", { name: "Sì, uguale" }).click();
        await expect(box.getByText(/^In tutte e tre le sedi «.+» si vede da solo, al posto degli altri menù\.$/)).toBeVisible();
        await next(page);
        await button(page, "Metti in onda").click();
        await button(page, /^Dagli i tuoi colori/).click({ timeout: 15_000 });
        await next(page);
        await main(page).getByLabel("Nome dello stile").fill("Pranzo");
        await next(page);
        await button(page, "Blu").click();
        await next(page);
        // il menù era in onda: lo è già anche lo stile, e le sedi sono le sue, da confermare
        await expect(button(page, /^Sì, lo metto in onda/)).toHaveAttribute("aria-pressed", "true");
        const sedi = main(page).getByRole("group", { name: "Stesse sedi di «Pranzo veloce»" });
        await expect(sedi).toContainText("Tutte le sedi");
        await expect(sedi).toContainText("Le hai appena scelte per «Pranzo veloce».");
        await expect(main(page).locator("[data-sbox]")).toHaveCount(0);
        await stuck(page, "Conferma le sedi o cambiale");
        await expect(sedi).toHaveClass(/bad/);
        // «Cambio sedi» apre il riquadro delle sedi, già con quelle del menù
        await sedi.getByRole("button", { name: "Cambio sedi" }).click();
        await expect(main(page).getByText("Partono dalle sedi di «Pranzo veloce»: cambia quello che serve.")).toBeVisible();
        await expect(allSedi(page)).toHaveAttribute("aria-checked", "true");
        await next(page);
        // gli orari: confermati restano quelli del menù
        const ore = main(page).getByRole("group", { name: "Stessi orari di «Pranzo veloce»" });
        await expect(ore).toContainText("Li hai appena scelti per «Pranzo veloce».");
        await expect(button(page, /^Solo in certi momenti/)).toHaveCount(0);
        await stuck(page, "Conferma gli orari o cambiali");
        await ore.getByRole("button", { name: "Sì, gli stessi" }).click();
        await expect(main(page).getByText("Stessi orari di «Pranzo veloce»", { exact: true })).toBeVisible();
        await next(page);
        // in due sedi a quelle ore c'è già uno stile: la seconda parte del Quando, e la settimana una sede alla volta
        await expect(main(page).getByText("In quelle ore c'è già un altro stile in 2 sedi.")).toBeVisible();
        await expect(main(page).getByRole("combobox", { name: "Sede da guardare" })).toBeVisible();
        await button(page, /^Prende il posto degli altri/).click();
        await next(page);
        await button(page, "Metti in onda").click();
        // lo stile ha il suo «E adesso?»
        await expect(main(page).getByRole("heading", { level: 2, name: "Pranzo", exact: true })).toBeVisible({ timeout: 15_000 });
        await expect(button(page, /^Un menù per queste ore/)).toContainText("Il menù che i clienti vedono con questo stile. Nelle stesse sedi e ore.");
        await expect(button(page, /^Racconta il locale/)).toBeVisible();
        await button(page, /^Ho finito/).click();
        await expect(page).toHaveURL(/\/styles$/);
    });

    test("Esci con qualcosa scritto: «Resta» resta, «Esci senza salvare» torna indietro", async ({ page }) => {
        await open(page, "menu", "menu");
        // senza niente scritto si esce subito
        await button(page, "Esci").click();
        await expect(page).toHaveURL(/\/catalogs$/);
        await page.goBack();
        await main(page).getByLabel("Nome del menù").fill("Cena");
        await button(page, "Esci").click();
        const dlg = page.getByRole("alertdialog", { name: "Uscire dal tunnel?" });
        await expect(dlg).toBeVisible();
        // creando non c'è più «Tieni come bozza ed esci» (D189): o si resta o si esce senza salvare
        await expect(dlg.getByText("Quello che hai scritto non è ancora salvato. Se esci senza salvare, lo perdi.")).toBeVisible();
        await expect(dlg.getByRole("button")).toHaveText(["Resta", "Esci senza salvare"]);
        await dlg.getByRole("button", { name: "Resta" }).click();
        await expect(dlg).toBeHidden();
        await expect(main(page).getByLabel("Nome del menù")).toHaveValue("Cena");
        await button(page, "Esci").click();
        await dlg.getByRole("button", { name: "Esci senza salvare" }).click();
        await expect(page).toHaveURL(/\/catalogs$/);
        expect(stub.writes.filter(w => !w.key.startsWith("rpc."))).toHaveLength(0);
    });

    test("il salvataggio che non riesce lo dice, e si resta nel tunnel", async ({ page }) => {
        await open(page, "menu");
        await walkMenu(page);
        await toReady(page);
        await saveReady(page);
        await expect(page.getByText("Non siamo riusciti a salvare il menù. Riprova.")).toBeVisible();
        await expect(page).toHaveURL(/\/crea\/menu/);
    });

    test("da una foto (D165, D172, D180): il resoconto nel passo, il menù cambia solo con «Aggiungi», e solo il Salva scrive", async ({ page }) => {
        wireAiRead(stub);
        wireMenu(stub);
        await open(page, "menu", "menu");
        await readPhoto(page);
        await expect(main(page).getByText("Nel file «menu.png» ho trovato 2 piatti")).toBeVisible();
        // ancora niente scritto: la lettura non crea il menù
        expect(stub.writes.filter(w => !w.key.startsWith("fn."))).toHaveLength(0);
        // il piatto che c'è già si collega, l'altro è da controllare
        await expect(button(page, /^1 già fra i tuoi prodotti/)).toBeVisible();
        await expect(button(page, /^1 da controllare/)).toBeVisible();
        // con l'import aperto non si va avanti
        await stuck(page, "Hai un import aperto: aggiungi i piatti o butta via l'import");
        await button(page, "Aggiungi 2 piatti al menù").click();
        await expect(main(page).getByText("2 piatti aggiunti da «menu.png».")).toBeVisible();
        await expect(button(page, "Togli Bufalina")).toBeVisible();
        expect(stub.writes.filter(w => !w.key.startsWith("fn."))).toHaveLength(0);
        await toReady(page);
        await saveReady(page);
        await finito(page);
        await expect(page).toHaveURL(new RegExp(`/catalogs/${ID.catalog}$`), { timeout: 15_000 });
        expect(bodyOf(stub, "catalogs.POST")).toMatchObject({ name: "Carta" });
        expect(writesOf(stub, "catalog_categories.POST").map(w => first(w.body).name)).toEqual(["Pizze"]);
        expect(writesOf(stub, "products.POST")).toHaveLength(1);
        expect(bodyOf(stub, "products.POST")).toMatchObject({ name: "Bufalina", base_price: 9.5 });
        expect(writesOf(stub, "catalog_category_products.POST")).toHaveLength(2);
    });

    test("da una foto: «Annulla l'import» rimette il menù com'era; la quota finita lo dice; uscendo non si scrive niente", async ({ page }) => {
        stub.onWrite("fn.menu-ai-import", () => new StubError(402, { error: "quota", reason: "quota_exhausted", reset_at: null }));
        await open(page, "menu", "menu");
        await readPhoto(page);
        await expect(main(page).getByRole("alert")).toBeVisible();
        wireAiRead(stub);
        await photoInput(page).setInputFiles(PHOTO);
        await expect(main(page).getByText("Nel file «menu.png» ho trovato 2 piatti")).toBeVisible();
        await expect(main(page).getByRole("alert")).toHaveCount(0);
        await button(page, "Aggiungi 2 piatti al menù").click();
        await button(page, "Annulla l'import: togli questi 2 piatti").click();
        await expect(main(page).getByText("Il menù è vuoto")).toBeVisible();
        await button(page, "Esci").click();
        await page.getByRole("alertdialog", { name: "Uscire dal tunnel?" }).getByRole("button", { name: "Esci senza salvare" }).click();
        await expect(page).toHaveURL(/\/catalogs$/);
        expect(stub.writes.filter(w => !w.key.startsWith("fn."))).toHaveLength(0);
    });

    test("categorie e sottocategorie (D177): si annidano, si spostano e il Salva scrive i livelli", async ({ page }) => {
        let n = 0;
        stub.onWrite("catalogs.POST", ({ body }) => ({ id: ID.catalog, created_at: new Date().toISOString(), ...first(body) }));
        stub.onWrite("catalog_categories.POST", ({ body }) => ({ id: "e2ec7000-0000-4000-a000-00000000009" + n++, ...first(body) }));
        stub.onWrite("catalog_category_products.POST", ({ body }) => ({ id: "e2ec7000-0000-4000-a000-000000000010", ...first(body) }));
        await open(page, "menu", "menu");
        await main(page).getByLabel("Nome del menù").fill("Carta");
        await next(page);
        const name = main(page).getByLabel("Nome della categoria");
        await button(page, "Aggiungi una categoria").click();
        await name.fill("Dolci");
        await name.press("Enter");
        await main(page).getByRole("button", { name: "Categoria", exact: true }).click();
        await name.fill("Pizze");
        await name.press("Enter");
        await button(page, "Sottocategoria").last().click();
        await name.fill("Rosse");
        await name.press("Enter");
        // Pizze sale sopra Dolci
        await button(page, "Sposta su Pizze").click();
        const dish = main(page).getByLabel("Piatto da aggiungere a Rosse");
        await dish.fill("Marg");
        await main(page).getByRole("option", { name: /Margherita e2e/ }).click();
        await expect(button(page, "Porta fuori da Pizze")).toBeVisible();
        await toReady(page);
        await saveReady(page);
        await finito(page);
        await expect(page).toHaveURL(new RegExp(`/catalogs/${ID.catalog}$`), { timeout: 15_000 });
        const cats = writesOf(stub, "catalog_categories.POST").map(w => first(w.body));
        expect(cats.map(c => [c.name, c.level, c.sort_order])).toEqual([["Pizze", 1, 0], ["Rosse", 2, 0], ["Dolci", 1, 1]]);
        expect(cats[1].parent_category_id).toBe("e2ec7000-0000-4000-a000-000000000090");
        expect(bodyOf(stub, "catalog_category_products.POST")).toMatchObject({ category_id: "e2ec7000-0000-4000-a000-000000000091", product_id: PRODUCT.margherita });
    });

    test("#360.2: il piatto nuovo non si salva; «Riprova» non crea un secondo menù né un'altra sezione", async ({ page }) => {
        // tutto risponde tranne il piatto nuovo
        stub.onWrite("catalogs.POST", ({ body }) => ({ id: ID.catalog, created_at: new Date().toISOString(), ...first(body) }));
        stub.onWrite("catalog_categories.POST", ({ body }) => ({ id: ID.category, ...first(body) }));
        stub.onWrite("catalog_category_products.POST", ({ body }) => ({ id: "e2ec7000-0000-4000-a000-000000000010", ...first(body) }));
        await open(page, "menu", "menu");
        await walkMenu(page);
        await toReady(page);
        await saveReady(page);
        await expect(page.getByText("Non siamo riusciti a salvare il menù. Riprova.")).toBeVisible();
        expect(writesOf(stub, "catalogs.POST")).toHaveLength(1);
        // ora il piatto si salva: si riprende da lì
        stub.onWrite("products.POST", ({ body }) => ({ ...first(body) }));
        await saveReady(page);
        await finito(page);
        await expect(page).toHaveURL(new RegExp(`/catalogs/${ID.catalog}$`), { timeout: 15_000 });
        expect(writesOf(stub, "catalogs.POST")).toHaveLength(1);
        expect(writesOf(stub, "catalog_categories.POST")).toHaveLength(1);
        expect(writesOf(stub, "products.POST")).toHaveLength(2);
        expect(writesOf(stub, "catalog_category_products.POST")).toHaveLength(2);
    });

    test("#360.2: due clic nello stesso istante salvano una volta sola", async ({ page }) => {
        wireMenu(stub);
        await open(page, "menu", "menu");
        await walkMenu(page);
        await toReady(page);
        await button(page, "Salva e tieni pronto").evaluate((el: HTMLElement) => {
            el.click();
            el.click();
        });
        await finito(page);
        await expect(page).toHaveURL(new RegExp(`/catalogs/${ID.catalog}$`), { timeout: 15_000 });
        expect(writesOf(stub, "catalogs.POST")).toHaveLength(1);
    });

    test("dal Calendario: «Crea un menù nuovo» tiene da parte la bozza e apre il tunnel", async ({ page }) => {
        await openBusinessPageByUrl(page, "scheduling?type=layout");
        // Calendario e Regole sono le parti della sezione: tab nella barra del titolo.
        await page.getByRole("navigation", { name: "Parti di Calendario" }).getByRole("link", { name: "Calendario", exact: true }).click();
        await expect(page).toHaveURL(/[?&]vista=calendario/);
        await main(page).getByRole("button", { name: "Aggiungi", exact: true }).click();
        await main(page).getByRole("button", { name: /^Menù/ }).first().click();
        await expect(main(page).getByText("Si crea nel tunnel di creazione: si esce dal Calendario.")).toBeVisible();
        await main(page).getByRole("button", { name: /Crea un menù nuovo/ }).click();
        await expect(page.getByText("Creare un menù nuovo?")).toBeVisible();
        await expect(page.getByText("Si apre il tunnel di creazione: tieni da parte la bozza, e il suo quando e il suo dove vengono con te.")).toBeVisible();
        await page.getByRole("button", { name: "Tieni da parte e vai" }).click();
        await expect(page).toHaveURL(/\/crea\/menu\?da=calendario$/);
        await expect(main(page).getByRole("heading", { level: 2, name: "Nuovo menù" })).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByRole("navigation", { name: "Percorso" }).getByRole("button", { name: "Calendario" })).toBeVisible();
        expect(await page.evaluate(t => sessionStorage.getItem("calendario:da-parte:" + t), TENANT_ID)).toContain('"kind":"menu"');
    });

    test("dal Calendario con una bozza tenuta da parte: il suo quando e il suo dove", async ({ page }) => {
        await page.addInitScript(
            ([porto, tenant]) => {
                const d = { kind: "menu", mode: "new", rule: null, thing: null, pair: null, when: { days: [5, 6] }, where: { all: false, activityIds: [porto], groupIds: [] } };
                sessionStorage.setItem("calendario:da-parte:" + tenant, JSON.stringify(d));
            },
            [SEDE.porto, TENANT_ID]
        );
        await open(page, "menu", "calendario");
        await expect(main(page).getByRole("navigation", { name: "Percorso" }).getByRole("button", { name: "Calendario" })).toBeVisible();
        await walkMenu(page);
        await next(page);
        await onAir(page);
        await expect(sediBox(page).getByRole("checkbox", { name: "Porto e2e" })).toBeChecked();
        await expect(sediBox(page).getByRole("checkbox", { name: "Centro e2e" })).not.toBeChecked();
        await expect(main(page).getByText("Dalla bozza che hai tenuto da parte nel Calendario: puoi cambiarlo.")).toBeVisible();
        await next(page);
        await expect(button(page, /^Solo in certi momenti/)).toHaveAttribute("aria-pressed", "true");
        // uscire senza salvare lascia la bozza dov'è
        await button(page, "Esci").click();
        await page.getByRole("alertdialog").getByRole("button", { name: "Esci senza salvare" }).click();
        await expect(page).toHaveURL(/\/scheduling\?vista=calendario$/);
        expect(await page.evaluate(t => sessionStorage.getItem("calendario:da-parte:" + t), TENANT_ID)).toContain('"kind":"menu"');
    });
});

test.describe("Tunnel di creazione — stile, in evidenza, storia", () => {
    test.beforeEach(async ({ page }) => {
        stub = await stubProgrammazione(page);
    });

    test("stile: le sei parti dell'aspetto, la bozza ha i token giusti e si torna all'elenco degli stili", async ({ page }) => {
        stub.onWrite("styles.POST", ({ body }) => ({ id: ID.style, ...first(body) }));
        stub.onWrite("style_versions.POST", ({ body }) => ({ id: ID.version, ...first(body) }));
        stub.onWrite("styles.PATCH", ({ body }) => ({ id: ID.style, name: "Natale", ...first(body) }));
        await open(page, "stile", "stili");
        await next(page);
        await main(page).getByLabel("Nome dello stile").fill("Natale");
        await next(page);
        // l'aspetto va già bene com'è: si può andare avanti senza toccare niente
        await expect(button(page, "Avanti")).toBeEnabled();
        // nel telefono c'è la pagina vera del cliente, la stessa dell'editor dello stile
        await expect(page.getByLabel("Così lo vede il cliente").getByText("Happy Hour Estivo").first()).toBeVisible();
        await button(page, "Rosso").click();
        await button(page, "Scuro").click();
        await button(page, "Lora").click();
        await button(page, "Una riga di un elenco").click();
        // la scelta che compare solo quando serve
        await button(page, "I puntini, come sulla carta").click();
        await button(page, "Sottolineata").click();
        // la tavolozza è un fumetto sul pulsante: si chiude scegliendo
        const second = main(page).getByRole("group", { name: "Secondo colore" });
        await second.getByRole("button", { name: "Un altro colore" }).click();
        const pal = page.getByRole("dialog", { name: "Secondo colore" });
        // dieci tinte per cinque toni, il colore del logo, i due già usati e «Altri colori…»
        await expect(pal.getByText("Dal tuo logo")).toBeVisible();
        await expect(pal.getByRole("button")).toHaveCount(50 + 1 + 2 + 1);
        await pal.getByRole("button").nth(12).click();
        await expect(pal).toHaveCount(0);
        await expect(second.getByRole("button", { name: "Un tuo colore" })).toBeVisible();
        await toReady(page);
        await saveReady(page);
        await finito(page);
        await expect(page).toHaveURL(/\/styles$/, { timeout: 15_000 });
        expect(bodyOf(stub, "styles.POST")).toMatchObject({ name: "Natale", is_system: false });
        const config = JSON.stringify(bodyOf(stub, "style_versions.POST").config);
        expect(config).toContain("#be123c");
        expect(config).toContain("#0F172A");
        expect(config).toContain("lora");
        expect(config).toContain("compact");
        expect(config).toContain("editorial");
        expect(config).toContain("tabs");
        expect(config).toContain("accent");
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
        // D187: niente «Che cosa?»: un'idea apre la parte dei piatti, che si può togliere e rimettere
        await expect(rail(page).getByRole("button").first()).toHaveText("1Il contenuto");
        await button(page, /^Un'offerta/).click();
        await expect(main(page).getByText("Partito da")).toBeVisible();
        const piatti = main(page).getByRole("region", { name: "I piatti" });
        await piatti.getByRole("button", { name: "Togli" }).click();
        await expect(piatti).toHaveCount(0);
        await button(page, /^Dei piatti/).click();
        await main(page).getByLabel("Titolo", { exact: true }).fill("Pizza del giorno");
        // coi piatti aperti e nessuno scelto non si va avanti
        await stuck(page, "Aggiungi almeno un piatto");
        await piatti.getByRole("checkbox", { name: /Margherita e2e/ }).click();
        await next(page);
        await onAir(page);
        await allSedi(page).click();
        await next(page);
        await expect(main(page).getByRole("heading", { name: "Quando", exact: true })).toBeVisible();
        await next(page);
        // D187: nelle sedi c'è già altro in evidenza, quindi «L'ordine»; il nuovo parte per primo
        await expect(main(page).getByRole("heading", { name: "L'ordine", exact: true })).toBeVisible();
        await expect(button(page, /^Mostralo per primo in tutte le sedi/)).toHaveAttribute("aria-pressed", "true");
        await next(page);
        await button(page, "Metti in onda").click();
        await finito(page);
        await expect(page).toHaveURL(new RegExp(`/featured/${ID.featured}$`), { timeout: 15_000 });
        expect(bodyOf(stub, "featured_contents.POST")).toMatchObject({ title: "Pizza del giorno", status: "published", content_type: "promo" });
        expect(writesOf(stub, "featured_content_products.POST")).toHaveLength(1);
        expect(bodyOf(stub, "schedule_featured_contents.POST")).toMatchObject({ featured_content_id: ID.featured, slot: "before_catalog" });
    });

    test("in evidenza: la data sulla card, il pulsante a scelta e «Fino al…» nel Quando (D187)", async ({ page }) => {
        await open(page, "evidenza", "evidenza");
        await main(page).getByLabel("Titolo", { exact: true }).fill("Serata karaoke");
        // «Quando succede»: solo un'informazione, scritta sulla card
        const data = main(page).getByRole("region", { name: "Quando succede" });
        await expect(data.getByRole("button", { name: "Nessuna data" })).toHaveAttribute("aria-pressed", "true");
        await data.getByRole("button", { name: "Un giorno" }).click();
        await expect(data.getByText("facoltativa · sulla card: Mercoledì 23 set", { exact: true })).toBeVisible();
        await data.getByRole("textbox", { name: "Ora" }).fill("21");
        await data.getByRole("textbox", { name: "Ora" }).blur();
        await expect(data.getByText("facoltativa · sulla card: Mercoledì 23 set, dalle 21", { exact: true })).toBeVisible();
        // «Il pulsante»: niente link libero; senza piatti «Vedi il piatto» e «Aggiungi all'ordine» sono spenti
        await expect(button(page, /^Un pulsante/)).toHaveCount(0);
        const pulsante = main(page).getByRole("radiogroup", { name: "Il pulsante" });
        await expect(pulsante.getByRole("radio", { name: /^Nessun pulsante/ })).toBeChecked();
        await expect(pulsante.getByRole("radio", { name: /^Vedi il piatto.*Solo con dei piatti collegati\./ })).toBeDisabled();
        await expect(pulsante.getByRole("radio", { name: /^Aggiungi all'ordine/ })).toBeDisabled();
        await next(page);
        await onAir(page);
        await allSedi(page).click();
        await next(page);
        // punto 14: il giorno della card diventa la fine del periodo, e lo si dice
        await expect(main(page).getByRole("heading", { name: "Quando", exact: true })).toBeVisible();
        await expect(main(page).getByText("Fino al 23 set, il giorno del contenuto: puoi cambiarlo.", { exact: true })).toBeVisible();
        await next(page);
        // «L'ordine»: uguale in tutte le sedi, oppure sede per sede con le righe da spostare
        await expect(main(page).getByRole("heading", { name: "L'ordine", exact: true })).toBeVisible();
        await main(page).getByRole("radio", { name: "No, cambia" }).click();
        await expect(main(page).getByText("Apri la sede da cambiare.")).toBeVisible();
        await button(page, /^Porto e2e.*Per primo · 4 contenuti.*Cambia$/).click();
        const righe = main(page).getByRole("list", { name: "L'ordine" });
        await expect(righe.getByRole("listitem")).toHaveCount(4);
        await expect(righe.getByRole("listitem").first()).toContainText("Serata karaoke");
        await righe.getByRole("button", { name: "Sposta giù: Serata karaoke" }).click();
        await expect(righe.getByRole("listitem").nth(1)).toContainText("Serata karaoke");
        await expect(button(page, /^Porto e2e.*2° di 4 · 4 contenuti.*Chiudi$/)).toBeVisible();
        // sopra il telefono le sedi da guardare: quella aperta è scelta
        const guarda = page.getByRole("group", { name: "Sede da guardare" });
        await expect(guarda.getByRole("button", { name: "Porto e2e" })).toHaveAttribute("aria-pressed", "true");
        // «Sì»: torna per primo dappertutto
        await main(page).getByRole("radio", { name: "Sì", exact: true }).click();
        await expect(button(page, /^Mostralo per primo in tutte le sedi/)).toHaveAttribute("aria-pressed", "true");
        await next(page);
        // le colonne della data arrivano col database nuovo: fino ad allora non si salva
        await expect(button(page, "Metti in onda")).toBeDisabled();
        await expect(main(page).getByText("«Quando succede»: si salva col database nuovo")).toBeVisible();
    });

    test("storia di un prodotto: di cosa parla, racconto e blocchi, in onda senza sedi né orari (D191)", async ({ page }) => {
        stub.onWrite("stories.POST", ({ body }) => ({ id: ID.story, ...first(body) }));
        stub.onWrite("stories.PATCH", ({ body }) => ({ id: ID.story, ...first(body) }));
        await open(page, "storia", "storie");
        await next(page);
        // «Di cosa parla»: prima il tipo, poi il prodotto, cercandolo
        await expect(main(page).getByRole("heading", { name: "Di cosa parla" })).toBeVisible();
        await stuck(page, "Scegli di cosa parla");
        await button(page, /^Un prodotto/).click();
        await stuck(page, "Scegli il prodotto");
        const prodotti = main(page).getByRole("radiogroup", { name: "Prodotti" });
        await main(page).getByRole("textbox", { name: "Cerca un prodotto" }).fill("tiramisu");
        await expect(prodotti.getByRole("radio")).toHaveCount(1);
        await prodotti.getByRole("radio", { name: /^Tiramisù e2e/ }).click();
        await next(page);
        await main(page).getByLabel("Occhiello").fill("Il forno");
        await main(page).getByLabel("Titolo", { exact: true }).fill("Il forno a legna");
        await next(page);
        // un bottone per tipo di blocco, sotto i blocchi
        await expect(main(page).getByRole("button", { name: "Aggiungi", exact: true })).toHaveCount(0);
        await button(page, "Testo").click();
        await main(page).getByRole("textbox", { name: "Scrivi un paragrafo..." }).fill("Lo accendiamo alle sei.");
        await next(page);
        // «In onda?»: niente sedi e niente orari, solo la scelta
        await expect(main(page).getByRole("heading", { name: "In onda?" })).toBeVisible();
        await expect(main(page).locator("[data-sbox]")).toHaveCount(0);
        await stuck(page, "Scegli una delle due per andare avanti");
        await onAir(page);
        await next(page);
        await expect(main(page).getByText("Dove e quando «Tiramisù e2e» è nel menù: la storia «Il forno a legna» compare in fondo alla scheda di «Tiramisù e2e».")).toBeVisible();
        await button(page, "Metti in onda").click();
        await expect(main(page).getByText("«Il forno a legna» è in onda: si vede in fondo alla scheda di «Tiramisù e2e».")).toBeVisible({ timeout: 15_000 });
        await finito(page);
        await expect(page).toHaveURL(new RegExp(`/stories/${ID.story}$`), { timeout: 15_000 });
        expect(bodyOf(stub, "stories.POST")).toMatchObject({ title: "Il forno a legna", eyebrow: "Il forno", status: "draft", activity_id: null });
        expect(bodyOf(stub, "stories.POST").product_id).toBeTruthy();
        const done = bodyOf(stub, "stories.PATCH");
        expect(done).toMatchObject({ status: "published" });
        expect(JSON.stringify(done.body_blocks)).toContain("Lo accendiamo alle sei.");
    });
});

test.describe("Tunnel di creazione — chi non gestisce il Calendario", () => {
    test("niente Quando né Dove; «Salva e tieni pronto» lascia la messa in onda a chi gestisce il Calendario", async ({ page }) => {
        stub = await stubProgrammazione(page);
        await stub.revoke("scheduling.write");
        await open(page, "evidenza");
        await stub.revoked;
        await expect(rail(page).getByRole("button")).toHaveText(["1Il contenuto", "2Controlla", "E adesso?"]);
        await main(page).getByLabel("Titolo", { exact: true }).fill("Chiusi per ferie");
        await next(page);
        await expect(button(page, "Metti in onda")).toHaveCount(0);
        // nessuna scelta (D189): sempre pronto, con la riga della pagina
        await expect(main(page).getByText("La messa in onda la decide chi gestisce il Calendario. Con «Salva e tieni pronto» questo contenuto resta in «In evidenza» come «Pronto, non in onda», con tutti i controlli fatti.")).toBeVisible();
        // «Salva e tieni pronto» lascia una bozza e nessuna regola nel Calendario (#360.8: prima non si cliccava)
        stub.onWrite("featured_contents.POST", ({ body }) => ({ id: ID.featured, ...first(body) }));
        await saveReady(page);
        await finito(page);
        await expect(page).toHaveURL(new RegExp(`/featured/${ID.featured}$`), { timeout: 15_000 });
        expect(bodyOf(stub, "featured_contents.POST")).toMatchObject({ title: "Chiusi per ferie", status: "draft" });
        expect(writesOf(stub, "schedules.POST")).toHaveLength(0);
    });
});

test.describe("Tunnel di creazione — permessi (#360.8)", () => {
    test("senza il permesso di modifica dei menù il tunnel non si apre", async ({ page }) => {
        stub = await stubProgrammazione(page);
        await stub.revoke("catalogs.write");
        await openBusinessPageByUrl(page, "crea/menu?da=menu");
        await stub.revoked;
        await expect(main(page).getByText("Non puoi crearlo")).toBeVisible({ timeout: 20_000 });
        await expect(main(page).getByLabel("Nome del menù")).toHaveCount(0);
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
        await main(page).getByLabel("Nome del menù").fill("Cena");
        await expect(button(page, "Avanti")).toBeEnabled();
        const side = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(side).toBeLessThanOrEqual(0);
    });
});

test.describe("Tunnel dello stile: modificare (D186)", () => {
    const OWN = "e2e51700-0000-4000-a000-000000000001";
    const ver = (n: number, primary: string, created_at: string) => ({ id: `e2e51700-0000-4000-a000-00000000001${n}`, tenant_id: TENANT_ID, style_id: OWN, version: n, config: { colors: { primary } }, created_at });

    test.beforeEach(async ({ page }) => {
        stub = await stubProgrammazione(page);
    });

    test("uno stile di CataloGlobe non si modifica: si apre la creazione già su «Parti da questo stile»", async ({ page }) => {
        await openBusinessPageByUrl(page, `crea/stile/${STYLE.base}?da=stili`);
        await expect(main(page).getByRole("heading", { level: 2, name: "Nuovo stile" })).toBeVisible({ timeout: 20_000 });
        await next(page);
        await expect(button(page, "Stile base e2e")).toHaveAttribute("aria-pressed", "true");
    });

    test("le versioni di prima: si guardano nel telefono e ci si torna, senza salvare finché non lo dici", async ({ page }) => {
        await page.route(/\/rest\/v1\/styles\?.*id=eq\.e2e51700/, route =>
            route.request().method() === "GET" ? route.fulfill({ json: { id: OWN, tenant_id: TENANT_ID, name: "Sera", is_system: false, is_active: true, current_version: ver(2, "#be123c", "2026-10-03T10:00:00Z") } }) : route.fallback()
        );
        await page.route(/\/rest\/v1\/style_versions\?/, route => (route.request().method() === "GET" ? route.fulfill({ json: [ver(2, "#be123c", "2026-10-03T10:00:00Z"), ver(1, "#1d4ed8", "2026-09-18T10:00:00Z")] }) : route.fallback()));
        stub.onWrite("style_versions.POST", ({ body }) => ({ id: ID.version, ...first(body) }));
        stub.onWrite("styles.PATCH", ({ body }) => ({ id: OWN, ...first(body) }));
        await openBusinessPageByUrl(page, `crea/stile/${OWN}?da=stili`);
        await expect(main(page).getByRole("heading", { name: "Cosa vuoi modificare?" })).toBeVisible({ timeout: 20_000 });
        await main(page).getByRole("checkbox", { name: /^L'aspetto/ }).click();
        await next(page);
        await expect(main(page).getByRole("heading", { name: "L'aspetto" })).toBeVisible();
        await expect(button(page, "Rosso")).toHaveAttribute("aria-pressed", "true");
        // niente di cambiato: niente «Torna com'era», niente confronto
        await expect(button(page, "Torna com'era")).toHaveCount(0);
        await button(page, "Versioni di prima").click();
        const vers = main(page).getByRole("region", { name: "Versioni di prima" });
        await expect(vers.getByText("3 ottobre 2026")).toBeVisible();
        await expect(vers.getByText(/la prima · diversi: colori e forme/)).toBeVisible();
        await vers.getByRole("button", { name: "Guarda" }).click();
        const side = page.getByLabel("Così lo vede il cliente");
        await side.getByRole("button", { name: /Versione del 18 settembre 2026: torna alle tue modifiche/ }).click();
        await vers.getByRole("button", { name: "Torna a questa" }).click();
        await expect(button(page, "Blu")).toHaveAttribute("aria-pressed", "true");
        await expect(button(page, "Torna com'era")).toHaveCount(1);
        await expect(side.getByRole("button", { name: "Guarda com'era prima" })).toBeVisible();
        expect(writesOf(stub, "style_versions.POST")).toHaveLength(0);
        // una parte sola torna com'era
        await button(page, "Torna com'era").click();
        await expect(button(page, "Rosso")).toHaveAttribute("aria-pressed", "true");
    });
});

test.describe("Dove e Quando: in onda o pronto (D189)", () => {
    test.beforeEach(async ({ page }) => {
        stub = await stubProgrammazione(page);
    });

    /** I scritti di un contenuto in evidenza e della sua regola, tutti finti. */
    function wireEvid() {
        stub.onWrite("featured_contents.POST", ({ body }) => ({ id: ID.featured, ...first(body) }));
        stub.onWrite("featured_contents.PATCH", ({ body }) => [{ ...first(body) }]);
        stub.onWrite("featured_content_products.POST", () => null);
        stub.onWrite("schedules.POST", () => ({ id: ID.rule }));
        stub.onWrite("schedules.PATCH", () => [{ id: ID.rule }]);
        stub.onWrite("schedules.DELETE", () => null);
        stub.onWrite("schedule_featured_contents.DELETE", () => null);
        stub.onWrite("schedule_featured_contents.POST", () => null);
        stub.onWrite("rpc.update_schedule_targets", () => null);
    }
    /** «Luci di Natale e2e» ancora da mettere in onda: pubblicato no, la sua regola sì. */
    async function nataleDraft(page: Page) {
        // la riga è scritta qui: route.fetch() uscirebbe sulla rete vera invece di passare dai dati finti
        const row = { id: FEATURED.natale, tenant_id: TENANT_ID, title: "Luci di Natale e2e", status: "draft" };
        await page.route(/\/rest\/v1\/featured_contents\?/, async route => {
            const request = route.request();
            if (request.method() !== "GET" || !request.url().includes(FEATURED.natale)) return route.fallback();
            const wantsObject = (request.headers()["accept"] ?? "").includes("vnd.pgrst.object");
            await route.fulfill({ json: wantsObject ? row : [row] });
        });
    }

    test("creando nessuna delle due è scelta: «Avanti» spento finché non si sceglie, la fila dice com'è", async ({ page }) => {
        await open(page, "menu", "menu");
        await walkMenu(page);
        await next(page);
        await expect(main(page).getByRole("heading", { name: "Dove", exact: true })).toBeVisible();
        await expect(main(page).getByText("Due scelte: se i clienti lo vedono e in quali sedi. Si cambia quando vuoi.")).toBeVisible();
        await expect(main(page).getByText("Vuoi che i clienti lo vedano appena salvi?")).toBeVisible();
        await stuck(page, "Scegli una delle due per andare avanti");
        // niente sedi finché non si sceglie
        await expect(sediBox(page)).toHaveCount(0);
        await button(page, /^No, per ora lo tengo pronto/).click();
        await expect(button(page, /^No, per ora lo tengo pronto/)).toHaveAttribute("aria-pressed", "true");
        await expect(main(page).getByText("Lo salvi completo, ma nessun cliente lo vede.")).toBeVisible();
        await expect(main(page).getByText("Nessuna sede e nessun orario. Il menù resta in «Menù» come «Pronto, non in onda». Quando vuoi, lo metti in onda da lì con «Metti in onda».")).toBeVisible();
        await expect(rail(page).getByRole("button", { name: /Dove\s*· non in onda/ })).toBeVisible();
        // tenuto pronto, il «Quando» si salta: nella fila è spento
        await expect(rail(page).getByRole("button", { name: /Quando/ })).toBeDisabled();
        // si cambia idea con un clic: tornano le sedi, tutte da scegliere
        await onAir(page);
        await expect(sediBox(page)).toBeVisible();
        await expect(allSedi(page)).toHaveAttribute("aria-checked", "false");
        await expect(rail(page).getByRole("button", { name: /Dove\s*· in onda/ })).toBeVisible();
    });

    test("menù tenuto pronto: in Controlla la frase, il Calendario non cambia e i controlli fatti", async ({ page }) => {
        await open(page, "menu", "menu");
        await walkMenu(page, "Pranzo veloce");
        await toReady(page);
        await expect(main(page).getByText(/^Il menù «Pranzo veloce» è pronto ma spento: nessun cliente lo vede finché non lo metti in onda\.$/)).toBeVisible();
        await expect(main(page).getByText("Niente: non è in onda in nessuna sede.")).toBeVisible();
        await expect(main(page).getByText("Il contenuto è completo")).toBeVisible();
        await expect(main(page).getByText("Nessun errore da correggere")).toBeVisible();
        await expect(main(page).getByText("Pronto per andare in onda in qualunque sede")).toBeVisible();
        await expect(button(page, "Salva e tieni pronto")).toBeEnabled();
        await expect(button(page, "Metti in onda")).toHaveCount(0);
    });

    test("stile: «Sì, lo metto in onda» fa la sua regola nel Calendario", async ({ page }) => {
        stub.onWrite("styles.POST", ({ body }) => ({ id: ID.style, ...first(body) }));
        stub.onWrite("style_versions.POST", ({ body }) => ({ id: ID.version, ...first(body) }));
        stub.onWrite("styles.PATCH", ({ body }) => ({ id: ID.style, name: "Natale", ...first(body) }));
        wireRule(stub);
        await open(page, "stile", "stili");
        await next(page);
        await main(page).getByLabel("Nome dello stile").fill("Natale");
        await next(page);
        await next(page);
        await onAir(page);
        // in tutte le sedi e sempre sarebbe a pari merito con lo stile di base, e il Calendario lo ferma:
        // una sede e certi momenti, come il menù di «Metti in onda»
        await sediBox(page).getByRole("checkbox", { name: "Porto e2e" }).click();
        await next(page);
        await button(page, /^Solo in certi momenti/).click();
        // in quelle ore c'è già lo stile di base: la seconda parte, «Con gli altri stili»
        await button(page, "Avanti: con gli altri stili").click();
        await expect(main(page).getByText("Che stile prende la pagina in quelle ore?")).toBeVisible();
        await stuck(page, "Scegli: prende il posto dell'altro o lo lascia");
        // «Lascia gli altri» il database di oggi non lo sa tenere: si vede, il salvataggio aspetta
        await insieme(page, "Lascia gli altri");
        await next(page);
        await expect(main(page).getByText(/la pagina prende lo stile «Natale», ma dove c'è già un altro stile resta quello/)).toBeVisible();
        await expect(main(page).getByText("Lascia gli altri stili: si salva col database nuovo").first()).toBeVisible();
        await button(page, "Indietro").click();
        await insieme(page, "Prende il posto degli altri");
        await next(page);
        await button(page, "Metti in onda").click();
        await finito(page);
        await expect(page).toHaveURL(/\/styles$/, { timeout: 15_000 });
        expect(bodyOf(stub, "schedules.POST")).toMatchObject({ rule_type: "layout" });
        expect(bodyOf(stub, "schedule_layout.POST")).toMatchObject({ style_id: ID.style });
    });

    test("in evidenza tenuto pronto: resta bozza, nessuna regola nel Calendario", async ({ page }) => {
        wireEvid();
        await open(page, "evidenza", "evidenza");
        await main(page).getByLabel("Titolo", { exact: true }).fill("Chiusi per ferie");
        await toReady(page);
        await saveReady(page);
        await finito(page);
        await expect(page).toHaveURL(new RegExp(`/featured/${ID.featured}$`), { timeout: 15_000 });
        expect(bodyOf(stub, "featured_contents.POST")).toMatchObject({ title: "Chiusi per ferie", status: "draft" });
        expect(writesOf(stub, "schedules.POST")).toHaveLength(0);
    });

    test("storia tenuta pronta: resta bozza", async ({ page }) => {
        stub.onWrite("stories.POST", ({ body }) => ({ id: ID.story, ...first(body) }));
        stub.onWrite("stories.PATCH", ({ body }) => ({ id: ID.story, ...first(body) }));
        await open(page, "storia", "storie");
        await next(page);
        // la storia del locale: con più sedi, una sede
        await button(page, /^Il locale/).click();
        await stuck(page, "Scegli la sede");
        await main(page).getByRole("radiogroup", { name: "Sedi" }).getByRole("radio").first().click();
        await next(page);
        await main(page).getByLabel("Titolo", { exact: true }).fill("Il forno a legna");
        await next(page);
        await button(page, "Testo").click();
        await main(page).getByRole("textbox", { name: "Scrivi un paragrafo..." }).fill("Lo accendiamo alle sei.");
        await next(page);
        await button(page, /^No, per ora la tengo pronta/).click();
        await next(page);
        await expect(main(page).getByText(/^La storia «Il forno a legna» è pronta ma spenta: nessun cliente la vede finché non la metti in onda\.$/)).toBeVisible();
        await button(page, "Salva e tieni pronta").click();
        await finito(page);
        await expect(page).toHaveURL(new RegExp(`/stories/${ID.story}$`), { timeout: 15_000 });
        expect(bodyOf(stub, "stories.PATCH")).toMatchObject({ status: "draft", product_id: null });
        expect(bodyOf(stub, "stories.PATCH").activity_id).toBeTruthy();
    });

    test("«Metti in onda» dall'elenco: si apre la modifica già sul «Dove», con «Sì» scelto; poi il «Quando»", async ({ page }) => {
        wireEvid();
        await nataleDraft(page);
        await openBusinessPageByUrl(page, `crea/evidenza/${FEATURED.natale}?da=evidenza&metti=1`);
        await expect(main(page).getByRole("heading", { name: "Dove", exact: true })).toBeVisible({ timeout: 20_000 });
        await expect(button(page, /^Sì, lo metto in onda/)).toHaveAttribute("aria-pressed", "true");
        // le sedi sono quelle della sua voce
        await expect(allSedi(page)).toHaveAttribute("aria-checked", "true");
        await next(page);
        await expect(main(page).getByRole("heading", { name: "Quando", exact: true })).toBeVisible();
        await expect(main(page).getByText("È la sua voce nel Calendario: cambiandola qui, cambia anche lì.")).toBeVisible();
        await next(page);
        // il Dove e il Quando, ciascuno col suo «Prima» e «Adesso»
        await expect(main(page).getByText("Prima: non in onda")).toHaveCount(2);
        await expect(main(page).getByText(/^Adesso: in onda, /)).toHaveCount(2);
        await button(page, "Salva le modifiche").click();
        await expect(page).toHaveURL(/\/featured/, { timeout: 15_000 });
        expect(writesOf(stub, "featured_contents.PATCH").map(w => first(w.body))).toContainEqual(expect.objectContaining({ status: "published" }));
        const on = writesOf(stub, "schedules.PATCH").filter(w => w.params.get("id") === "eq." + RULE.natale);
        expect(on.map(w => first(w.body))).toContainEqual(expect.objectContaining({ enabled: true }));
    });

    test("dal Calendario (punti 22 e 24): solo il dove e il quando; da «Aggiungi» il pulsante è «Metti in onda» e si torna al Calendario", async ({ page }) => {
        wireEvid();
        // «Modifica completa»: le caselle sono solo quelle del Calendario
        await openBusinessPageByUrl(page, `crea/evidenza/${FEATURED.natale}?da=calendario`);
        await expect(main(page).getByRole("heading", { name: "Cosa vuoi modificare?" })).toBeVisible({ timeout: 20_000 });
        await expect(main(page).getByRole("navigation", { name: "Percorso" }).getByRole("button", { name: "Calendario" })).toBeVisible();
        await expect(main(page).getByRole("checkbox")).toHaveCount(2);
        await expect(main(page).getByRole("checkbox", { name: /^Dove/ })).toBeVisible();
        await expect(main(page).getByRole("checkbox", { name: /^Quando/ })).toBeVisible();
        // da «Aggiungi», per una cosa pronta: già sul «Dove», e si mette in onda
        await nataleDraft(page);
        await openBusinessPageByUrl(page, `crea/evidenza/${FEATURED.natale}?da=calendario&metti=1`);
        await expect(main(page).getByRole("heading", { name: "Dove", exact: true })).toBeVisible({ timeout: 20_000 });
        await expect(button(page, /^Sì, lo metto in onda/)).toHaveAttribute("aria-pressed", "true");
        await next(page);
        await next(page);
        await expect(main(page).getByRole("heading", { name: "Controlla" })).toBeVisible();
        await expect(button(page, "Salva le modifiche")).toHaveCount(0);
        await button(page, "Metti in onda").click();
        await expect(page).toHaveURL(/\/scheduling\?vista=calendario$/, { timeout: 15_000 });
        const on = writesOf(stub, "schedules.PATCH").filter(w => w.params.get("id") === "eq." + RULE.natale);
        expect(on.map(w => first(w.body))).toContainEqual(expect.objectContaining({ enabled: true }));
    });

    test("spegnere e riaccendere: la voce del Calendario si spegne e resta, poi si riaccende la stessa", async ({ page }) => {
        wireEvid();
        await openBusinessPageByUrl(page, `crea/evidenza/${FEATURED.natale}?da=evidenza`);
        await expect(main(page).getByRole("heading", { name: "Cosa vuoi modificare?" })).toBeVisible({ timeout: 20_000 });
        // punto 8: il Dove e il Quando sono due caselle
        await expect(main(page).getByRole("checkbox", { name: /^Dove In onda · Tutte le sedi/ })).toBeVisible();
        await expect(main(page).getByRole("checkbox", { name: /^Quando In onda · / })).toBeVisible();
        await main(page).getByRole("checkbox", { name: /^Dove/ }).click();
        await next(page);
        // modificando si parte da com'è: in onda
        await expect(button(page, /^Sì, lo metto in onda/)).toHaveAttribute("aria-pressed", "true");
        await button(page, /^No, per ora lo tengo pronto/).click();
        await expect(main(page).getByText(/^Salvando, questo contenuto esce da tutte le sedi: da quel momento nessun cliente lo vede\. La sua voce nel Calendario resta, spenta/)).toBeVisible();
        // spento, il «Quando» si salta: «Avanti» porta a «Controlla»
        await next(page);
        await expect(main(page).getByRole("heading", { name: "Controlla" })).toBeVisible();
        await expect(main(page).getByText(/^Prima: in onda, /)).toBeVisible();
        await expect(main(page).getByText(/esce da tutte le sedi: da quando salvi nessun cliente lo vede\./)).toBeVisible();
        await expect(main(page).getByText(/si spegne e resta lì, pronta per tornare in onda\./)).toBeVisible();
        await button(page, "Salva le modifiche").click();
        await expect(page).toHaveURL(/\/featured/, { timeout: 15_000 });
        const off = writesOf(stub, "schedules.PATCH").filter(w => w.params.get("id") === "eq." + RULE.natale);
        expect(off.map(w => first(w.body))).toEqual([{ enabled: false }]);
        expect(writesOf(stub, "schedules.DELETE")).toHaveLength(0);
    });

    test("riaccendere un contenuto pronto con la sua voce: torna pubblicato, la voce si riscrive accesa", async ({ page }) => {
        wireEvid();
        await nataleDraft(page);
        await openBusinessPageByUrl(page, `crea/evidenza/${FEATURED.natale}?da=evidenza`);
        await expect(main(page).getByRole("checkbox", { name: /^Dove Non in onda/ })).toBeVisible({ timeout: 20_000 });
        await expect(main(page).getByRole("checkbox", { name: /^Quando Non in onda/ })).toBeVisible();
        await main(page).getByRole("checkbox", { name: /^Dove/ }).click();
        await next(page);
        await expect(button(page, /^No, per ora lo tengo pronto/)).toHaveAttribute("aria-pressed", "true");
        await onAir(page);
        // rimesso in onda, «Avanti» passa dal «Quando» anche se non era scelto
        await next(page);
        await expect(main(page).getByRole("heading", { name: "Quando", exact: true })).toBeVisible();
        await next(page);
        await button(page, "Salva le modifiche").click();
        await expect(page).toHaveURL(/\/featured/, { timeout: 15_000 });
        expect(writesOf(stub, "featured_contents.PATCH").map(w => first(w.body))).toContainEqual(expect.objectContaining({ status: "published" }));
        expect(writesOf(stub, "schedules.POST")).toHaveLength(0);
    });

    test("spento in una regola con altri contenuti: ne fa una sua spenta e l'altra resta accesa", async ({ page }) => {
        wireEvid();
        await openBusinessPageByUrl(page, `crea/evidenza/${FEATURED.jazz}?da=evidenza`);
        await expect(main(page).getByRole("heading", { name: "Cosa vuoi modificare?" })).toBeVisible({ timeout: 20_000 });
        await main(page).getByRole("checkbox", { name: /^Dove/ }).click();
        await next(page);
        await button(page, /^No, per ora lo tengo pronto/).click();
        await next(page);
        await button(page, "Salva le modifiche").click();
        await expect(page).toHaveURL(/\/featured/, { timeout: 15_000 });
        expect(writesOf(stub, "schedules.POST")).toHaveLength(1);
        const mine = writesOf(stub, "schedules.PATCH").filter(w => w.params.get("id") === "eq." + ID.rule).map(w => first(w.body));
        expect(mine).toContainEqual(expect.objectContaining({ enabled: false }));
        // la regola di partenza non si spegne: esce solo lui
        const shared = writesOf(stub, "schedules.PATCH").filter(w => w.params.get("id") === "eq." + RULE.promoPorto).map(w => first(w.body));
        expect(shared).not.toContainEqual(expect.objectContaining({ enabled: false }));
    });

    test("chi non gestisce il Calendario non sceglie, nemmeno modificando: niente «Dove» né «Quando»", async ({ page }) => {
        await stub.revoke("scheduling.write");
        await openBusinessPageByUrl(page, `crea/evidenza/${FEATURED.natale}?da=evidenza`);
        await stub.revoked;
        await expect(main(page).getByRole("heading", { name: "Cosa vuoi modificare?" })).toBeVisible({ timeout: 20_000 });
        await expect(main(page).getByRole("checkbox", { name: /^(Dove|Quando)/ })).toHaveCount(0);
    });
});
