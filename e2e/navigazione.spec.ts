import { expect, test } from "@playwright/test";
import { asRole } from "./asRole";
import {
    activityIdOf,
    asSingleSede,
    businessRoot,
    contextNav,
    locationPaths,
    nav,
    sidebarShape
} from "./nav";

/**
 * Navigazione v2 (§51): una o più sedi leggibili decidono la sidebar.
 * Locator per ruolo, nessuna scrittura; una sede sola si ottiene riducendo
 * l'elenco delle sedi in pagina, i ruoli con `asRole`.
 */

const CATALOGO = ["Catalogo", ["Menù", "Prodotti", "Programmazione"]] as const;
const PAGINA_PUBBLICA = ["Pagina pubblica", ["Stili", "In evidenza", "Storie", "Lingue"]] as const;
const OPERATIVITA = ["Operatività", ["Servizio", "Prenotazioni", "Comande", "Storico"]] as const;
const IL_LOCALE = ["Il locale", ["Scheda", "Cosa vedono i clienti"]] as const;

test.describe("Sidebar (§51.5)", () => {
    test("azienda con più sedi: Sedi sotto Panoramica, niente Ordini, Prenotazioni, Team, Abbonamento", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        await page.goto(`${businessRoot(paths[0])}/products`);
        await expect
            .poll(() => sidebarShape(page), { timeout: 15_000 })
            .toEqual([
                [null, ["Panoramica", "Sedi"]],
                CATALOGO,
                PAGINA_PUBBLICA,
                ["Andamento", ["Analitiche", "Recensioni", "Clienti"]],
                [null, ["Impostazioni"]]
            ]);
        await expect(nav(page).getByRole("link", { name: "Assistenza", exact: true })).toBeVisible();
        for (const voce of ["Ordini", "Team", "Abbonamento"]) {
            await expect(nav(page).getByRole("link", { name: voce, exact: true })).toHaveCount(0);
        }
    });

    test("dentro una sede: «← Tutte le sedi», il locale, Operatività, Andamento della sede", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        await page.goto(`${paths[0]}/anagrafica`);
        await expect
            .poll(() => sidebarShape(page), { timeout: 15_000 })
            .toEqual([IL_LOCALE, OPERATIVITA, ["Andamento", ["Analitiche", "Recensioni"]]]);
        await expect(nav(page).getByRole("link", { name: "Assistenza", exact: true })).toBeVisible();
        // In testa solo il ritorno: nome e stato della sede stanno nell'header.
        await expect(contextNav(page).getByRole("link")).toHaveText(["Tutte le sedi"]);
        await contextNav(page).getByRole("link", { name: "Tutte le sedi" }).click();
        await expect(page).toHaveURL(/\/locations$/, { timeout: 15_000 });
    });

    test("le voci di Andamento dentro la sede portano alle rotte della sede", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        await page.goto(`${paths[0]}/anagrafica`);
        await expect(nav(page).getByRole("link", { name: "Analitiche", exact: true })).toHaveAttribute(
            "href",
            `${paths[0]}/analitiche`,
            { timeout: 15_000 }
        );
        await expect(nav(page).getByRole("link", { name: "Recensioni", exact: true })).toHaveAttribute(
            "href",
            `${paths[0]}/recensioni`
        );
    });

    test("una sede: sidebar unica, niente voce Sedi, niente contesto", async ({ page }) => {
        const paths = await locationPaths(page);
        await asSingleSede(page);
        await page.goto(`${businessRoot(paths[0])}/products`);
        await expect
            .poll(() => sidebarShape(page), { timeout: 15_000 })
            .toEqual([
                [null, ["Panoramica"]],
                IL_LOCALE,
                CATALOGO,
                PAGINA_PUBBLICA,
                OPERATIVITA,
                ["Andamento", ["Analitiche", "Recensioni", "Clienti"]],
                [null, ["Impostazioni"]]
            ]);
        await expect(nav(page).getByRole("link", { name: "Sedi", exact: true })).toHaveCount(0);
        await expect(contextNav(page)).toHaveCount(0);
        // Le voci di sede portano alla sola sede, anche da una pagina d'azienda.
        await expect(nav(page).getByRole("link", { name: "Scheda", exact: true })).toHaveAttribute(
            "href",
            `${paths[0]}/anagrafica`
        );
    });

    test("una sede: dentro la sede la sidebar resta quella unica", async ({ page }) => {
        const paths = await locationPaths(page);
        await asSingleSede(page);
        await page.goto(`${paths[0]}/comande`);
        await expect(nav(page).getByRole("link", { name: "Panoramica", exact: true })).toBeVisible({ timeout: 15_000 });
        await expect(nav(page).getByRole("link", { name: "Comande", exact: true })).toHaveAttribute("aria-current", "page");
        await expect(contextNav(page)).toHaveCount(0);
    });

    test("staff di una sede: vede Operatività, non Programmazione né Analitiche", async ({ page }) => {
        const paths = await locationPaths(page);
        await asRole(page, "staff", activityIdOf(paths[0]), "pro");
        await page.goto(`${paths[0]}/servizio`);
        await expect
            .poll(async () => (await sidebarShape(page)).map(([title]) => title), { timeout: 15_000 })
            .toContain("Operatività");
        const sidebar = nav(page);
        for (const voce of OPERATIVITA[1]) {
            await expect(sidebar.getByRole("link", { name: voce, exact: true })).toBeVisible();
        }
        for (const voce of ["Programmazione", "Analitiche", "Sedi"]) {
            await expect(sidebar.getByRole("link", { name: voce, exact: true })).toHaveCount(0);
        }
    });

    test("manager di una sede su più: sidebar unica, con Programmazione", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        await asRole(page, "manager", activityIdOf(paths[0]), "pro");
        await page.goto(`${businessRoot(paths[0])}/scheduling`);
        await expect(nav(page).getByRole("link", { name: "Programmazione", exact: true })).toBeVisible({ timeout: 15_000 });
        await expect(nav(page).getByRole("link", { name: "Scheda", exact: true })).toHaveAttribute(
            "href",
            `${paths[0]}/anagrafica`
        );
        await expect(nav(page).getByRole("link", { name: "Sedi", exact: true })).toHaveCount(0);
    });
});
