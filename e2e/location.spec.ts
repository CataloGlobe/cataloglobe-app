import { expect, test, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";

/**
 * Scheda della sede (`/business/:businessId/locations/:activityId`), vista da
 * un amministratore. Copre le feature che sopravvivono alla riscrittura in
 * quattro pagine (registro feature, §Scheda passo 2): l'apertura dalla
 * griglia di Sedi; le quattro sezioni Anagrafica · Orari · Ordini e
 * prenotazioni · Pubblicazione (prima Profilo · Orari · Ordinazioni ·
 * Impostazioni, poi Canali) con un
 * contenuto ciascuna; il drawer dell'indirizzo web aperto e chiuso senza
 * salvare; la zona pericolosa aperta e chiusa senza eliminare; il redirect
 * dai vecchi `?tab=`. I locator accettano i nomi di oggi e quelli decisi
 * (regola: per ruolo, mai per tag), così il test è verde prima e dopo.
 * Nessuna scrittura.
 */

const TAB = {
    anagrafica: /^(Profilo|Anagrafica)$/,
    orari: /^Orari$/,
    ordini: /^(Ordinazioni|Canali|Ordini e prenotazioni)$/,
    pubblicazione: /^(Impostazioni|Pubblicazione)$/
};

async function openFirstLocation(page: Page): Promise<void> {
    await openBusinessPage(page, "locations", "Sedi");
    await page.getByRole("radio", { name: "Vista griglia" }).click();
    const main = page.getByRole("main");
    const firstCard = main.getByRole("listitem").first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    await firstCard.getByRole("link").first().click();
    await page.waitForURL(/\/locations\/[0-9a-f-]+/);
    await expect(page.getByRole("tab", { name: TAB.anagrafica })).toBeVisible({ timeout: 15_000 });
}

test.describe("Scheda della sede", () => {
    test("si apre dalla griglia, con breadcrumb e sezioni", async ({ page }) => {
        await openFirstLocation(page);
        await expect(page.getByRole("link", { name: "Sedi", exact: true }).first()).toBeVisible();
        for (const name of Object.values(TAB)) {
            await expect(page.getByRole("tab", { name })).toBeVisible();
        }
        await expect(page.getByRole("tab", { name: TAB.anagrafica })).toHaveAttribute("aria-selected", "true");
    });

    test("le quattro sezioni mostrano il loro contenuto", async ({ page }) => {
        await openFirstLocation(page);
        const main = page.getByRole("main");

        await expect(main.getByText("Indirizzo web", { exact: true }).first()).toBeVisible({ timeout: 15_000 });

        await page.getByRole("tab", { name: TAB.orari }).click();
        await expect(main.getByText(/^(Orari di apertura|Settimana)$/).first()).toBeVisible({ timeout: 15_000 });

        await page.getByRole("tab", { name: TAB.ordini }).click();
        await expect(main.getByText(/^(Ordinazioni dal tavolo|Ordini al tavolo)$/).first()).toBeVisible({ timeout: 15_000 });

        await page.getByRole("tab", { name: TAB.pubblicazione }).click();
        await expect(main.getByText(/^QR [Cc]ode/).first()).toBeVisible({ timeout: 15_000 });
    });

    test("indirizzo web: il drawer si apre e si chiude senza salvare", async ({ page }) => {
        await openFirstLocation(page);
        const main = page.getByRole("main");
        await main.getByRole("button", { name: /^(Modifica indirizzo web|Cambia indirizzo)/ }).first().click();
        const dialog = page.getByRole("dialog");
        await expect(dialog.getByRole("textbox", { name: /Indirizzo web/ })).toBeVisible();
        await dialog.getByRole("button", { name: "Annulla", exact: true }).click();
        await expect(page.getByRole("dialog")).toBeHidden();
    });

    test("zona pericolosa: la conferma si apre e si chiude senza eliminare", async ({ page }) => {
        await openFirstLocation(page);
        await page.getByRole("tab", { name: TAB.pubblicazione }).click();
        const main = page.getByRole("main");
        await main.getByRole("button", { name: /^Elimina/ }).click();
        // `ConfirmDialog` è un `alertdialog`, con il nome dal titolo.
        const dialog = page.getByRole("alertdialog", { name: /^Elimina/ });
        await expect(dialog).toBeVisible();
        await dialog.getByRole("button", { name: "Annulla", exact: true }).click();
        await expect(dialog).toBeHidden();
        await expect(page).toHaveURL(/\/locations\/[0-9a-f-]+/);
    });

    test("i vecchi ?tab= portano alla sezione giusta", async ({ page }) => {
        await openFirstLocation(page);
        const base = page.url().replace(/[?#].*$/, "").replace(/\/(anagrafica|orari|ordini-prenotazioni|canali|pubblicazione)$/, "");
        await page.goto(`${base}?tab=info`);
        await expect(page.getByRole("tab", { name: TAB.anagrafica })).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
        await expect(page).toHaveURL(/(tab=profile|\/anagrafica)/);
        await page.goto(`${base}?tab=hours-services`);
        await expect(page.getByRole("tab", { name: TAB.pubblicazione })).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
        await expect(page).toHaveURL(/(tab=settings|\/pubblicazione)/);
    });

    test("il vecchio indirizzo /canali porta a Ordini e prenotazioni, ancora compresa", async ({ page }) => {
        await openFirstLocation(page);
        const base = page.url().replace(/[?#].*$/, "").replace(/\/(anagrafica|orari|ordini-prenotazioni|canali|pubblicazione)$/, "");
        await page.goto(`${base}/canali#prenotazioni`);
        await expect(page.getByRole("tab", { name: TAB.ordini })).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
        await expect(page).toHaveURL(/\/ordini-prenotazioni#prenotazioni$/);
    });
});
