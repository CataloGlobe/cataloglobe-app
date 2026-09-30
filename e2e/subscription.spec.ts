import { expect, test } from "@playwright/test";
import { openBusinessPage } from "./business";

/**
 * Abbonamento (`/business/:businessId/subscription`), visto da un
 * amministratore (billing.read + billing.manage, non billing.cancel) su
 * un'azienda attiva, Pro, 5 sedi pagate. Copre le feature che sopravvivono
 * alla riscrittura (registro feature, §Abbonamento passo 2): titolo; il
 * banner che spiega cosa il proprietario può fare in più; piano, sedi e
 * stato; il credito AI con la data di azzeramento; la voce del portale di
 * fatturazione (mai cliccata: porta su Stripe); nessuna disdetta per chi non
 * è proprietario. Su staging lo stato Stripe può non essere leggibile: i
 * test non dipendono da importi né date.
 */
test.describe("Abbonamento", () => {
    test.beforeEach(async ({ page }) => {
        await openBusinessPage(page, "subscription", "Abbonamento");
    });

    test("titolo di pagina", async ({ page }) => {
        await expect(page).toHaveTitle(/^Abbonamento — .+ \| CataloGlobe$/);
    });

    test("amministratore: il banner dice che solo il proprietario disdice", async ({ page }) => {
        await expect(page.getByRole("main").getByText(/^Solo il proprietario può/)).toBeVisible();
    });

    test("piano, sedi pagate e stato", async ({ page }) => {
        const main = page.getByRole("main");
        await expect(main.getByText(/Pro · 5 sedi/).first()).toBeVisible();
        await expect(main.getByText("Attivo", { exact: true })).toBeVisible();
    });

    test("credito AI: percentuale e data di azzeramento", async ({ page }) => {
        const main = page.getByRole("main");
        await expect(main.getByText(/^\d+ ?%$/).first()).toBeVisible({ timeout: 15_000 });
        await expect(main.getByText(/^Si azzera il /)).toBeVisible();
    });

    test("gestione: il portale di fatturazione c'è, la disdetta no", async ({ page }) => {
        const main = page.getByRole("main");
        await expect(main.getByText("Portale di fatturazione", { exact: true })).toBeVisible();
        await expect(main.getByText(/^Disdici/)).toHaveCount(0);
    });
});
