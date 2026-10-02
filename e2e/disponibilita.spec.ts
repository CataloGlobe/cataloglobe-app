import { expect, test, type Locator, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";
import {
    asSeatRole,
    INGREDIENT,
    PRODUCT,
    RULE_ID,
    stubDisponibilita,
    TENANT_ID,
    type DisponibilitaOptions,
    type DisponibilitaStub,
    type SeatRole,
    type WriteCall
} from "./disponibilitaStub";
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

type OpenOptions = DisponibilitaOptions & {
    before?: (stub: DisponibilitaStub, activityId: string) => Promise<void> | void;
    /** Ruolo della sola sede aperta; senza, l'utente e2e (owner). */
    role?: SeatRole;
};

/** Apre la prima sede, installa lo stub e va su Disponibilità. Ritorna nome e id della sede. */
async function openDisponibilita(page: Page, options: OpenOptions = {}): Promise<{ stub: DisponibilitaStub; name: string; activityId: string }> {
    await openBusinessPage(page, "locations", "Sedi");
    await page.getByRole("radio", { name: "Vista griglia" }).click();
    const firstCard = main(page).getByRole("listitem").first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    const link = firstCard.getByRole("link").first();
    const name = (await link.innerText()).split("\n")[0].trim();
    const href = (await link.getAttribute("href")) ?? "";
    const activityId = /\/locations\/([0-9a-f-]+)/.exec(href)?.[1] ?? "";
    const stub = await stubDisponibilita(page, activityId, { noRule: options.noRule, rules: options.rules, allHidden: options.allHidden });
    if (options.role) await asSeatRole(page, options.role, activityId);
    await options.before?.(stub, activityId);
    await page.goto(href.replace(/[?#].*$/, "").replace(/\/locations\/([0-9a-f-]+).*$/, "/locations/$1/disponibilita"));
    return { stub, name, activityId };
}

/** La banda dell'esito (§19.2): cosa vedono i clienti, adesso. */
function band(page: Page): Locator {
    return main(page).getByRole("region", { name: "Cosa vedono i clienti" });
}

/** La riga che dice la provenienza, sotto il nome del prodotto. */
function rowText(page: Page, name: string): Locator {
    return productRow(page, name);
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
        await openDisponibilita(page);
        await expect(main(page).getByText("Big e2e", { exact: true })).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByText("Menù e2e").first()).toBeVisible();
        await expect(main(page).getByText("Pranzo e2e").first()).toBeVisible();
        await expect(main(page).getByRole("link", { name: "Vedi la regola" })).toHaveAttribute("href", new RegExp(`/scheduling/${RULE_ID}$`));
        await expect(main(page).getByText("Panini").first()).toBeVisible();
        await expect(main(page).getByText(/7[.,]50/)).toBeVisible();
        await expect(main(page).getByText(/3 prodotti totali · 1 nascosto · 1 non disponibile/)).toBeVisible();
        await expect(productRow(page, "Crispy e2e").getByRole("radio", { name: "Nascosto" })).toBeChecked();
        await expect(productRow(page, "Coca e2e").getByRole("radio", { name: "Non disponibile" })).toBeChecked();
        await expect(productRow(page, "Big e2e").getByRole("radio", { name: /^(Visibile|Come dice la regola)$/ })).toBeChecked();
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
        const backToRule = productRow(page, "Crispy e2e").getByRole("radio", { name: /^(Visibile|Come dice la regola)$/ });
        await backToRule.click();
        await expect.poll(() => writes(stub, "activity_product_overrides.DELETE").length).toBe(1);
        await expect(backToRule).toBeChecked();
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
        await openDisponibilita(page, {
            before: async () => {
                await page.route(/\/rest\/v1\/activity_product_overrides\?/, route => route.fulfill({ status: 500, json: { code: "E2E", message: "rotto" } }));
            }
        });
        await expect(main(page).getByRole("button", { name: "Riprova" })).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByText("Nessun catalogo attivo")).toHaveCount(0);
    });
});

/**
 * Milestone 7, «Cosa vedono i clienti» (§19, §50.20): esito, provenienza,
 * prezzo dalla regola, stati della sede. `test.fail` finché il passo che li
 * porta non li rende veri.
 */
test.describe("Cosa vedono i clienti — esito e provenienza", () => {
    test.fail("la banda dice menù, regola e conteggi di adesso", async ({ page }) => {
        const { name } = await openDisponibilita(page);
        await expect(band(page)).toBeVisible({ timeout: 15_000 });
        await expect(band(page)).toContainText(`I clienti di ${name} vedono Menù e2e`);
        await expect(band(page)).toContainText("1 visibile · 1 nascosto · 1 non disponibile");
        await expect(band(page)).toContainText("Adesso, alle 12:00");
        await expect(band(page).getByRole("link", { name: "Vedi la regola" }).first()).toHaveAttribute("href", new RegExp(`/scheduling/${RULE_ID}$`));
        await expect(band(page).getByRole("link", { name: "Apri pagina pubblica" })).toBeVisible();
        await expect(main(page).getByText(/Stai modificando solo/)).toHaveCount(0);
    });

    test("su ogni riga chi ha deciso lo stato: la regola o la mano", async ({ page }) => {
        await openDisponibilita(page, { rules: true });
        await expect(band(page)).toContainText("0 visibili · 2 nascosti · 1 non disponibile", { timeout: 15_000 });
        await expect(rowText(page, "Big e2e")).toContainText("Non disponibile per la regola «Sera e2e»");
        await expect(rowText(page, "Crispy e2e")).toContainText("Nascosto a mano");
        await expect(rowText(page, "Coca e2e")).toContainText("Nascosto dalla regola «Sera e2e» · la modifica a mano non lo rimette");
    });

    test.fail("il prezzo è quello della regola, col listino barrato", async ({ page }) => {
        await openDisponibilita(page, { rules: true });
        const big = rowText(page, "Big e2e");
        await expect(big).toContainText(/6[.,]00/, { timeout: 15_000 });
        await expect(big.locator("s, del")).toContainText(/7[.,]50/);
        await expect(big).toContainText("Prezzo dalla regola «Happy e2e»");
    });

    test.fail("«Come dice la regola» toglie la modifica a mano", async ({ page }) => {
        const { stub } = await openDisponibilita(page, { rules: true });
        const coca = productRow(page, "Coca e2e");
        await expect(coca.getByRole("radio", { name: "Come dice la regola" })).toBeVisible({ timeout: 15_000 });
        await expect(coca.getByRole("radio", { name: "Non disponibile" })).toBeChecked();
        await coca.getByRole("radio", { name: "Come dice la regola" }).click();
        await expect.poll(() => writes(stub, "activity_product_overrides.DELETE").length).toBe(1);
        await expect(coca.getByRole("radio", { name: "Come dice la regola" })).toBeChecked();
        await expect(rowText(page, "Coca e2e")).toContainText("Nascosto dalla regola «Sera e2e»");
    });

    test.fail("filtro «Modificati a mano» col conteggio", async ({ page }) => {
        await openDisponibilita(page);
        await expect(main(page).getByText("Big e2e", { exact: true })).toBeVisible({ timeout: 15_000 });
        const chip = main(page).getByRole("radio", { name: /^Modificati a mano/ });
        await expect(chip).toContainText("2");
        await chip.click();
        await expect(main(page).getByText("Crispy e2e", { exact: true })).toBeVisible();
        await expect(main(page).getByText("Coca e2e", { exact: true })).toBeVisible();
        await expect(main(page).getByText("Big e2e", { exact: true })).toHaveCount(0);
    });
});

test.describe("Cosa vedono i clienti — stati della sede", () => {
    test("sede sospesa: i clienti non vedono il menù, e cosa manca", async ({ page }) => {
        await openDisponibilita(page, {
            before: async (_stub, activityId) => {
                await page.route(/\/rest\/v1\/activities\?/, async route => {
                    if (route.request().method() !== "GET") return route.fallback();
                    const response = await route.fetch();
                    const json = (await response.json()) as Row | Row[];
                    for (const row of Array.isArray(json) ? json : [json]) if (row.id === activityId) row.status = "inactive";
                    await route.fulfill({ response, json });
                });
            }
        });
        await expect(band(page)).toContainText("la sede è sospesa", { timeout: 15_000 });
        await expect(band(page).getByRole("list", { name: "Cosa manca" })).toContainText("Sede pubblicata");
    });

    test("abbonamento non attivo: lo dice", async ({ page }) => {
        await openDisponibilita(page, {
            before: async () => {
                await page.route(/\/rest\/v1\/user_tenants_view/, async route => {
                    const response = await route.fetch();
                    const rows = (await response.json()) as Row[];
                    for (const row of rows) if (row.id === TENANT_ID) row.subscription_status = "suspended";
                    await route.fulfill({ response, json: rows });
                });
            }
        });
        await expect(band(page)).toContainText("l'abbonamento non è attivo", { timeout: 15_000 });
        await expect(band(page).getByRole("list", { name: "Cosa manca" })).toContainText("Abbonamento attivo");
    });

    test("nessuna regola menù: lo dice, e porta a Programmazione", async ({ page }) => {
        await openDisponibilita(page, { noRule: true });
        await expect(band(page)).toContainText("nessuna regola gliene assegna uno", { timeout: 15_000 });
        const missing = band(page).getByRole("list", { name: "Cosa manca" });
        await expect(missing).toContainText("Una regola menù che valga adesso");
        await expect(missing.getByRole("link", { name: "Vai a Programmazione" })).toBeVisible();
    });

    test("menù vuoto: tutti i prodotti nascosti", async ({ page }) => {
        await openDisponibilita(page, { allHidden: true });
        await expect(band(page)).toContainText("Menù e2e è vuoto", { timeout: 15_000 });
        await expect(band(page).getByRole("list", { name: "Cosa manca" })).toContainText("Almeno un prodotto visibile");
        await expect(main(page).getByText("Big e2e", { exact: true })).toBeVisible();
    });
});

test.describe("Cosa vedono i clienti — chi vede la spiegazione", () => {
    // Il resolver del pannello legge con le RLS di chi guarda: senza
    // `scheduling.read` sulla sede e `activity_groups.read` non vede tutte le
    // regole, quindi la spiegazione sarebbe falsa (§50.20).
    for (const role of ["staff", "viewer"] as const) {
        test(`${role}: niente banda, la riga dice cosa serve`, async ({ page }) => {
            await openDisponibilita(page, { role });
            await expect(main(page).getByText("Big e2e", { exact: true })).toBeVisible({ timeout: 15_000 });
            await expect(main(page).getByText("Per vedere perché, serve l'accesso a Programmazione.")).toBeVisible();
            await expect(band(page)).toHaveCount(0);
            await expect(main(page).getByRole("link", { name: "Vedi la regola" })).toHaveCount(0);
        });
    }

    test("manager della sede: vede la banda", async ({ page }) => {
        const { name } = await openDisponibilita(page, { role: "manager" });
        await expect(band(page)).toContainText(`I clienti di ${name} vedono Menù e2e`, { timeout: 15_000 });
        await expect(main(page).getByText("Per vedere perché, serve l'accesso a Programmazione.")).toHaveCount(0);
    });
});

test.describe("Cosa vedono i clienti — nome e indirizzo", () => {
    test.fail("la voce si chiama «Cosa vedono i clienti» e porta alla pagina nuova", async ({ page }) => {
        await openDisponibilita(page);
        await expect(main(page).getByText("Big e2e", { exact: true })).toBeVisible({ timeout: 15_000 });
        await expect(page).toHaveURL(/\/cosa-vedono$/);
        await expect(page.getByRole("navigation", { name: "Menu principale" }).getByRole("link", { name: "Cosa vedono i clienti", exact: true })).toBeVisible();
    });

    test.fail("il vecchio indirizzo rimanda al nuovo, con la vista", async ({ page }) => {
        const { activityId } = await openDisponibilita(page);
        await expect(main(page).getByText("Big e2e", { exact: true })).toBeVisible({ timeout: 15_000 });
        await page.goto(page.url().replace(/\/locations\/.*$/, `/locations/${activityId}/disponibilita?vista=ingredienti`));
        await expect(page).toHaveURL(/\/cosa-vedono\?vista=ingredienti$/);
        await expect(main(page).getByText("Pane e2e", { exact: true })).toBeVisible({ timeout: 15_000 });
    });
});
