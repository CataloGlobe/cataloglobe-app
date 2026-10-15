import { expect, test, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";
import { GARBAGNATE_ID, stubReservations } from "./reservationsStub";

/**
 * Sedi (`/business/:businessId/locations`), viste da un amministratore su
 * un'azienda con più sedi e sedi pagate ancora libere. Copre le feature che
 * sopravvivono alla riscrittura (registro feature, §Sedi passo 2): titolo;
 * le tab Sedi | Gruppi di sedi; la griglia con una card per sede, stato e
 * riga del menù attivo; la vista lista con le sue colonne; la ricerca senza
 * risultati; il drawer «Nuova sede» aperto e chiuso senza creare niente; la
 * tabella dei gruppi. Nessuna scrittura: creare o eliminare una sede
 * consuma una sede pagata o cancella dati.
 */
/** Con VITE_BACKOFFICE_D acceso Tutte le sedi è a card, senza vista lista (Visual Redesign 2, PR 11a). */
const lookD = (page: Page) => page.evaluate(() => document.documentElement.dataset.look === "d");
const OLD_VIEW = "nella D Tutte le sedi ha solo le card (copia `pSdAll`): coperto dai test D in fondo";

test.describe("Sedi", () => {
    test.beforeEach(async ({ page }) => {
        await openBusinessPage(page, "locations", "Sedi");
    });

    test("titolo di pagina", async ({ page }) => {
        await expect(page).toHaveTitle(/^Sedi · .+ · CataloGlobe$/);
    });

    test("header: tab Sedi e Gruppi, ricerca, vista, aggiungi", async ({ page }) => {
        test.skip(await lookD(page), OLD_VIEW);
        await expect(page.getByRole("radio", { name: "Sedi", exact: true })).toHaveAttribute("aria-checked", "true");
        await expect(page.getByRole("radio", { name: "Gruppi di sedi" })).toBeVisible();
        await expect(page.getByRole("textbox", { name: /Cerca sede/ })).toBeVisible();
        await expect(page.getByRole("radio", { name: "Vista griglia" })).toBeVisible();
        await expect(page.getByRole("radio", { name: "Vista lista" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Aggiungi sede" })).toBeEnabled();
    });

    test("griglia: una card per sede con stato e menù attivo", async ({ page }) => {
        test.skip(await lookD(page), OLD_VIEW);
        await page.getByRole("radio", { name: "Vista griglia" }).click();
        const main = page.getByRole("main");
        // Card della griglia: `article` sulla pagina vecchia, `listitem` di CardGrid dopo.
        const cards = main.locator('article, [role="listitem"]');
        await expect(cards.first()).toBeVisible({ timeout: 15_000 });
        expect(await cards.count()).toBeGreaterThan(1);
        const first = cards.first();
        await expect(first.getByText(/^(Online|Sospesa)/)).toBeVisible();
        // S2 (correzioni UI): «Menù adesso», o «Pagina pubblica» per una sede sospesa.
        await expect(first.getByText(/^(Menù adesso|Pagina pubblica)$/)).toBeVisible();
        await expect(first.getByRole("button", { name: "Azioni sede" })).toBeVisible();
    });

    test("«N da gestire» sulla sede che ha richieste in attesa, e porta alla sua coda (§48.1/3)", async ({ page }) => {
        test.skip(await lookD(page), OLD_VIEW);
        // Le prenotazioni finte: 3 in attesa a Garbagnate (una scaduta), 1 a Varedo.
        await stubReservations(page);
        await page.reload();
        await page.getByRole("radio", { name: "Vista griglia" }).click();
        const main = page.getByRole("main");
        const garbagnate = main.getByRole("listitem").filter({ hasText: /Garbagnate/ }).first();
        await expect(garbagnate.getByRole("link", { name: "3 da gestire" })).toBeVisible({ timeout: 15_000 });
        const varedo = main.getByRole("listitem").filter({ hasText: /Varedo/ }).first();
        await expect(varedo.getByRole("link", { name: "1 da gestire" })).toBeVisible();
        // Zero non si dice: una sede senza richieste non ha il segnale.
        expect(await main.getByRole("link", { name: /da gestire$/ }).count()).toBe(2);

        // Anche nella lista, accanto al nome.
        await page.getByRole("radio", { name: "Vista lista" }).click();
        await expect(main.getByRole("link", { name: "3 da gestire" })).toBeVisible();
        await page.getByRole("radio", { name: "Vista griglia" }).click();

        await garbagnate.getByRole("link", { name: "3 da gestire" }).click();
        await expect(page).toHaveURL(new RegExp(`/locations/${GARBAGNATE_ID}/prenotazioni`));
        await expect(page.getByRole("main").getByText("Da gestire", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    });

    test("se il conteggio delle modifiche a mano fallisce la card lo dice, e il menù resta", async ({ page }) => {
        test.skip(await lookD(page), OLD_VIEW);
        // Solo la lettura dei conteggi (`activity_id,mode`): il resolver del
        // menù legge la stessa tabella con altre colonne e deve riuscire.
        await page.route(/\/rest\/v1\/activity_product_overrides\?/, route => {
            const params = new URL(route.request().url()).searchParams;
            return params.get("select") === "activity_id,mode"
                ? route.fulfill({ status: 500, json: { code: "E2E", message: "giù" } })
                : route.fallback();
        });
        await page.reload();
        await page.getByRole("radio", { name: "Vista griglia" }).click();
        const main = page.getByRole("main");
        const card = main.getByRole("listitem").filter({ hasText: "Modifiche a mano non caricate" }).first();
        await expect(card).toBeVisible({ timeout: 15_000 });
        // Il menù attivo è un'altra domanda: resta risolto.
        await expect(card.getByText("Stato menù non disponibile")).toHaveCount(0);
        await page.getByRole("radio", { name: "Vista lista" }).click();
        await expect(main.getByText("Modifiche a mano non caricate").first()).toBeVisible();
        await page.getByRole("radio", { name: "Vista griglia" }).click();
    });

    test("lista: le colonne della tabella", async ({ page }) => {
        test.skip(await lookD(page), OLD_VIEW);
        await page.getByRole("radio", { name: "Vista lista" }).click();
        const main = page.getByRole("main");
        for (const header of ["Indirizzo", "Stato", "Menù adesso"]) {
            await expect(main.getByText(header, { exact: true }).first()).toBeVisible({ timeout: 15_000 });
        }
        // S3: lo stato c'è anche nella cella Sede, nascosto sopra 768.
        await expect(main.getByText(/^(Online|Sospesa)$/).locator("visible=true").first()).toBeVisible();
        // La preferenza torna alla griglia, così gli altri test partono uguali.
        await page.getByRole("radio", { name: "Vista griglia" }).click();
    });

    test("ricerca senza risultati", async ({ page }) => {
        await page.getByRole("textbox", { name: /Cerca (una )?sede/ }).fill("nessuna-sede-con-questo-nome");
        const main = page.getByRole("main");
        await expect(main.getByText("Nessun risultato")).toBeVisible();
        await expect(main.locator('article, [role="listitem"]')).toHaveCount(0);
    });

    test("drawer «Nuova sede»: si apre e si chiude senza creare", async ({ page }) => {
        await page.getByRole("button", { name: "Aggiungi sede" }).click();
        const dialog = page.getByRole("dialog");
        await expect(dialog.getByText("Nuova sede", { exact: true })).toBeVisible();
        await expect(dialog.getByRole("textbox", { name: /^Nome/ })).toBeVisible();
        await expect(dialog.getByRole("button", { name: "Crea sede" })).toBeVisible();
        await dialog.getByRole("button", { name: "Annulla", exact: true }).click();
        await expect(page.getByRole("dialog")).toBeHidden();
    });

    test("gruppi di sedi: la tabella", async ({ page }) => {
        await page.getByRole("radio", { name: "Gruppi di sedi" }).click();
        await expect(page).toHaveURL(/tab=groups/);
        const main = page.getByRole("main");
        // Intestazione «Nome gruppo» (pagina vecchia) o «Gruppo» (DataTable), oppure il vuoto.
        await expect(main.getByText(/^(Nome gruppo|Gruppo|Nessun gruppo)/).first()).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole("textbox", { name: /Cerca (un )?gruppo/ })).toBeVisible();
    });

    test.describe("nella D", () => {
        test.beforeEach(async ({ page }) => {
            test.skip(!(await lookD(page)), "solo con VITE_BACKOFFICE_D acceso");
        });

        test("frase, Sedi o Gruppi, filtri, Cerca e Aggiungi sede", async ({ page }) => {
            const main = page.getByRole("main");
            await expect(main.getByText(/^\d+ sedi$/)).toBeVisible({ timeout: 15_000 });
            await expect(page.getByRole("radio", { name: "Sedi", exact: true })).toHaveAttribute("aria-checked", "true");
            await expect(main.getByRole("radio", { name: /^Con un problema/ })).toBeVisible();
            await expect(page.getByRole("textbox", { name: "Cerca una sede" })).toBeVisible();
            await expect(page.getByRole("button", { name: "Aggiungi sede" })).toBeEnabled();
            await expect(page.getByRole("radio", { name: "Vista lista" })).toHaveCount(0);
        });

        test("una card per sede: stato, cosa vedono i clienti, il ⋮; la card apre la Scheda", async ({ page }) => {
            const cards = page.getByRole("main").getByRole("list", { name: "Sedi" }).getByRole("listitem");
            await expect(cards.first()).toBeVisible({ timeout: 15_000 });
            expect(await cards.count()).toBeGreaterThan(1);
            const first = cards.first();
            await expect(first.getByText(/^(Online|Sospesa)/)).toBeVisible();
            await expect(first.getByText(/^(I clienti vedono|Chi apre il link legge|Nessun menù in onda)/)).toBeVisible({ timeout: 15_000 });
            await expect(first.getByRole("button", { name: /^Altro per / })).toBeVisible();
            await first.getByRole("link", { name: /^Apri la scheda di / }).click();
            await expect(page).toHaveURL(/\/locations\/[0-9a-f-]+\/anagrafica$/);
        });

        test("le prenotazioni da confermare sono un link alla coda della sede", async ({ page }) => {
            await stubReservations(page);
            await page.reload();
            const garbagnate = page.getByRole("main").getByRole("listitem").filter({ hasText: /Garbagnate/ }).first();
            await expect(garbagnate.getByRole("link", { name: "3 prenotazioni da confermare" })).toBeVisible({ timeout: 15_000 });
            await garbagnate.getByRole("link", { name: "3 prenotazioni da confermare" }).click();
            await expect(page).toHaveURL(new RegExp(`/locations/${GARBAGNATE_ID}/prenotazioni`));
        });

        test("«Sospese» mostra solo le sedi sospese", async ({ page }) => {
            const main = page.getByRole("main");
            await expect(main.getByRole("list", { name: "Sedi" })).toBeVisible({ timeout: 15_000 });
            await main.getByRole("radio", { name: /^Sospese/ }).click();
            const cards = main.getByRole("listitem");
            for (const card of await cards.all()) await expect(card.getByText(/^Sospesa/)).toBeVisible();
        });
    });
});
