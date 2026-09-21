import { expect, test } from "@playwright/test";
import { openBusinessPage } from "./business";

test.describe("Panoramica", () => {
    test.beforeEach(async ({ page }) => {
        await openBusinessPage(page, "overview", "Panoramica");
    });

    test("titolo di pagina", async ({ page }) => {
        // Titolo finale: «Panoramica — {azienda} | CataloGlobe» (MainLayout).
        // Prima che il tenant sia caricato è «Panoramica | CataloGlobe» per
        // ~500 ms: agganciare quello verificherebbe uno stato transitorio.
        await expect(page).toHaveTitle(/^Panoramica — .+ \| CataloGlobe$/);
    });

    test("sidebar con voce Panoramica attiva", async ({ page }) => {
        const nav = page.getByRole("navigation", { name: "Menu principale" });
        await expect(nav).toBeVisible();
        const link = nav.getByRole("link", { name: "Panoramica" });
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute("aria-current", "page");
        for (const label of ["Sedi", "Prodotti", "Programmazione"]) {
            await expect(nav.getByRole("link", { name: label })).toBeVisible();
        }
    });

    test("vetrina: la card delle pagine pubbliche", async ({ page }) => {
        const main = page.getByRole("main");
        await expect(main.getByText("La vetrina adesso", { exact: true })).toBeVisible();
        await expect(main.getByText(/^(1 sede pubblicata|\d+ sedi pubblicate)$/)).toBeVisible();
    });

    test("vetrina: riga di una sede pubblica con nome, URL e QR", async ({ page }) => {
        const main = page.getByRole("main");
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

        // Un QR per sede pubblicata, col nome accessibile della scheda QrCode.
        await expect(main.getByRole("img", { name: /^QR di / }).first()).toBeVisible();

        // Il menu ⋯ della riga (Copia link · Scarica QR).
        await expect(main.getByRole("button", { name: "Azioni" }).first()).toBeVisible();
    });
});
