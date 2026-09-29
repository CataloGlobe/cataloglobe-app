import { expect, test, type Locator, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";
import { PRODUCT_ID, stubLingue, type LingueStub, type WriteCall } from "./lingueStub";
import type { Row } from "./restStub";

/**
 * Lingue (lotto `ds-5-coda`, P0). Scritto sulla pagina di **oggi**, prima di
 * ricomporla: deve restare verde passo dopo passo. I comportamenti che la
 * ricomposizione porta (sola lettura vera, stato d'errore) sono `test.fail`
 * finché il passo non li porta.
 *
 * Dati finti in `lingueStub.ts`; permessi, azienda e sidebar veri.
 */

function main(page: Page) {
    return page.getByRole("main");
}

function write(stub: LingueStub, key: string): WriteCall | undefined {
    return stub.writes.find(w => w.key === key);
}

async function openPage(page: Page): Promise<void> {
    await openBusinessPage(page, "languages", "Lingue");
    await expect(main(page).getByText("Tedesco", { exact: true })).toBeVisible({ timeout: 15_000 });
}

/** La riga di una lingua: il primo antenato del nome che contiene anche il suo interruttore o il suo stato. */
function langRow(page: Page, name: string): Locator {
    return main(page)
        .getByText(name, { exact: true })
        .locator("xpath=ancestor::*[.//*[@role='switch'] or .//button][1]");
}

async function noSideScroll(page: Page): Promise<void> {
    const overflow = await page.evaluate(() => {
        const de = document.documentElement;
        const scrollers = [de, ...Array.from(document.querySelectorAll<HTMLElement>("main"))];
        return Math.max(...scrollers.map(el => el.scrollWidth - el.clientWidth));
    });
    expect(overflow).toBeLessThanOrEqual(0);
}

let stub: LingueStub;

test.beforeEach(async ({ page }) => {
    stub = await stubLingue(page);
});

test.describe("Lingue", () => {
    test("riepilogo, lingua base e stato di ogni lingua", async ({ page }) => {
        await openPage(page);
        await expect(main(page).getByText("3 lingue attive")).toBeVisible();
        await expect(main(page).getByText("50 elementi traducibili")).toBeVisible();
        await expect(main(page).getByText("alcune da risolvere")).toBeVisible();
        await expect(main(page).getByText("Lingua base")).toBeVisible();
        await expect(main(page).getByText(/50 elementi · sorgente delle traduzioni/)).toBeVisible();
        await expect(main(page).getByText("Aggiornata", { exact: true })).toBeVisible();
        await expect(main(page).getByText("2 da rivedere")).toBeVisible();
        await expect(main(page).getByText("3 da riprovare")).toBeVisible();
        await expect(main(page).getByText("47 / 50 aggiornati")).toBeVisible();
        await expect(main(page).getByText("Non mostrata ai clienti")).toBeVisible();
        const order = await main(page).getByText(/^(Italiano|Inglese|Francese|Spagnolo|Tedesco)$/).allTextContents();
        expect(order[0]).toBe("Italiano");
    });

    test("attivare una lingua chiede conferma, poi accoda le traduzioni", async ({ page }) => {
        stub.onWrite("tenant_languages.POST", call => call.body);
        stub.onWrite("rpc.enqueue_tenant_language_backfill", () => 12);
        await openPage(page);
        await langRow(page, "Tedesco").getByRole("switch").click({ force: true });
        const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog")).last();
        await expect(dialog.getByText("Attivare Tedesco?")).toBeVisible();
        await dialog.getByRole("button", { name: "Attiva", exact: true }).click();
        await expect(page.getByText("Tedesco attivata. 12 contenuti da aggiornare.")).toBeVisible();
        expect(write(stub, "tenant_languages.POST")?.body).toMatchObject({ language_code: "de", is_active: true });
        expect(write(stub, "rpc.enqueue_tenant_language_backfill")?.body).toMatchObject({ p_target_lang: "de" });
    });

    test("la conferma dice che le traduzioni usano il credito AI", async ({ page }) => {
        await openPage(page);
        await langRow(page, "Tedesco").getByRole("switch").click({ force: true });
        const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog")).last();
        await expect(dialog.getByText(/credito AI incluso nel piano/)).toBeVisible();
    });

    test("annullare la conferma non attiva niente", async ({ page }) => {
        await openPage(page);
        await langRow(page, "Tedesco").getByRole("switch").click({ force: true });
        const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog")).last();
        await dialog.getByRole("button", { name: "Annulla" }).click();
        expect(stub.writes.filter(w => w.key.startsWith("tenant_languages"))).toHaveLength(0);
    });

    test("disattivare è immediato", async ({ page }) => {
        stub.onWrite("tenant_languages.PATCH", () => null);
        await openPage(page);
        await langRow(page, "Inglese").getByRole("switch").click({ force: true });
        await expect(page.getByText("Inglese disattivata.")).toBeVisible();
        const call = write(stub, "tenant_languages.PATCH");
        expect(call?.body).toEqual({ is_active: false });
        expect(call?.params.get("language_code")).toBe("eq.en");
    });

    test("«3 da riprovare» rimette in coda i falliti", async ({ page }) => {
        stub.onWrite("rpc.retry_all_failed_translations", () => 3);
        await openPage(page);
        await main(page).getByRole("button", { name: /3 da riprovare/ }).click();
        await expect(page.getByText("3 elementi rimessi in coda")).toBeVisible();
    });

    test("«Da rivedere»: elenco, torna ad automatica, apri il prodotto", async ({ page }) => {
        stub.onWrite("rpc.revert_manual_translation", () => null);
        await openPage(page);
        await main(page).getByRole("button", { name: /2 da rivedere/ }).click();
        const drawer = page.getByRole("dialog").last();
        await expect(drawer.getByText("Margherita e2e")).toBeVisible();
        await expect(drawer.getByText("Basilico e2e")).toBeVisible();
        await expect(drawer.getByText("Modificabile dalla scheda dell'elemento")).toBeVisible();
        await drawer.getByRole("button", { name: "Torna ad automatica" }).click();
        await expect(page.getByText("Riportata a traduzione automatica")).toBeVisible();
        expect(write(stub, "rpc.revert_manual_translation")?.body).toMatchObject({ p_entity_id: PRODUCT_ID, p_language_code: "fr" } as Row);
        await expect(drawer.getByText("Margherita e2e")).toHaveCount(0);
    });

    test("«Da rivedere»: «Apri» porta alla traduzione del prodotto", async ({ page }) => {
        await openPage(page);
        await main(page).getByRole("button", { name: /2 da rivedere/ }).click();
        const drawer = page.getByRole("dialog").last();
        await drawer.getByRole("button", { name: "Apri", exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`/products/${PRODUCT_ID}\\?tab=translations$`));
    });

    test("senza scrittura: interruttori spenti e niente «Torna ad automatica»", async ({ page }) => {
        await stub.revoke("translations.write");
        await openPage(page);
        await stub.revoked;
        await expect(langRow(page, "Tedesco").getByRole("switch")).toBeDisabled();
        await main(page).getByRole("button", { name: /2 da rivedere/ }).click();
        const drawer = page.getByRole("dialog").last();
        await expect(drawer.getByText("Margherita e2e")).toBeVisible();
        await expect(drawer.getByRole("button", { name: "Torna ad automatica" })).toHaveCount(0);
    });

    test("senza lettura dei cataloghi: la pagina è bloccata", async ({ page }) => {
        await stub.revoke("catalogs.read");
        await openBusinessPage(page, "overview", "Panoramica");
        await page.goto(page.url().replace(/\/overview$/, "/languages"));
        await stub.revoked;
        await expect(main(page).getByText("Non hai accesso a questa sezione")).toBeVisible({ timeout: 15_000 });
    });

    test("errore di caricamento: lo dice e offre «Riprova»", async ({ page }) => {
        await page.route(/\/rest\/v1\/tenant_languages\?/, route => route.fulfill({ status: 500, json: { code: "E2E", message: "rotto" } }));
        await openBusinessPage(page, "languages", "Lingue");
        await expect(main(page).getByRole("button", { name: "Riprova" })).toBeVisible({ timeout: 15_000 });
        await expect(main(page).getByText("tutto aggiornato")).toHaveCount(0);
    });

    test("a 375 nessuno scroll orizzontale", async ({ page }) => {
        await openPage(page);
        await page.setViewportSize({ width: 375, height: 800 });
        await expect(main(page).getByText("Tedesco", { exact: true })).toBeVisible();
        await noSideScroll(page);
    });
});
