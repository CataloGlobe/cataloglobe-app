import { expect, test } from "@playwright/test";
import { openBusinessPage } from "./business";

/**
 * Team (`/business/:businessId/settings/team`, tab di Impostazioni dal
 * §51.12), visto da un amministratore.
 * Copre le feature che sopravvivono alla riscrittura (registro feature,
 * §Team passo 2): header con tab, ricerca, filtro e CTA; la tabella dei
 * membri con la propria riga marcata «Tu» e il menu ⋯ sulle altre; il
 * drawer «Invita un membro» aperto e chiuso senza inviare niente.
 */
test.describe("Team", () => {
    test.beforeEach(async ({ page }) => {
        // Team è una tab di Impostazioni (§51.12): non è più una voce di sidebar.
        await openBusinessPage(page, "settings", "Impostazioni");
        await page.getByRole("tab", { name: "Team", exact: true }).click();
        await page.waitForURL(/\/settings\/team$/);
        // Pagina pronta: i membri vengono dalla RPC vera (`get_tenant_members`),
        // che sotto carico supera i 5 s. Stesso cancello da 15 s delle altre
        // pagine: la tabella dei membri c'è e non sta più caricando.
        const members = page.getByRole("table", { name: "Membri del team" });
        await expect(members).toBeVisible({ timeout: 15_000 });
        await expect(members.locator('[role="rowgroup"][aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
    });

    test("titolo di pagina", async ({ page }) => {
        await expect(page).toHaveTitle(/^Team · .+ · CataloGlobe$/);
    });

    test("IM3: Membri · Inviti come segmenti con il conteggio, ricerca e ruoli a destra; in testata solo «Invita membro»", async ({ page }) => {
        const main = page.getByRole("main");
        const membri = main.getByRole("radio", { name: /^Membri · \d+$/ });
        await expect(membri).toHaveAttribute("aria-checked", "true");
        await expect(main.getByRole("radio", { name: /^Inviti in attesa · \d+$/ })).toBeVisible();
        const search = main.getByRole("textbox", { name: /Cerca per email/ });
        await expect(search).toBeVisible();
        await expect(main.getByRole("combobox", { name: "Filtra per ruolo" })).toBeVisible();
        // Segmenti a sinistra, ricerca a destra, sulla stessa riga.
        const a = (await membri.boundingBox())!;
        const b = (await search.boundingBox())!;
        expect(a.x).toBeLessThan(b.x);
        expect(Math.abs(a.y + a.height / 2 - (b.y + b.height / 2))).toBeLessThan(6);
        // «Invita membro» una volta sola, sulla riga delle tab di Impostazioni
        // (dal §51.12 quella testata sta dentro <main>), non nella toolbar.
        const invite = page.getByRole("button", { name: "Invita membro" });
        await expect(invite).toHaveCount(1);
        const c = (await invite.boundingBox())!;
        const t = (await main.getByRole("tablist").boundingBox())!;
        expect(Math.abs(c.y + c.height / 2 - (t.y + t.height / 2))).toBeLessThan(12);
        expect(c.y + c.height).toBeLessThanOrEqual(a.y);
    });

    test("IM3: «invitare non costa» nel piede della tabella", async ({ page }) => {
        const main = page.getByRole("main");
        await expect(main.getByRole("table").first()).toBeVisible();
        await expect(
            main.getByText("I posti pagati contano le sedi, non le persone: invitare non costa.")
        ).toBeVisible();
    });

    test("membri: la mia riga è «Tu», le altre hanno il menu ⋯", async ({ page }) => {
        const main = page.getByRole("main");
        await expect(main.getByText("Tu", { exact: true })).toBeVisible();
        // Un amministratore vede il ⋯ su almeno un altro membro.
        await expect(main.getByRole("button", { name: "Azioni" }).first()).toBeVisible();
    });

    test("ricerca senza risultati", async ({ page }) => {
        await page.getByRole("textbox", { name: /Cerca per email/ }).fill("nessuno@esempio.invalido");
        const main = page.getByRole("main");
        await expect(main.getByRole("button", { name: "Azioni" })).toHaveCount(0);
        await expect(main.getByText(/Nessun/)).toBeVisible();
    });

    test("drawer «Invita un membro» si apre e si chiude senza inviare", async ({ page }) => {
        await page.getByRole("button", { name: "Invita membro" }).click();
        const drawer = page.getByRole("dialog");
        await expect(drawer.getByText("Invita un membro", { exact: true })).toBeVisible();
        await expect(drawer.getByRole("textbox", { name: "Email", exact: true })).toBeVisible();
        await expect(drawer.getByRole("radiogroup", { name: "Ruolo" })).toBeVisible();
        await expect(drawer.getByRole("radio")).toHaveCount(4);
        await expect(drawer.getByRole("button", { name: "Invia invito" })).toBeVisible();
        await drawer.getByRole("button", { name: "Annulla", exact: true }).click();
        await expect(page.getByRole("dialog")).toBeHidden();
    });
});
