import { expect, test, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";

/**
 * Impostazioni dell'azienda (`/business/:businessId/settings`), viste da un
 * amministratore. Copre le feature che sopravvivono alla riscrittura
 * (registro feature, §Impostazioni passo 2): titolo; il nome dell'azienda
 * già compilato e il settore in sola lettura; i dati di fatturazione con la
 * tipologia intestatario; il logo; la zona distruttiva, che per un amministratore ha
 * il bottone spento e il banner sul proprietario; il dialogo di conferma,
 * che si apre e si chiude senza confermare (visto da un proprietario
 * simulato: la risposta di `get_my_permissions` è riscritta in pagina, la
 * Edge Function `delete-tenant` è bloccata per sicurezza).
 */

/** Riscrive la risposta di `get_my_permissions` aggiungendo `tenant.delete`. */
async function grantTenantDelete(page: Page): Promise<void> {
    await page.route(/\/rest\/v1\/rpc\/get_my_permissions/, async route => {
        const response = await route.fetch();
        const rows = (await response.json()) as Array<{ permissions: string[] | null }>;
        for (const row of rows) {
            row.permissions = [...(row.permissions ?? []), "tenant.delete"];
        }
        await route.fulfill({ response, json: rows });
    });
    // Nessuna eliminazione può partire da questo test, nemmeno per sbaglio.
    await page.route(/\/functions\/v1\/delete-tenant/, route => route.abort());
}

test.describe("Impostazioni", () => {
    test.beforeEach(async ({ page }) => {
        await openBusinessPage(page, "settings", "Impostazioni");
    });

    test("titolo di pagina", async ({ page }) => {
        await expect(page).toHaveTitle(/^Impostazioni — .+ \| CataloGlobe$/);
    });

    test("azienda: nome compilato, settore in sola lettura", async ({ page }) => {
        const name = page.getByRole("textbox", { name: /^Nome/ });
        await expect(name).toBeVisible();
        await expect(name).not.toHaveValue("");
        await expect(page.getByRole("main").getByText(/^(Tipo di attività|Settore)$/)).toBeVisible();
    });

    test("dati di fatturazione: la tipologia intestatario c'è", async ({ page }) => {
        // L'azienda di test non ha un profilo fiscale: senza tipologia i campi
        // non ci sono, e il test non deve crearne uno.
        await expect(page.getByText("Dati di fatturazione", { exact: true })).toBeVisible();
        await expect(page.getByRole("combobox", { name: "Tipologia intestatario" })).toBeVisible();
    });

    test("IM2: l'azienda a righe, il logo è una riga «Quadrato», nessuna card Logo", async ({ page }) => {
        const rows = page.getByRole("main").locator("[data-setting-row]");
        for (const label of ["Nome", "Settore", "Logo"]) {
            await expect(rows.filter({ hasText: new RegExp(`^${label}`) }).first()).toBeVisible();
        }
        const logo = rows.filter({ hasText: /^Logo/ }).first();
        await expect(logo).toContainText("Quadrato. Compare nel workspace");
        await expect(logo.getByText("1:1", { exact: true })).toHaveCount(0);
        await expect(page.getByRole("main").getByText("Scelto alla creazione. Per cambiarlo scrivi al supporto.")).toBeVisible();
    });

    test("zona distruttiva: a un amministratore la frase, nessun bottone spento", async ({ page }) => {
        await expect(page.getByText("Solo il proprietario può eliminarla. Per andartene, chiedi di essere rimosso dal Team.")).toBeVisible();
        await expect(page.getByRole("main").getByRole("button", { name: /^Elimina/ })).toHaveCount(0);
    });

    test("dialogo di eliminazione: si apre e si chiude senza confermare", async ({ page }) => {
        await grantTenantDelete(page);
        await page.reload();
        const trigger = page.getByRole("main").getByRole("button", { name: /^Elimina/ });
        await expect(trigger).toBeEnabled();
        await trigger.click();
        const dialog = page.getByRole("alertdialog");
        await expect(dialog.getByText(/^Eliminare “.+”\?$/)).toBeVisible();
        const confirm = dialog.getByRole("button", { name: /^Elimina/ });
        await expect(confirm).toBeDisabled();
        await dialog.getByRole("button", { name: "Annulla", exact: true }).click();
        await expect(page.getByRole("alertdialog")).toBeHidden();
    });
});
