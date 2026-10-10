import { expect, test } from "@playwright/test";
import { openBusinessPageByUrl } from "./business";

/**
 * Abbonamento (`/business/:businessId/settings/abbonamento`, tab di
 * Impostazioni dal §51.12), visto da un
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
        // Abbonamento è una voce del menù dell'account (§51.12, D170), sotto settings/.
        await openBusinessPageByUrl(page, "settings/abbonamento");
        await page.waitForURL(/\/settings\/abbonamento$/);
    });

    test("titolo di pagina", async ({ page }) => {
        await expect(page).toHaveTitle(/^Abbonamento · .+ · CataloGlobe$/);
    });

    test("IM4: amministratore, niente riquadro; la riga del Portale dice che solo il proprietario disdice", async ({ page }) => {
        const main = page.getByRole("main");
        await expect(main.getByText(/^Solo il proprietario può/)).toHaveCount(0);
        await expect(
            main.getByText("Metodo di pagamento, fatture e ricevute su Stripe. Solo il proprietario può disdire l'abbonamento.")
        ).toBeVisible();
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
