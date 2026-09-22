import { expect, test, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";

/**
 * Il contesto di sede (lotto `ds-5-sede-nav`, §46.1): entrando in un locale la
 * sidebar diventa la sua — cinque voci, la freccia per uscire, il nome della
 * sede — e quella dell'azienda sparisce. Scritto **prima** del guscio: finché
 * P0 non c'è questi test sono rossi per disegno.
 *
 * Perimetro P0: solo la navigazione. Comande e Prenotazioni sono annunciate e
 * non navigabili finché le pagine non prendono la sede dal path (§46.1 j),
 * quindi si verificano come voci presenti e disabilitate, non come link.
 *
 * Locator per ruolo, mai per tag. Nessuna scrittura.
 */

const SEDE_VOCI = ["Comande", "Prenotazioni", "Sala", "Disponibilità", "Scheda"] as const;

/** Le voci dell'azienda che dentro una sede NON devono esserci. */
const VOCI_AZIENDA = ["Panoramica", "Programmazione", "Team", "Abbonamento"] as const;

function nav(page: Page) {
    return page.getByRole("navigation", { name: "Menu principale" });
}

/** L'intestazione del contesto: dove sei, e come si esce. */
function contextNav(page: Page) {
    return page.getByRole("navigation", { name: "Contesto" });
}

/** Apre la prima sede della griglia e ritorna il suo nome. */
async function openFirstLocation(page: Page): Promise<string> {
    await openBusinessPage(page, "locations", "Sedi");
    await page.getByRole("radio", { name: "Vista griglia" }).click();
    const firstCard = page.getByRole("main").getByRole("listitem").first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    const link = firstCard.getByRole("link").first();
    const name = (await link.innerText()).split("\n")[0].trim();
    await link.click();
    await page.waitForURL(/\/locations\/[0-9a-f-]+/);
    return name;
}

test.describe("Contesto di sede", () => {
    test("entrando in una sede la sidebar diventa quella della sede", async ({ page }) => {
        await openFirstLocation(page);
        const sidebar = nav(page);

        for (const voce of SEDE_VOCI) {
            await expect(sidebar.getByText(voce, { exact: true })).toBeVisible({ timeout: 15_000 });
        }
        for (const voce of VOCI_AZIENDA) {
            await expect(sidebar.getByRole("link", { name: voce, exact: true })).toHaveCount(0);
        }
    });

    test("le due voci operative sono annunciate e non ancora navigabili", async ({ page }) => {
        await openFirstLocation(page);
        const sidebar = nav(page);

        for (const voce of ["Comande", "Prenotazioni"]) {
            const item = sidebar.getByText(voce, { exact: true }).locator("xpath=ancestor-or-self::*[@aria-disabled='true'][1]");
            await expect(item).toHaveCount(1, { timeout: 15_000 });
        }
        for (const voce of ["Sala", "Disponibilità", "Scheda"]) {
            await expect(sidebar.getByRole("link", { name: voce, exact: true })).toBeVisible();
        }
    });

    test("«Tutte le sedi» riporta all'elenco", async ({ page }) => {
        await openFirstLocation(page);
        await contextNav(page).getByRole("link", { name: /^(Tutte le sedi|Azienda)$/ }).click();
        await expect(page).toHaveURL(/\/(locations|overview)$/, { timeout: 15_000 });
        await expect(nav(page).getByRole("link", { name: "Panoramica", exact: true })).toBeVisible();
    });

    test("le tre voci navigabili portano alle rotte della sede", async ({ page }) => {
        await openFirstLocation(page);
        const sidebar = nav(page);

        await sidebar.getByRole("link", { name: "Sala", exact: true }).click();
        await expect(page).toHaveURL(/\/sala$/, { timeout: 15_000 });

        await sidebar.getByRole("link", { name: "Disponibilità", exact: true }).click();
        await expect(page).toHaveURL(/\/disponibilita$/, { timeout: 15_000 });

        await sidebar.getByRole("link", { name: "Scheda", exact: true }).click();
        await expect(page).toHaveURL(/\/anagrafica$/, { timeout: 15_000 });
    });

    test("l'atterraggio dalla griglia resta l'Anagrafica", async ({ page }) => {
        await openFirstLocation(page);
        await expect(page).toHaveURL(/\/anagrafica$/, { timeout: 15_000 });
        await expect(page.getByRole("tab", { name: /^(Anagrafica|Profilo)$/ })).toHaveAttribute("aria-selected", "true");
    });

    test("il nome della sede si legge: in sidebar a 1280, nella navbar a 768", async ({ page }) => {
        const sedeName = await openFirstLocation(page);
        expect(sedeName.length).toBeGreaterThan(0);

        // 1280: il nome sta nell'intestazione della sidebar.
        await expect(contextNav(page).getByText(sedeName, { exact: true })).toBeVisible({ timeout: 15_000 });

        // 768: la sidebar è collassata a icone, il nome passa alla navbar.
        await page.setViewportSize({ width: 768, height: 900 });
        await expect(page.getByRole("banner").getByText(sedeName, { exact: true })).toBeVisible({ timeout: 15_000 });
        await expect(contextNav(page).getByRole("link", { name: /^(Tutte le sedi|Azienda)$/ })).toBeVisible();
    });

    test("a 375 il contesto vive nel cassetto, e la sede si legge nella navbar", async ({ page }) => {
        // Si entra da desktop: a 375 la sidebar è un cassetto chiuso e
        // l'helper di navigazione non vedrebbe le voci dell'azienda.
        await openFirstLocation(page);
        await page.setViewportSize({ width: 375, height: 800 });

        await page.getByRole("button", { name: "Apri menù di navigazione" }).click();
        const sidebar = nav(page);
        await expect(sidebar.getByRole("link", { name: "Scheda", exact: true })).toBeVisible({ timeout: 15_000 });
        await expect(contextNav(page).getByRole("link", { name: /^(Tutte le sedi|Azienda)$/ })).toBeVisible();
    });

    test("dentro la sede non c'è il selettore di sede della navbar", async ({ page }) => {
        await openFirstLocation(page);
        await expect(page.getByRole("banner").getByRole("combobox", { name: /[Ss]ede/ })).toHaveCount(0);
    });
});
