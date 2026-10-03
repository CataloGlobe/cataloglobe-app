import { expect, test, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";

/**
 * Il contesto di sede (lotto `ds-5-sede-nav`, §46.1): entrando in un locale la
 * sidebar diventa la sua — cinque voci, la freccia per uscire, il nome della
 * sede — e quella dell'azienda sparisce. Scritto **prima** del guscio: finché
 * P0 non c'è questi test sono rossi per disegno.
 *
 * P1: Comande e Prenotazioni sono rotte della sede (`/comande`,
 * `/prenotazioni`) e prendono la sede dal path; `/orders` reindirizza
 * nell'ultima sede usata.
 *
 * Locator per ruolo, mai per tag. Nessuna scrittura.
 */

const SEDE_VOCI = ["Comande", "Prenotazioni", "Sala", "Cosa vedono i clienti", "Scheda"] as const;

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
            await expect(sidebar.getByText(voce, { exact: true })).toBeVisible({ timeout: 15_000 });
        }
        for (const voce of VOCI_AZIENDA) {
            await expect(sidebar.getByRole("link", { name: voce, exact: true })).toHaveCount(0);
        }
    });

    test("tutte e cinque le voci sono navigabili", async ({ page }) => {
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

    test("cambiando sede nell'URL cambia la sede del contesto", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");

        await page.goto(`${paths[0]}/comande`);
        await expect(page).toHaveURL(/\/comande$/, { timeout: 15_000 });
        const primo = await contextNav(page).innerText();

        await page.goto(`${paths[1]}/comande`);
        await expect(page).toHaveURL(/\/comande$/, { timeout: 15_000 });
        await expect
            .poll(async () => (await contextNav(page).innerText()) !== primo, { timeout: 15_000 })
            .toBe(true);
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

    test("le tre voci navigabili portano alle rotte della sede", async ({ page }) => {
        await openFirstLocation(page);
        const sidebar = nav(page);

        await sidebar.getByRole("link", { name: "Sala", exact: true }).click();
        await expect(page).toHaveURL(/\/sala$/, { timeout: 15_000 });

        await sidebar.getByRole("link", { name: "Cosa vedono i clienti", exact: true }).click();
        await expect(page).toHaveURL(/\/cosa-vedono$/, { timeout: 15_000 });

        await sidebar.getByRole("link", { name: "Scheda", exact: true }).click();
        await expect(page).toHaveURL(/\/anagrafica$/, { timeout: 15_000 });
    });

    test("entrando dalla griglia si atterra sulla prima voce che si può usare", async ({ page }) => {
        await openFirstLocation(page);
        await expect(page).toHaveURL(/\/locations\/[0-9a-f-]+\/[a-z-]+$/, { timeout: 15_000 });
        const links = nav(page).getByRole("link");
        await expect(links.first()).toBeVisible({ timeout: 15_000 });
        // La prima voce senza il lucchetto del piano: è quella su cui si atterra.
        const count = await links.count();
        let first: string | null = null;
        for (let i = 0; i < count; i++) {
            const link = links.nth(i);
            if ((await link.locator('[aria-label="Funzione del piano Pro"]').count()) === 0) {
                first = await link.getAttribute("href");
                break;
            }
        }
        expect(first).not.toBeNull();
        expect(new URL(page.url()).pathname).toBe(first);
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

    test("«Vai a Programmazione» con la sede: Programmazione si apre su quella sede", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "con una sede sola il filtro non c'è");
        const id = paths[1].split("/").pop()!;
        const name = await page
            .getByRole("main")
            .getByRole("listitem")
            .nth(1)
            .getByRole("link")
            .first()
            .innerText();
        await page.goto(`${paths[1].replace(/\/locations\/.*$/, "/scheduling")}?sede=${id}`);
        await expect(page).toHaveURL(/\/scheduling$/, { timeout: 15_000 });
        await expect(page.getByRole("banner").getByRole("button", { name: "Sede attiva" })).toContainText(
            name.split("\n")[0].trim(),
            { timeout: 15_000 }
        );
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
        // Il selettore è un bottone «Sede attiva» (`SedeScopeSelect`), non un combobox.
        await expect(page.getByRole("banner").getByRole("button", { name: "Sede attiva" })).toHaveCount(0);
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

    test("con una sede sola l'indirizzo dell'azienda entra nella sede", async ({ page }) => {
        const root = await businessRoot(page);
        // L'elenco delle sedi ridotto alla prima: l'azienda, per chi guarda, ne
        // ha una sola. Le letture di una sede sola (oggetto, non elenco) passano.
        await page.route(/\/rest\/v1\/activities\?/, async route => {
            const response = await route.fetch();
            const text = await response.text();
            // HEAD e conteggi non hanno corpo: passano come sono.
            const body: unknown = text ? JSON.parse(text) : null;
            if (!Array.isArray(body)) {
                await route.fulfill({ response, body: text });
                return;
            }
            await route.fulfill({ response, json: body.slice(0, 1) });
        });
        await page.goto(root);
        await expect(page).toHaveURL(/\/locations\/[0-9a-f-]+\/[a-z-]+$/, { timeout: 15_000 });
        // E l'azienda resta raggiungibile.
        await contextNav(page).getByRole("link", { name: "Azienda", exact: true }).click();
        await expect(page).toHaveURL(/\/overview$/, { timeout: 15_000 });
    });
});

test.describe("Sidebar dell'azienda", () => {
    const GRUPPI: Record<string, string[]> = {
        Sedi: ["Sedi", "Ordini", "Prenotazioni"],
        Catalogo: ["Prodotti", "Stili", "In evidenza", "Storie", "Lingue"],
        Confronto: ["Programmazione", "Analitiche", "Recensioni", "Clienti"],
        Sistema: ["Team", "Abbonamento", "Impostazioni", "Assistenza"]
    };

    test("le voci stanno nei gruppi della §5, coi titoli a vista", async ({ page }) => {
        await openBusinessPage(page, "locations", "Sedi");
        const sidebar = nav(page);
        for (const [gruppo, voci] of Object.entries(GRUPPI)) {
            const group = sidebar.getByRole("group", { name: gruppo, exact: true });
            await expect(group.getByText(gruppo, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
            for (const voce of voci) {
                await expect(group.getByRole("link", { name: voce, exact: true })).toBeVisible();
            }
        }
        await expect(sidebar.getByRole("group", { name: /^(Operatività|Contenuti|Insight)$/ })).toHaveCount(0);
    });
});
