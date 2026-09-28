import { expect, test, type Locator, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";
import { INGREDIENT, PRODUCT, RULE_ID, stubDisponibilita, type DisponibilitaStub, type WriteCall } from "./disponibilitaStub";
import type { Row } from "./restStub";

/**
 * Disponibilità della sede (lotto `ds-5-coda`, P0). Scritto sulla pagina di
 * **oggi**, prima di ricomporla: deve restare verde passo dopo passo. Dove un
 * controllo cambierà (il filtro: segmenti oggi, chip coi conteggi domani; la
 * vista: tab interne oggi, `?tab=` domani) il locator accetta entrambi. Sola
 * lettura e stato d'errore sono `test.fail` finché il passo non li porta.
 *
 * Sede vera (la prima della griglia), dati della pagina finti in
 * `disponibilitaStub.ts`.
 */

function main(page: Page) {
    return page.getByRole("main");
}

function writes(stub: DisponibilitaStub, key: string): WriteCall[] {
    return stub.writes.filter(w => w.key === key);
}

/** Apre la prima sede, installa lo stub e va su Disponibilità. Ritorna nome e id della sede. */
async function openDisponibilita(page: Page, options: { noRule?: boolean; before?: (stub: DisponibilitaStub) => Promise<void> | void } = {}): Promise<{ stub: DisponibilitaStub; name: string }> {
    await openBusinessPage(page, "locations", "Sedi");
    await page.getByRole("radio", { name: "Vista griglia" }).click();
    const firstCard = main(page).getByRole("listitem").first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    const link = firstCard.getByRole("link").first();
    const name = (await link.innerText()).split("\n")[0].trim();
    const href = (await link.getAttribute("href")) ?? "";
    const activityId = /\/locations\/([0-9a-f-]+)/.exec(href)?.[1] ?? "";
    const stub = await stubDisponibilita(page, activityId, { noRule: options.noRule });
    await options.before?.(stub);
    await page.goto(href.replace(/[?#].*$/, "").replace(/\/locations\/([0-9a-f-]+).*$/, "/locations/$1/disponibilita"));
    return { stub, name };
}

function productRow(page: Page, name: string): Locator {
    return main(page).getByText(name, { exact: true }).locator("xpath=ancestor::*[@role='row' or contains(@class,'row')][.//*[@role='radio']][1]");
}

async function filterBy(page: Page, label: RegExp): Promise<void> {
    await main(page).getByRole("radio", { name: label }).or(main(page).getByRole("button", { name: label })).first().click();
}

async function noSideScroll(page: Page): Promise<void> {
    const overflow = await page.evaluate(() => {
        const de = document.documentElement;
        const scrollers = [de, ...Array.from(document.querySelectorAll<HTMLElement>("main"))];
        return Math.max(...scrollers.map(el => el.scrollWidth - el.clientWidth));
    });
    expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("Disponibilità — prodotti", () => {
    test("il menù attivo, la regola, i prodotti coi loro stati", async ({ page }) => {
        const { name } = await openDisponibilita(page);
        await expect(main(page).getByText("Big e2e", { exact: true })).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByText(new RegExp(`Stai modificando solo ${name}`))).toBeVisible();
        await expect(main(page).getByText("Menù e2e")).toBeVisible();
        await expect(main(page).getByText("Pranzo e2e")).toBeVisible();
        await expect(main(page).getByRole("link", { name: "Vedi la regola" })).toHaveAttribute("href", new RegExp(`/scheduling/${RULE_ID}$`));
        await expect(main(page).getByText("Panini").first()).toBeVisible();
        await expect(main(page).getByText(/7[.,]50/)).toBeVisible();
        await expect(main(page).getByText(/3 prodotti totali · 1 nascosto · 1 non disponibile/)).toBeVisible();
        await expect(productRow(page, "Crispy e2e").getByRole("radio", { name: "Nascosto" })).toBeChecked();
        await expect(productRow(page, "Coca e2e").getByRole("radio", { name: "Non disponibile" })).toBeChecked();
        await expect(productRow(page, "Big e2e").getByRole("radio", { name: "Visibile" })).toBeChecked();
    });

    test("nascondere un prodotto scrive la modifica a mano della sede", async ({ page }) => {
        const { stub } = await openDisponibilita(page);
        await expect(main(page).getByText("Big e2e", { exact: true })).toBeVisible({ timeout: 15_000 });
        await productRow(page, "Big e2e").getByRole("radio", { name: "Nascosto" }).click();
        await expect.poll(() => writes(stub, "activity_product_overrides.POST").length).toBe(1);
        const body = writes(stub, "activity_product_overrides.POST")[0].body as Row[];
        expect(body[0]).toMatchObject({ product_id: PRODUCT.big, visible_override: false, mode: "hide" });
        await expect(productRow(page, "Big e2e").getByRole("radio", { name: "Nascosto" })).toBeChecked();
    });

    test("rimettere visibile toglie la modifica a mano", async ({ page }) => {
        const { stub } = await openDisponibilita(page);
        await expect(main(page).getByText("Crispy e2e", { exact: true })).toBeVisible({ timeout: 15_000 });
        await productRow(page, "Crispy e2e").getByRole("radio", { name: "Visibile" }).click();
        await expect.poll(() => writes(stub, "activity_product_overrides.DELETE").length).toBe(1);
        await expect(productRow(page, "Crispy e2e").getByRole("radio", { name: "Visibile" })).toBeChecked();
    });

    test("filtro per stato e ricerca", async ({ page }) => {
        await openDisponibilita(page);
        await expect(main(page).getByText("Big e2e", { exact: true })).toBeVisible({ timeout: 15_000 });
        await filterBy(page, /^Nascosti/);
        await expect(main(page).getByText("Crispy e2e", { exact: true })).toBeVisible();
        await expect(main(page).getByText("Big e2e", { exact: true })).toHaveCount(0);
        await filterBy(page, /^Tutti/);
        await main(page).getByPlaceholder(/Cerca prodotto/).fill("coca");
        await expect(main(page).getByText("Coca e2e", { exact: true })).toBeVisible();
        await expect(main(page).getByText("Big e2e", { exact: true })).toHaveCount(0);
    });

    test("senza scrittura sulla sede: i controlli sono spenti", async ({ page }) => {
        await openDisponibilita(page, { before: stub => stub.revoke("activity.manage") });
        await expect(main(page).getByText("Big e2e", { exact: true })).toBeVisible({ timeout: 15_000 });
        await expect(productRow(page, "Big e2e").getByRole("radio", { name: "Nascosto" })).toBeDisabled();
        await expect(main(page).getByText(/Sola lettura/)).toBeVisible();
    });

    test("a 375 nessuno scroll orizzontale", async ({ page }) => {
        test.fail(true, "Oggi a 375 la tabella sfora di 49 px (#581)");
        await openDisponibilita(page);
        await expect(main(page).getByText("Big e2e", { exact: true })).toBeVisible({ timeout: 15_000 });
        await page.setViewportSize({ width: 375, height: 800 });
        await expect(main(page).getByText("Big e2e", { exact: true })).toBeVisible();
        await noSideScroll(page);
    });
});

test.describe("Disponibilità — ingredienti", () => {
    test("un ingrediente cambia tutti i suoi prodotti, dopo la conferma", async ({ page }) => {
        const { stub } = await openDisponibilita(page);
        await expect(main(page).getByText("Big e2e", { exact: true })).toBeVisible({ timeout: 15_000 });
        await main(page).getByRole("tab", { name: /Ingredienti/ }).click();
        await expect(main(page).getByText("Pane e2e", { exact: true })).toBeVisible();
        await expect(main(page).getByText("Nessun prodotto in questo catalogo").first()).toBeVisible();
        const pane = main(page).getByText("Pane e2e", { exact: true }).locator("xpath=ancestor::*[@role='row' or contains(@class,'row')][.//*[@role='radio']][1]");
        await pane.getByRole("radio", { name: "Nascondi tutti" }).click();
        const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog")).last();
        await expect(dialog).toBeVisible();
        expect(writes(stub, "activity_product_overrides.POST")).toHaveLength(0);
        await dialog.getByRole("button", { name: /Nascondi/ }).last().click();
        await expect.poll(() => writes(stub, "activity_product_overrides.POST").length + writes(stub, "activity_product_overrides.PATCH").length).toBeGreaterThan(0);
        const touched = [...writes(stub, "activity_product_overrides.POST").flatMap(w => w.body as Row[]).map(r => r.product_id), ...writes(stub, "activity_product_overrides.PATCH").flatMap(w => w.params.get("product_id") ?? "")];
        expect(touched.join(",")).toContain(PRODUCT.big);
        expect(INGREDIENT.pane).toBeTruthy();
    });
});

test.describe("Disponibilità — vuoto ed errore", () => {
    test("nessun menù attivo lo dice", async ({ page }) => {
        await openDisponibilita(page, { noRule: true });
        await expect(main(page).getByText("Nessun catalogo attivo").or(main(page).getByText("Nessun menù attivo"))).toBeVisible({ timeout: 15_000 });
    });

    test("errore di caricamento: lo dice e offre «Riprova»", async ({ page }) => {
        test.fail(true, "Oggi: toast e «Nessun catalogo attivo» (#567, B2)");
        await openDisponibilita(page, {
            before: async () => {
                await page.route(/\/rest\/v1\/activity_product_overrides\?/, route => route.fulfill({ status: 500, json: { code: "E2E", message: "rotto" } }));
            }
        });
        await expect(main(page).getByRole("button", { name: "Riprova" })).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByText("Nessun catalogo attivo")).toHaveCount(0);
    });
});
