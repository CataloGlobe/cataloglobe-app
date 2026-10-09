import { expect, test, type Page } from "@playwright/test";
import { openBusinessPageByUrl } from "./business";
import { SEDE, stubProgrammazione, type ProgrammazioneStub, type WriteCall } from "./programmazioneStub";
import type { Row } from "./restStub";

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

let stub: ProgrammazioneStub;

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
        await expect(steps.getByRole("button")).toHaveText(["1Che menù è", "2Da dove parti", "3Sezioni e piatti", "4Quando", "5Dove", "6Controlla", "E adesso?"]);
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
        // Quando: prima la domanda, poi il modulo del Calendario
        await expect(button(page, /^Sempre/)).toHaveAttribute("aria-pressed", "true");
        await button(page, /^Solo in certi momenti/).click();
        await expect(main(page).getByText("Anteprima · Menù")).toBeVisible();
        await next(page);
        // Dove: solo Porto
        await main(page).getByRole("checkbox", { name: "Centro e2e" }).click();
        await main(page).getByRole("checkbox", { name: "Lago e2e" }).click();
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

    test("dal Calendario: «Crea un menù nuovo» tiene da parte la bozza e apre il tunnel", async ({ page }) => {
        await openBusinessPageByUrl(page, "scheduling?type=layout");
        await expect(async () => {
            await main(page).getByRole("radio", { name: "Calendario", exact: true }).or(main(page).getByRole("button", { name: "Calendario", exact: true })).filter({ visible: true }).first().click({ timeout: 2_000 });
        }).toPass({ timeout: 15_000 });
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
        await expect(button(page, /^Solo in certi momenti/)).toHaveAttribute("aria-pressed", "true");
        await expect(main(page).getByText("Dalla bozza che hai tenuto da parte nel Calendario: puoi cambiarlo.")).toBeVisible();
        await next(page);
        await expect(main(page).getByRole("checkbox", { name: "Porto e2e" })).toBeChecked();
        await expect(main(page).getByRole("checkbox", { name: "Centro e2e" })).not.toBeChecked();
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
        await next(page);
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
