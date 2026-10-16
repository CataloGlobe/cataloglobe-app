import { expect, test } from "@playwright/test";
import { openBusinessPage } from "./business";
import { sidebarLink } from "./nav";
import { D_ON } from "./lookD";

test.describe("Panoramica", () => {
    test.beforeEach(async ({ page }) => {
        await openBusinessPage(page, "overview", "Panoramica");
    });

    test("titolo di pagina", async ({ page }) => {
        // Titolo finale: «Panoramica · {azienda} · CataloGlobe» (MainLayout).
        // Prima che il tenant sia caricato è «Panoramica · CataloGlobe» per
        // ~500 ms: agganciare quello verificherebbe uno stato transitorio.
        await expect(page).toHaveTitle(/^(Panoramica|Home) · .+ · CataloGlobe$/);
    });

    test("sidebar con voce Panoramica attiva", async ({ page }) => {
        const nav = page.getByRole("navigation", { name: "Menu principale" });
        await expect(nav).toBeVisible();
        const link = nav.getByRole("link", { name: /^(Panoramica|Home)$/ });
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute("aria-current", "page");
        // Sedi è diretta, Prodotti in Menù e vetrina, Regole nel Calendario.
        for (const label of ["Sedi", "Prodotti", "Regole"]) {
            await expect(await sidebarLink(page, label)).toBeVisible();
        }
    });

    test("vetrina: la card delle pagine pubbliche", async ({ page }) => {
        const main = page.getByRole("main");
        await expect(main.getByText("La vetrina adesso", { exact: true })).toBeVisible();
        // Nella D (Home della copia) il numero delle sedi è «N sedi»; con una sede sola non c'è.
        await expect(main.getByText(D_ON ? /^\d+ sedi$/ : /^(1 sede online|\d+ sedi online)$/)).toBeVisible();
    });

    test("Home della D: la riga di oggi e «Da fare»", async ({ page }) => {
        test.skip(!D_ON, "Solo con la D");
        const main = page.getByRole("main");
        await expect(main.getByText(/^Oggi (a|in) /)).toBeVisible();
        await expect(main.getByRole("heading", { name: "Da fare" })).toBeVisible();
        await expect(main.getByRole("heading", { name: "Cosa hai attivato" })).toHaveCount(0);
    });

    test("vetrina: riga di una sede pubblica con nome, URL e QR", async ({ page }) => {
        const main = page.getByRole("main");
        if (D_ON) {
            // Vetrina compatta della copia: nome come link alla pagina pubblica, QR e ⋯, senza l'URL scritto.
            const nameLink = main.locator('a[target="_blank"][href^="http"]').first();
            await expect(nameLink).toBeVisible();
            await expect(nameLink).not.toHaveText("");
            await expect(main.getByRole("img", { name: /^QR di / }).first()).toBeVisible();
            await expect(main.getByRole("button", { name: /^Azioni per / }).first()).toBeVisible();
            return;
        }
        // Il link il cui testo È l'URL pubblico: da lì si risale alla sede.
        const urlLink = main.getByRole("link", { name: /^https?:\/\// }).first();
        await expect(urlLink).toBeVisible();
        const href = await urlLink.getAttribute("href");
        expect(href).toMatch(/^https?:\/\//);
        await expect(urlLink).toHaveText(href!);

        // Stesso href, testo diverso: il nome della sede come collegamento vero.
        const nameLink = main.locator(`a[href="${href}"]`).filter({ hasNotText: href! });
        await expect(nameLink).toBeVisible();
        await expect(nameLink).toHaveAttribute("target", "_blank");
        await expect(nameLink).not.toHaveText("");

        // Un QR per sede online, col nome accessibile della scheda QrCode.
        await expect(main.getByRole("img", { name: /^QR di / }).first()).toBeVisible();

        // Il menu ⋯ della riga (Copia link · Scarica QR).
        await expect(main.getByRole("button", { name: "Azioni" }).first()).toBeVisible();
    });

    test("l'azione «Servizio» di una sede porta alla sua pagina Servizio", async ({ page }) => {
        // Lotto B-a: «Tavoli» portava a /sala; i nomi delle azioni sono le voci di sidebar.
        const main = page.getByRole("main");
        await main.getByRole("button", { name: /^Azioni per / }).first().click();
        await expect(page.getByRole("menuitem", { name: "Tavoli", exact: true })).toHaveCount(0);
        await page.getByRole("menuitem", { name: "Servizio", exact: true }).click();
        await expect(page).toHaveURL(/\/locations\/[0-9a-f-]+\/servizio$/, { timeout: 15_000 });
    });
});
