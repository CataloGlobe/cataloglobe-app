import { expect, test, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";
import { sidebarLink } from "./nav";

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
    // Correzioni UI O1 e SV3: «Ordini e prenotazioni» è diventata due tab, e
    // la Sala è uscita da Servizio. Col piano Base il nome porta il lucchetto.
    ordini: /^Ordini al tavolo/,
    prenotazioni: /^Prenotazioni/,
    sala: /^Sala$/,
    pubblicazione: /^(Impostazioni|Pubblicazione)$/
};

async function openFirstLocation(page: Page): Promise<void> {
    await openBusinessPage(page, "locations", "Sedi");
    await page.getByRole("radio", { name: "Vista griglia" }).click();
    const main = page.getByRole("main");
    const firstCard = main.getByRole("listitem").first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    await firstCard.getByRole("link").first().click();
    // Entrando si atterra sulla prima voce della sede (§46.1 f): la scheda è
    // la voce «Scheda». Si aspetta l'atterraggio prima del clic, altrimenti
    // il redirect vincerebbe sul clic.
    await page.waitForURL(/\/locations\/[0-9a-f-]+\/[a-z-]+$/);
    await (await sidebarLink(page, "Scheda")).click();
    await expect(page.getByRole("tab", { name: TAB.anagrafica })).toBeVisible({ timeout: 15_000 });
}

test.describe("Scheda della sede", () => {
    test("si apre dalla griglia, con l'uscita dal contesto e le sezioni", async ({ page }) => {
        await openFirstLocation(page);
        // La via di ritorno non è più la briciola: dentro il contesto di sede
        // la navbar porta la pill del locale e l'uscita sta nella sidebar
        // (§46.1 g).
        await expect(
            page.getByRole("navigation", { name: "Contesto" }).getByRole("link", { name: /^(Tutte le sedi|Azienda)$/ })
        ).toBeVisible();
        for (const name of Object.values(TAB)) {
            await expect(page.getByRole("tab", { name })).toBeVisible();
        }
        await expect(page.getByRole("tab", { name: TAB.anagrafica })).toHaveAttribute("aria-selected", "true");
    });

    test("le sei sezioni mostrano il loro contenuto", async ({ page }) => {
        await openFirstLocation(page);
        const main = page.getByRole("main");

        await expect(main.getByText("Identità", { exact: true }).first()).toBeVisible({ timeout: 15_000 });

        await page.getByRole("tab", { name: TAB.orari }).click();
        await expect(main.getByText(/^(Orari di apertura|Settimana)$/).first()).toBeVisible({ timeout: 15_000 });

        await page.getByRole("tab", { name: TAB.ordini }).click();
        await expect(main.getByText(/^(Ordinazioni dal tavolo|Ordini al tavolo)$/).first()).toBeVisible({ timeout: 15_000 });

        await page.getByRole("tab", { name: TAB.prenotazioni }).click();
        await expect(main.getByText("Richieste dal modulo pubblico", { exact: true })).toBeVisible({ timeout: 15_000 });

        await page.getByRole("tab", { name: TAB.sala }).click();
        await expect(page).toHaveURL(/\/sala$/);

        await page.getByRole("tab", { name: TAB.pubblicazione }).click();
        await expect(main.getByText("Indirizzo e QR", { exact: true })).toBeVisible({ timeout: 15_000 });
    });

    test("indirizzo web: il drawer si apre e si chiude senza salvare", async ({ page }) => {
        await openFirstLocation(page);
        const main = page.getByRole("main");
        // L'indirizzo web sta in Pubblicazione, con il QR (correzioni UI U1).
        await page.getByRole("tab", { name: TAB.pubblicazione }).click();
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

    test("zona pericolosa: la conferma dice le storie che se ne vanno con la sede (§50.13)", async ({ page }) => {
        // Il conteggio è finto: le storie legate a una sede, in staging, non ci sono.
        // Risposta vera (intestazioni CORS comprese), col totale riscritto.
        await page.route(/\/rest\/v1\/stories\?.*activity_id=eq\./, async route => {
            try {
                const response = await route.fetch();
                await route.fulfill({ response, headers: { ...response.headers(), "content-range": "*/2" } });
            } catch {
                // Pagina chiusa a metà richiesta (fine del test): niente da riscrivere.
            }
        });
        await openFirstLocation(page);
        await page.getByRole("tab", { name: TAB.pubblicazione }).click();
        await page.getByRole("main").getByRole("button", { name: /^Elimina/ }).click();
        const dialog = page.getByRole("alertdialog", { name: /^Elimina/ });
        await expect(dialog).toContainText("2 storie legate a questa sede");
        await dialog.getByRole("button", { name: "Annulla", exact: true }).click();
    });

    test("i vecchi ?tab= portano alla sezione giusta", async ({ page }) => {
        await openFirstLocation(page);
        const base = page.url().replace(/[?#].*$/, "").replace(/\/(anagrafica|orari|ordini-al-tavolo|prenotazioni-online|sala|ordini-prenotazioni|canali|pubblicazione)$/, "");
        await page.goto(`${base}?tab=info`);
        await expect(page.getByRole("tab", { name: TAB.anagrafica })).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
        await expect(page).toHaveURL(/(tab=profile|\/anagrafica)/);
        await page.goto(`${base}?tab=hours-services`);
        await expect(page.getByRole("tab", { name: TAB.pubblicazione })).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
        await expect(page).toHaveURL(/(tab=settings|\/pubblicazione)/);
    });

    test("i vecchi ?tab=sala e ?tab=tables portano alla Sala della Scheda", async ({ page }) => {
        // Correzioni UI SV3: «Gestisci la sala» esce da Servizio e torna una
        // tab della sede; anche `servizio?modo=gestisci` porta qui.
        await openFirstLocation(page);
        const base = page.url().replace(/[?#].*$/, "").replace(/\/(anagrafica|orari|ordini-al-tavolo|prenotazioni-online|sala|ordini-prenotazioni|canali|pubblicazione)$/, "");
        for (const tab of ["sala", "tables"]) {
            await page.goto(`${base}?tab=${tab}`);
            await expect(page).toHaveURL(/\/sala$/, { timeout: 15_000 });
            await expect(page.getByRole("tab", { name: TAB.sala })).toHaveAttribute("aria-selected", "true");
        }
        await page.goto(`${base}/servizio?modo=gestisci`);
        await expect(page).toHaveURL(/\/sala$/, { timeout: 15_000 });
    });

    test("i vecchi /canali e /ordini-prenotazioni aprono Ordini al tavolo, o Prenotazioni con l'ancora", async ({ page }) => {
        await openFirstLocation(page);
        const base = page.url().replace(/[?#].*$/, "").replace(/\/(anagrafica|orari|ordini-al-tavolo|prenotazioni-online|sala|ordini-prenotazioni|canali|pubblicazione)$/, "");
        await page.goto(`${base}/canali#prenotazioni`);
        await expect(page.getByRole("tab", { name: TAB.prenotazioni })).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
        await expect(page).toHaveURL(/\/prenotazioni-online$/);
        await page.goto(`${base}/ordini-prenotazioni`);
        await expect(page.getByRole("tab", { name: TAB.ordini })).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
        await expect(page).toHaveURL(/\/ordini-al-tavolo$/);
    });

    test("un segmento sconosciuto sotto la sede apre l'Anagrafica, non «Pagina non trovata»", async ({ page }) => {
        await openFirstLocation(page);
        const base = page.url().replace(/[?#].*$/, "").replace(/\/(anagrafica|orari|ordini-al-tavolo|prenotazioni-online|sala|ordini-prenotazioni|canali|pubblicazione)$/, "");
        await page.goto(`${base}/ordini`);
        await expect(page.getByRole("tab", { name: TAB.anagrafica })).toHaveAttribute("aria-selected", "true", { timeout: 15_000 });
        await expect(page).toHaveURL(/\/anagrafica$/);
        await expect(page.getByText("Pagina non trovata")).toHaveCount(0);
    });
});
