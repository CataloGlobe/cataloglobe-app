import { expect, test, type Locator, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";
import { MISSING_STORY, SEDE, STORY, stubStorie, type StorieStub, type WriteCall } from "./storieStub";
import type { Row } from "./restStub";

/**
 * Storie (lotto `ds-5-stili-storie-evidenza`, P0). Scritto sulla pagina di
 * **oggi**, prima di ricomporla: deve restare verde passo dopo passo.
 *
 * Dati finti in `storieStub.ts`; permessi, azienda e sidebar veri. Nessuna
 * scrittura parte: ogni gesto che scrive ha un test di cablaggio. Dove un nome
 * o un controllo cambierà nei passi successivi il locator accetta quello di
 * oggi e quello di domani (il cappello: tab oggi, card + drawer domani).
 */

function main(page: Page) {
    return page.getByRole("main");
}

function dialog(page: Page): Locator {
    return page.getByRole("dialog").or(page.getByRole("alertdialog")).last();
}

function write(stub: StorieStub, key: string): WriteCall | undefined {
    return stub.writes.find(w => w.key === key);
}

function writes(stub: StorieStub, key: string): WriteCall[] {
    return stub.writes.filter(w => w.key === key);
}

function storyTitle(page: Page, title: string): Locator {
    return main(page).getByText(title, { exact: true }).first();
}

function actionsOf(anchor: Locator): Locator {
    return anchor
        .locator("xpath=ancestor::*[.//button[starts-with(@aria-label,'Azioni')]][1]")
        .getByRole("button", { name: /^Azioni/ })
        .first();
}

async function openList(page: Page): Promise<void> {
    await openBusinessPage(page, "stories", "Storie");
    await expect(storyTitle(page, "Il nostro forno e2e")).toBeVisible({ timeout: 15_000 });
}

async function openStory(page: Page, id: string): Promise<void> {
    if (!/\/business\/[0-9a-f-]+\//.test(page.url())) await openBusinessPage(page, "stories", "Storie");
    await page.goto(page.url().replace(/\/business\/([0-9a-f-]+)\/.*$/, `/business/$1/stories/${id}`));
}

async function noSideScroll(page: Page): Promise<void> {
    const overflow = await page.evaluate(() => {
        const de = document.documentElement;
        const scrollers = [de, ...Array.from(document.querySelectorAll<HTMLElement>("main"))];
        return Math.max(...scrollers.map(el => el.scrollWidth - el.clientWidth));
    });
    expect(overflow).toBeLessThanOrEqual(0);
}

/**
 * Apre il form del cappello e ne ritorna il contenitore: la tab «Storia del
 * brand» oggi, il drawer «Il cappello» domani (§50.11/4).
 */
async function openBrand(page: Page): Promise<Locator> {
    const tab = page.getByRole("tab", { name: "Storia del brand" });
    if (await tab.isVisible().catch(() => false)) {
        await tab.click();
        return main(page);
    }
    await main(page).getByRole("button", { name: /Modifica il cappello|^Modifica$/ }).first().click();
    return dialog(page);
}

function titleField(page: Page): Locator {
    return main(page).getByRole("textbox", { name: /^Titolo/ }).first();
}

function saveButton(page: Page): Locator {
    return page.getByRole("button", { name: "Salva", exact: true }).first();
}

let stub: StorieStub;

test.beforeEach(async ({ page }) => {
    stub = await stubStorie(page);
});

test.describe("Storie — elenco", () => {
    test("storie nell'ordine dei clienti, prodotto collegato, stato", async ({ page }) => {
        await openList(page);
        await expect(page).toHaveTitle(/^Storie — .+ \| CataloGlobe$/);
        const order = await main(page).getByText(/^(Il nostro forno|La brigata|Natale) e2e$/).allTextContents();
        expect(order).toEqual(["Il nostro forno e2e", "La brigata e2e", "Natale e2e"]);
        await expect(main(page).getByText("Dal 1987")).toBeVisible();
        await expect(main(page).getByText("Pane di segale e2e")).toBeVisible();
        await expect(main(page).getByText("Bozza", { exact: true })).toBeVisible();
        await expect(main(page).getByText("Pubblicata", { exact: true }).first()).toBeVisible();
        await expect(page.getByRole("button", { name: "Crea storia" }).first()).toBeVisible();
    });

    test("la riga apre l'editor", async ({ page }) => {
        await openList(page);
        await storyTitle(page, "La brigata e2e").click();
        await expect(page).toHaveURL(new RegExp(`/stories/${STORY.brigata}$`));
    });

    test("crea una storia in bozza e apre l'editor", async ({ page }) => {
        stub.onWrite("stories.POST", call => {
            const row = { id: "e2e57000-0000-4000-a000-000000000901", tenant_id: (call.body as Row).tenant_id, activity_id: null, cover_media: null, body_blocks: [], product_id: null, sort_order: 0, created_at: "2026-03-21T10:00:00.000Z", updated_at: "2026-03-21T10:00:00.000Z", ...(call.body as Row) };
            stub.tables.stories.push(row);
            return row;
        });
        await openList(page);
        await page.getByRole("button", { name: "Crea storia" }).first().click();
        const drawer = dialog(page);
        await drawer.getByRole("textbox", { name: /^Titolo/ }).fill("Le materie prime e2e");
        await drawer.getByRole("textbox", { name: /^Occhiello/ }).fill("Il grano");
        await drawer.getByRole("button", { name: /^Crea/ }).click();
        await expect.poll(() => write(stub, "stories.POST")?.body).toMatchObject({
            title: "Le materie prime e2e",
            eyebrow: "Il grano",
            status: "draft"
        });
        await expect(page).toHaveURL(/\/stories\/e2e57000-0000-4000-a000-000000000901$/);
        await expect(titleField(page)).toHaveValue("Le materie prime e2e", { timeout: 15_000 });
    });

    test("elimina una storia", async ({ page }) => {
        stub.onWrite("stories.DELETE", () => null);
        await openList(page);
        await actionsOf(storyTitle(page, "Natale e2e")).click();
        await page.getByRole("menuitem", { name: "Elimina" }).click();
        await dialog(page).getByRole("button", { name: /^(Conferma eliminazione|Elimina)/i }).click();
        await expect.poll(() => write(stub, "stories.DELETE")?.params.get("id")).toBe(`eq.${STORY.natale}`);
    });

    test("riordina da tastiera: l'ordine si salva subito", async ({ page }) => {
        stub.onWrite("stories.PATCH", () => null);
        await openList(page);
        const handle = main(page).getByRole("button", { name: /Trascina per riordinare|Riordina/ }).first();
        // Stesse pause di Menù: dnd-kit avvia il trascinamento al frame dopo.
        await handle.focus();
        await page.keyboard.press("Space");
        await page.waitForTimeout(200);
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(300);
        await page.keyboard.press("Space");
        await expect.poll(() => writes(stub, "stories.PATCH").length).toBeGreaterThanOrEqual(2);
        const forno = writes(stub, "stories.PATCH").find(w => w.params.get("id") === `eq.${STORY.forno}`);
        expect(forno?.body).toEqual({ sort_order: 2 });
    });

    test("il cappello: si modifica e si salva", async ({ page }) => {
        stub.onWrite("rpc.update_tenant_story_settings", () => null);
        await openList(page);
        const form = await openBrand(page);
        const title = form.getByRole("textbox", { name: /^Titolo/ });
        await expect(title).toHaveValue("La nostra storia e2e", { timeout: 15_000 });
        await title.fill("Chi siamo e2e");
        // Oggi Salva è in testata (dentro main), domani nel piè del drawer.
        await form.getByRole("button", { name: "Salva", exact: true }).first().click();
        await expect.poll(() => write(stub, "rpc.update_tenant_story_settings")?.body).toMatchObject({
            p_story_title: "Chi siamo e2e",
            p_story_intro: "Tre generazioni dietro lo stesso bancone.",
            p_website: "https://example.com"
        });
    });

    test("senza stories.write: niente crea, elimina, riordino", async ({ page }) => {
        await stub.revoke("stories.write");
        await openList(page);
        await stub.revoked;
        await expect(page.getByRole("button", { name: "Crea storia" })).toHaveCount(0);
        await expect(main(page).getByRole("button", { name: /Trascina per riordinare|Riordina/ })).toHaveCount(0);
        await actionsOf(storyTitle(page, "Natale e2e")).click();
        await expect(page.getByRole("menuitem", { name: "Elimina" })).toHaveCount(0);
    });
});

test.describe("Storie — elenco ricomposto (P5)", () => {
    test("il cappello in cima, com'è pubblicamente; l'ordine è detto", async ({ page }) => {
        await openList(page);
        await expect(page.getByRole("tab", { name: "Storia del brand" })).toHaveCount(0);
        await expect(main(page).getByText("Il cappello", { exact: true })).toBeVisible();
        await expect(main(page).getByText("La nostra storia e2e")).toBeVisible();
        await expect(main(page).getByText("Tre generazioni dietro lo stesso bancone.")).toBeVisible();
        await expect(main(page).getByText(/Trascina per cambiare l'ordine/)).toBeVisible();
    });

    test("cappello: Annulla scarta senza scrivere", async ({ page }) => {
        await openList(page);
        await main(page).getByRole("button", { name: "Modifica", exact: true }).click();
        const drawer = dialog(page);
        await drawer.getByRole("textbox", { name: /^Titolo/ }).fill("Da buttare");
        await drawer.getByRole("button", { name: "Annulla" }).click();
        await expect(drawer).toHaveCount(0);
        await expect(main(page).getByText("La nostra storia e2e")).toBeVisible();
        expect(stub.writes).toHaveLength(0);
    });

    test("errori di caricamento: elenco e cappello lo dicono, «Riprova» ricarica", async ({ page }) => {
        let fail = true;
        await page.route(/\/rest\/v1\/stories\?/, route =>
            fail && route.request().method() === "GET" ? route.fulfill({ status: 500, json: { message: "e2e" } }) : route.fallback()
        );
        await page.route(/\/rest\/v1\/tenants\?/, route =>
            fail && (new URL(route.request().url()).searchParams.get("select") ?? "").includes("story_title")
                ? route.fulfill({ status: 500, json: { message: "e2e" } })
                : route.fallback()
        );
        await openBusinessPage(page, "stories", "Storie");
        await expect(main(page).getByText("Non è stato possibile caricare le storie")).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByText("Non è stato possibile caricare il cappello.")).toBeVisible();
        fail = false;
        for (const retry of await main(page).getByRole("button", { name: "Riprova" }).all()) await retry.click();
        await expect(storyTitle(page, "Il nostro forno e2e")).toBeVisible();
        await expect(main(page).getByText("La nostra storia e2e")).toBeVisible();
    });
});

test.describe("Storie — editor", () => {
    test("bozza di pagina: titolo e stato, un Salva", async ({ page }) => {
        stub.onWrite("stories.PATCH", call => {
            const row = stub.tables.stories.find(s => `eq.${s.id}` === call.params.get("id"));
            if (row) Object.assign(row, call.body as Row);
            return row ?? null;
        });
        await openStory(page, STORY.natale);
        await expect(titleField(page)).toHaveValue("Natale e2e", { timeout: 15_000 });
        await titleField(page).fill("Natale 2026 e2e");
        await page.getByRole("radio", { name: "Pubblicata" }).first().click();
        await saveButton(page).click();
        await expect.poll(() => write(stub, "stories.PATCH")?.body).toMatchObject({
            title: "Natale 2026 e2e",
            status: "published",
            body_blocks: []
        });
    });

    test("un blocco di testo nuovo entra nel racconto", async ({ page }) => {
        stub.onWrite("stories.PATCH", () => stub.tables.stories.find(s => s.id === STORY.forno) ?? null);
        await openStory(page, STORY.forno);
        await expect(titleField(page)).toHaveValue("Il nostro forno e2e", { timeout: 15_000 });
        await main(page).getByRole("button", { name: /^Aggiungi/ }).first().click();
        await page.getByRole("menuitem", { name: "Testo" }).click();
        await main(page).getByPlaceholder("Scrivi un paragrafo...").last().fill("Oggi il forno è a gas.");
        await saveButton(page).click();
        await expect.poll(() => ((write(stub, "stories.PATCH")?.body as Row | undefined)?.body_blocks as Row[] | undefined)?.length).toBe(3);
        const blocks = (write(stub, "stories.PATCH")?.body as Row).body_blocks as Row[];
        expect(blocks[2]).toMatchObject({ type: "text", content: "Oggi il forno è a gas." });
    });

    test("prodotto collegato: si vede e si toglie", async ({ page }) => {
        stub.onWrite("stories.PATCH", () => stub.tables.stories.find(s => s.id === STORY.brigata) ?? null);
        await openStory(page, STORY.brigata);
        await expect(main(page).getByText("Pane di segale e2e")).toBeVisible({ timeout: 15_000 });
        await main(page).getByRole("button", { name: /^(Rimuovi|Scollega|Togli)/ }).first().click();
        await saveButton(page).click();
        await expect.poll(() => write(stub, "stories.PATCH")?.body).toMatchObject({ product_id: null });
    });

    test("Annulla chiede conferma e torna al salvato", async ({ page }) => {
        await openStory(page, STORY.forno);
        await expect(titleField(page)).toHaveValue("Il nostro forno e2e", { timeout: 15_000 });
        await titleField(page).fill("Da buttare");
        await page.getByRole("button", { name: "Annulla", exact: true }).first().click();
        await page.getByRole("alertdialog").getByRole("button", { name: "Scarta" }).click();
        await expect(titleField(page)).toHaveValue("Il nostro forno e2e");
        expect(stub.writes).toHaveLength(0);
    });

    test("storia che non esiste", async ({ page }) => {
        await openStory(page, MISSING_STORY);
        await expect(main(page).getByText(/Storia non trovata/)).toBeVisible({ timeout: 15_000 });
        await main(page).getByRole("button", { name: /Torna/ }).click();
        await expect(page).toHaveURL(/\/stories$/);
    });

    test("senza stories.write: niente Salva", async ({ page }) => {
        await stub.revoke("stories.write");
        await openStory(page, STORY.forno);
        await stub.revoked;
        await expect(titleField(page)).toHaveValue("Il nostro forno e2e", { timeout: 15_000 });
        await expect(page.getByRole("button", { name: "Salva", exact: true })).toHaveCount(0);
    });
});

test.describe("Storie — editor ricomposto (P6)", () => {
    test("il racconto conta blocchi e immagini", async ({ page }) => {
        await openStory(page, STORY.forno);
        await expect(titleField(page)).toHaveValue("Il nostro forno e2e", { timeout: 15_000 });
        await expect(main(page).getByText("Il racconto", { exact: true })).toBeVisible();
        await expect(main(page).getByText("2 blocchi · 0 immagini su 8")).toBeVisible();
    });

    test("uscita con modifiche: la guardia chiede, «Annulla» resta", async ({ page }) => {
        await openStory(page, STORY.forno);
        await expect(titleField(page)).toHaveValue("Il nostro forno e2e", { timeout: 15_000 });
        await titleField(page).fill("Il nostro forno bis");
        await page.getByRole("navigation", { name: "Menu principale" }).getByRole("link", { name: "Menù" }).click();
        const guard = page.getByRole("alertdialog");
        await expect(guard).toContainText("Modifiche non salvate");
        await guard.getByRole("button", { name: /^(Annulla|Resta)/ }).click();
        await expect(page).toHaveURL(new RegExp(`/stories/${STORY.forno}$`));
        await expect(titleField(page)).toHaveValue("Il nostro forno bis");
    });

    test("errore di caricamento: non è «non trovata», e «Riprova» ricarica", async ({ page }) => {
        let fail = true;
        await page.route(/\/rest\/v1\/stories\?/, route =>
            fail && route.request().method() === "GET" ? route.fulfill({ status: 500, json: { message: "e2e" } }) : route.fallback()
        );
        await openStory(page, STORY.forno);
        await expect(main(page).getByText("Non è stato possibile caricare la storia")).toBeVisible({ timeout: 15_000 });
        fail = false;
        await main(page).getByRole("button", { name: "Riprova" }).click();
        await expect(titleField(page)).toHaveValue("Il nostro forno e2e");
    });
});

test.describe("Storie — permessi (P1)", () => {
    test("editor senza stories.write: campi e blocchi spenti, stato come etichetta", async ({ page }) => {
        await stub.revoke("stories.write");
        await openStory(page, STORY.forno);
        await stub.revoked;
        await expect(main(page).getByText(/^Sola lettura/)).toBeVisible({ timeout: 15_000 });
        await expect(titleField(page)).toBeDisabled();
        await expect(main(page).getByPlaceholder("Scrivi un paragrafo...").first()).toBeDisabled();
        await expect(main(page).getByRole("button", { name: "Trascina per riordinare" }).first()).toBeDisabled();
        await expect(page.getByRole("radio", { name: "Pubblicata" })).toHaveCount(0);
        await expect(page.getByText("Pubblicata", { exact: true }).first()).toBeVisible();
    });

    test("senza stories.read: il blocco, e nessuna lettura delle storie", async ({ page }) => {
        const reads: string[] = [];
        page.on("request", r => {
            if (/\/rest\/v1\/stories\?/.test(r.url())) reads.push(r.url());
        });
        await stub.revoke("stories.read");
        await openStory(page, STORY.forno);
        await stub.revoked;
        await expect(main(page).getByText("Non hai accesso a questa sezione")).toBeVisible({ timeout: 15_000 });
        expect(reads).toHaveLength(0);
    });
});

test.describe("Storie — dove appaiono (§50.13)", () => {
    test("elenco: la colonna «Dove appare»", async ({ page }) => {
        await openList(page);
        const table = main(page).getByRole("table", { name: "Storie" });
        await expect(table.getByRole("columnheader", { name: "Dove appare" })).toBeVisible();
        await expect(table.getByRole("row", { name: /Il nostro forno e2e/ })).toContainText("Tutte le sedi");
        await expect(table.getByRole("row", { name: /La brigata e2e/ })).toContainText("Solo Centro e2e");
        // Una bozza non è «di tutte le sedi ma spenta»: non la vede nessuno.
        await expect(table.getByRole("row", { name: /Natale e2e/ })).toContainText("Da nessuna parte");
    });

    test("elenco: chip coi conteggi e ricerca; filtrando non si riordina", async ({ page }) => {
        await openList(page);
        const chips = main(page).getByRole("radiogroup", { name: "Filtra le storie" });
        await expect(chips.getByRole("radio", { name: /Tutte\s*3/ })).toBeChecked();
        await chips.getByRole("radio", { name: /Bozze\s*1/ }).click();
        await expect(storyTitle(page, "Natale e2e")).toBeVisible();
        await expect(storyTitle(page, "Il nostro forno e2e")).toHaveCount(0);
        await expect(main(page).getByRole("button", { name: /^Riordina/ })).toHaveCount(0);
        await chips.getByRole("radio", { name: /Legate a una sede\s*1/ }).click();
        await expect(storyTitle(page, "La brigata e2e")).toBeVisible();
        await expect(storyTitle(page, "Natale e2e")).toHaveCount(0);
        await expect(chips.getByRole("radio", { name: /Senza copertina\s*3/ })).toBeVisible();
        await chips.getByRole("radio", { name: /Tutte/ }).click();
        await page.getByPlaceholder(/^Cerca/).first().fill("forno");
        await expect(storyTitle(page, "Il nostro forno e2e")).toBeVisible();
        await expect(storyTitle(page, "La brigata e2e")).toHaveCount(0);
    });

    test("editor: «Dove appare» sceglie la sede, in bozza, e il Salva la scrive", async ({ page }) => {
        stub.onWrite("stories.PATCH", call => {
            const row = stub.tables.stories.find(s => `eq.${s.id}` === call.params.get("id"));
            if (row) Object.assign(row, call.body as Row);
            return row ?? null;
        });
        await openStory(page, STORY.forno);
        await expect(titleField(page)).toHaveValue("Il nostro forno e2e", { timeout: 15_000 });
        await expect(main(page).getByText("Compare su tutte le sedi pubblicate.")).toBeVisible();
        await main(page).getByRole("radio", { name: "Una sede" }).click();
        await main(page).getByRole("combobox", { name: "Sede" }).selectOption({ label: "Porto e2e" });
        await expect(main(page).getByText("Compare solo nella pagina di Porto e2e.")).toBeVisible();
        await saveButton(page).click();
        await expect.poll(() => write(stub, "stories.PATCH")?.body).toMatchObject({ activity_id: SEDE.porto });
    });

    test("editor: la storia di una sede la dice già scelta", async ({ page }) => {
        await openStory(page, STORY.brigata);
        await expect(titleField(page)).toHaveValue("La brigata e2e", { timeout: 15_000 });
        await expect(main(page).getByRole("radio", { name: "Una sede" })).toBeChecked();
        await expect(main(page).getByRole("combobox", { name: "Sede" })).toHaveValue(SEDE.centro);
    });
});

test.describe("Storie — larghezze", () => {
    for (const width of [1280, 768, 375]) {
        test(`${width}: elenco ed editor senza scroll di lato`, async ({ page }) => {
            await openList(page);
            await page.setViewportSize({ width, height: 900 });
            await page.reload();
            await expect(storyTitle(page, "Il nostro forno e2e")).toBeVisible({ timeout: 15_000 });
            await noSideScroll(page);
            await openStory(page, STORY.forno);
            await expect(titleField(page)).toBeVisible({ timeout: 15_000 });
            await noSideScroll(page);
        });
    }
});
