import { expect, test, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";
import { asRole } from "./asRole";
import { asSingleSede } from "./nav";

/**
 * Il contesto di sede (lotto `ds-5-sede-nav`, §46.1): entrando in un locale la
 * sidebar diventa la sua — le sue voci, la freccia per uscire, il nome della
 * sede — e quella dell'azienda sparisce. Scritto **prima** del guscio: finché
 * P0 non c'è questi test sono rossi per disegno.
 *
 * P1: Comande e Prenotazioni sono rotte della sede (`/comande`,
 * `/prenotazioni`) e prendono la sede dal path; `/orders` reindirizza
 * nell'ultima sede usata.
 *
 * Lotto B-a: Servizio prende il posto di Sala (che ne è il modo «Gestisci la
 * sala») ed è la prima voce, quella su cui si atterra; lo Storico è una voce.
 * Lotto B-b: sei voci a gruppi (§19.5), Ospiti e Ordini; le ultime due fuori.
 * Navigazione v2 (§51): gruppi e voci dei tre contesti stanno in
 * `navigazione.spec.ts`; il nome della sede è nell'header.
 *
 * Locator per ruolo, mai per tag. Nessuna scrittura.
 */

const SEDE_VOCI = ["Servizio", "Prenotazioni", "Comande", "Storico", "Cosa vedono i clienti", "Scheda"] as const;

/** Le voci dell'azienda che dentro una sede NON devono esserci. */
const VOCI_AZIENDA = ["Panoramica", "Programmazione", "Team", "Abbonamento"] as const;

function nav(page: Page) {
    return page.getByRole("navigation", { name: "Menu principale" });
}

/** L'intestazione del contesto: dove sei, e come si esce. */
function contextNav(page: Page) {
    return page.getByRole("navigation", { name: "Contesto" });
}

/** Gli indirizzi delle sedi della griglia, nell'ordine in cui compaiono. */
async function locationPaths(page: Page): Promise<string[]> {
    await openBusinessPage(page, "locations", "Sedi");
    await page.getByRole("radio", { name: "Vista griglia" }).click();
    const cards = page.getByRole("main").getByRole("listitem");
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });
    const hrefs = await cards.locator("a").evaluateAll(links =>
        links.map(l => (l as HTMLAnchorElement).getAttribute("href") ?? "").filter(h => h.includes("/locations/"))
    );
    return [...new Set(hrefs.map(h => h.replace(/[?#].*$/, "")))];
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
            await expect(sidebar.getByRole("link", { name: voce, exact: true })).toBeVisible({ timeout: 15_000 });
        }
        for (const voce of VOCI_AZIENDA) {
            await expect(sidebar.getByRole("link", { name: voce, exact: true })).toHaveCount(0);
        }
    });

    test("tutte le voci sono navigabili", async ({ page }) => {
        await openFirstLocation(page);
        const sidebar = nav(page);
        for (const voce of SEDE_VOCI) {
            await expect(sidebar.getByRole("link", { name: voce, exact: true })).toBeVisible({ timeout: 15_000 });
        }
        await expect(sidebar.locator('[aria-disabled="true"]')).toHaveCount(0);
    });

    test("Comande e Prenotazioni sono rotte della sede", async ({ page }) => {
        await openFirstLocation(page);
        const sidebar = nav(page);

        await sidebar.getByRole("link", { name: "Comande", exact: true }).click();
        await expect(page).toHaveURL(/\/comande$/, { timeout: 15_000 });
        await expect(page.getByRole("main")).toBeVisible();

        await sidebar.getByRole("link", { name: "Prenotazioni", exact: true }).click();
        await expect(page).toHaveURL(/\/prenotazioni$/, { timeout: 15_000 });
        await expect(page.getByRole("main")).toBeVisible();
    });

    test("/orders porta dentro una sede, non resta una pagina d'azienda", async ({ page }) => {
        const paths = await locationPaths(page);
        await page.goto(`${paths[0]}/comande`);
        await expect(page).toHaveURL(/\/comande$/, { timeout: 15_000 });

        await page.goto(page.url().replace(/\/locations\/.*$/, "/orders"));
        await expect(page).toHaveURL(/\/locations\/[0-9a-f-]+\/comande$|\/locations$/, { timeout: 15_000 });
    });

    test("«Tutte le sedi» riporta all'elenco", async ({ page }) => {
        await openFirstLocation(page);
        await contextNav(page).getByRole("link", { name: /^(Tutte le sedi|Azienda)$/ }).click();
        await expect(page).toHaveURL(/\/(locations|overview)$/, { timeout: 15_000 });
        await expect(nav(page).getByRole("link", { name: "Panoramica", exact: true })).toBeVisible();
    });

    test("le voci senza piano portano alle rotte della sede", async ({ page }) => {
        await openFirstLocation(page);
        const sidebar = nav(page);

        await sidebar.getByRole("link", { name: "Servizio", exact: true }).click();
        await expect(page).toHaveURL(/\/servizio$/, { timeout: 15_000 });

        await sidebar.getByRole("link", { name: "Cosa vedono i clienti", exact: true }).click();
        await expect(page).toHaveURL(/\/cosa-vedono$/, { timeout: 15_000 });

        await sidebar.getByRole("link", { name: "Scheda", exact: true }).click();
        await expect(page).toHaveURL(/\/anagrafica$/, { timeout: 15_000 });
    });

    // §51.6: chi configura entra nella sede dalla Scheda (era: la prima voce
    // usabile della sidebar).
    test("entrando dalla griglia chi configura atterra sulla Scheda", async ({ page }) => {
        await openFirstLocation(page);
        await expect(page).toHaveURL(/\/locations\/[0-9a-f-]+\/anagrafica$/, { timeout: 15_000 });
    });

    test("i vecchi ?tab= sull'indirizzo della sede portano ancora alla sezione", async ({ page }) => {
        const paths = await locationPaths(page);
        await page.goto(`${paths[0]}?tab=hours`);
        await expect(page).toHaveURL(/\/orari$/, { timeout: 15_000 });
        await page.goto(`${paths[0]}?tab=availability`);
        await expect(page).toHaveURL(/\/cosa-vedono$/, { timeout: 15_000 });
    });

    test("«Cosa vedono i clienti» è una voce a sé: niente tab della Scheda", async ({ page }) => {
        const paths = await locationPaths(page);
        await page.goto(`${paths[0]}/cosa-vedono`);
        await expect(nav(page).getByRole("link", { name: "Cosa vedono i clienti", exact: true })).toHaveAttribute(
            "aria-current",
            "page",
            { timeout: 15_000 }
        );
        await expect(page.getByRole("main").getByRole("table").first()).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole("tab", { name: /^(Anagrafica|Orari|Pubblicazione)$/ })).toHaveCount(0);
    });

    // Programmazione della sede (T9b, PG6; supera §51.11): un vecchio
    // `?sede=` porta alla rotta della sede.
    test("«Vai a Programmazione» con la sede: si apre la Programmazione della sede", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "con una sede sola la Programmazione è quella dell'azienda");
        const id = paths[1].split("/").pop()!;
        await page.goto(`${paths[1].replace(/\/locations\/.*$/, "/scheduling")}?sede=${id}`);
        await expect(page).toHaveURL(new RegExp(`/locations/${id}/programmazione$`), { timeout: 15_000 });
        await expect(page.getByRole("main").getByRole("combobox", { name: "Sede" })).toHaveCount(0);
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
});

test.describe("Ingresso nell'azienda", () => {
    /** L'indirizzo dell'azienda, senza pagina: `/business/:id`. */
    async function businessRoot(page: Page): Promise<string> {
        const paths = await locationPaths(page);
        return paths[0].replace(/\/locations\/.*$/, "");
    }

    test("con più sedi l'indirizzo dell'azienda apre la Panoramica", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        await page.goto(paths[0].replace(/\/locations\/.*$/, ""));
        await expect(page).toHaveURL(/\/overview$/, { timeout: 15_000 });
    });

    // §51.6: chi configura atterra sulla Panoramica anche con una sede sola
    // (era: si entrava nella sede, con l'uscita «Azienda»).
    test("con una sede sola chi configura apre la Panoramica", async ({ page }) => {
        const root = await businessRoot(page);
        await asSingleSede(page);
        await page.goto(root);
        await expect(page).toHaveURL(/\/overview$/, { timeout: 15_000 });
    });
});

test.describe("Atterraggio per ruolo", () => {
    /** Dove si è atterrati: una pagina vera, mai il lucchetto né l'accesso negato. */
    async function expectUsableLanding(page: Page, segment: string): Promise<void> {
        await expect(page).toHaveURL(new RegExp(`/locations/[0-9a-f-]+/${segment}$`), { timeout: 15_000 });
        const current = nav(page).locator('a[aria-current="page"]');
        await expect(current).toHaveCount(1, { timeout: 15_000 });
        await expect(current.locator('[aria-label="Funzione del piano Pro"]')).toHaveCount(0);
        const main = page.getByRole("main");
        await expect(main.getByRole("button").first()).toBeVisible({ timeout: 15_000 });
        for (const blocked of ["Non hai accesso", "richiede il piano Pro", "Sede non trovata"]) {
            await expect(main.getByText(blocked)).toHaveCount(0);
        }
    }

    // Con Pro si atterra su Servizio. Con Base Servizio è tutto sotto
    // lucchetto (Gestisci la sala è passata nella Scheda come Sala,
    // correzioni UI T5): si atterra sulla Sala. Il modo lo prova servizio.spec.
    const CASI = [
        { role: "staff", plan: "pro", segment: "servizio" },
        { role: "viewer", plan: "pro", segment: "servizio" },
        { role: "staff", plan: "base", segment: "sala" },
        { role: "viewer", plan: "base", segment: "sala" }
    ] as const;

    for (const { role, plan, segment } of CASI) {
        test(`${role}, piano ${plan}: entrando nella sede si arriva a ${segment}`, async ({ page }) => {
            const paths = await locationPaths(page);
            const id = paths[0].split("/").pop()!;
            await asRole(page, role, id, plan);
            await page.goto(paths[0]);
            await expectUsableLanding(page, segment);
        });

        test(`${role}, piano ${plan}: con una sola sede leggibile l'azienda si apre nella sede`, async ({ page }) => {
            const paths = await locationPaths(page);
            const id = paths[0].split("/").pop()!;
            await asRole(page, role, id, plan);
            await page.goto(paths[0].replace(/\/locations\/.*$/, ""));
            await expect(page).toHaveURL(new RegExp(`/locations/${id}/`), { timeout: 15_000 });
            await expectUsableLanding(page, segment);
            // Una sede sola: sidebar unica, nessun contesto da cui uscire (§51.3).
            await expect(contextNav(page)).toHaveCount(0);
        });
    }
});
