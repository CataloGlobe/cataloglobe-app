import { expect, test } from "@playwright/test";
import { openBusinessPage } from "./business";

/**
 * Team (`/business/:businessId/team`), visto da un amministratore.
 * Copre le feature che sopravvivono alla riscrittura (registro feature,
 * §Team passo 2): header con tab, ricerca, filtro e CTA; la tabella dei
 * membri con la propria riga marcata «Tu» e il menu ⋯ sulle altre; il
 * drawer «Invita un membro» aperto e chiuso senza inviare niente.
 */
test.describe("Team", () => {
    test.beforeEach(async ({ page }) => {
        await openBusinessPage(page, "team", "Team");
    });

    test("titolo di pagina", async ({ page }) => {
        await expect(page).toHaveTitle(/^Team — .+ \| CataloGlobe$/);
    });

    test("header: tab, ricerca, filtro ruolo, invito", async ({ page }) => {
        await expect(page.getByRole("tab", { name: "Membri" })).toHaveAttribute("aria-selected", "true");
        await expect(page.getByRole("tab", { name: /^Inviti in attesa/ })).toBeVisible();
        await expect(page.getByRole("textbox", { name: /Cerca per email/ })).toBeVisible();
        await expect(page.getByRole("combobox", { name: "Filtra per ruolo" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Invita membro" })).toBeVisible();
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
        // Il radiogroup non ha ancora un nome accessibile (gap di RadioGroup,
        // registro §Team): si prende per ruolo dentro il drawer, 4 ruoli.
        await expect(drawer.getByRole("radiogroup")).toBeVisible();
        await expect(drawer.getByRole("radio")).toHaveCount(4);
        await expect(drawer.getByRole("button", { name: "Invia invito" })).toBeVisible();
        await drawer.getByRole("button", { name: "Annulla", exact: true }).click();
        await expect(page.getByRole("dialog")).toBeHidden();
    });
});
