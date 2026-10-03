import { expect, test, type Page } from "@playwright/test";
import { asRole } from "./asRole";
import {
    activityIdOf,
    asSingleSede,
    businessRoot,
    contextNav,
    locationPaths,
    nav,
    sedeSwitcher,
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

test.describe("Aspetto della sidebar (§51.15)", () => {
    /** La sidebar desktop: l'`aside` che contiene il menu. */
    const aside = (page: Page) =>
        page.locator("aside").filter({ has: nav(page) });

    async function ensureOpen(page: Page): Promise<void> {
        const expand = page.getByRole("button", { name: "Espandi menù laterale" });
        if (await expand.isVisible()) await expand.click();
        await expect(page.getByRole("button", { name: "Comprimi menù laterale" })).toBeVisible();
        await expect.poll(async () => (await aside(page).boundingBox())?.width).toBe(232);
    }

    /** La y delle voci, dall'alto: aperta e chiusa devono coincidere. */
    async function linkTops(page: Page): Promise<number[]> {
        return nav(page)
            .getByRole("link")
            .evaluateAll(links => links.map(l => Math.round(l.getBoundingClientRect().top)));
    }

    test("aperta 232, chiusa 64: le voci restano alla stessa altezza", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        await page.goto(`${paths[0]}/anagrafica`);
        await expect(nav(page).getByRole("link", { name: "Scheda", exact: true })).toBeVisible({ timeout: 15_000 });
        await ensureOpen(page);

        const open = await linkTops(page);
        const header = await contextNav(page).boundingBox();
        await page.getByRole("button", { name: "Comprimi menù laterale" }).click();
        await expect.poll(async () => (await aside(page).boundingBox())?.width).toBe(64);
        const closed = await linkTops(page);

        // Chiusa la riga sta nei 64 meno i margini (64 − bordo − 2 × 11): il
        // testo è tagliato, non a vista.
        const widths = await nav(page)
            .getByRole("link")
            .evaluateAll(links => links.map(l => Math.round(l.getBoundingClientRect().width)));
        for (const w of widths) expect(w).toBeLessThanOrEqual(42);
        expect(closed.length).toBe(open.length);
        closed.forEach((y, i) => expect(Math.abs(y - open[i])).toBeLessThanOrEqual(1));
        expect((await contextNav(page).boundingBox())?.height).toBe(header?.height);

        // Chiusa: il nome della voce nel tooltip, al passaggio e al focus.
        await nav(page).getByRole("link", { name: "Comande", exact: true }).hover();
        await expect(page.getByRole("tooltip")).toContainText("Comande");
        await page.getByRole("button", { name: "Espandi menù laterale" }).click();
        await expect.poll(async () => (await aside(page).boundingBox())?.width).toBe(232);
    });

    test("righe 36 e titoli di gruppo in uno slot di 28", async ({ page }) => {
        const paths = await locationPaths(page);
        await page.goto(`${businessRoot(paths[0])}/products`);
        await ensureOpen(page);
        const rows = await nav(page)
            .getByRole("link")
            .evaluateAll(links => links.map(l => Math.round(l.getBoundingClientRect().height)));
        expect(new Set(rows)).toEqual(new Set([36]));
        const title = nav(page).getByRole("group", { name: "Catalogo" }).getByText("Catalogo", { exact: true });
        expect(Math.round((await title.boundingBox())!.height)).toBe(28);
    });

    test("fra 768 e 1023 parte chiusa, sotto 768 è un pannello dal pulsante menu", async ({ page }) => {
        const paths = await locationPaths(page);
        await page.setViewportSize({ width: 900, height: 800 });
        await page.goto(`${businessRoot(paths[0])}/products`);
        await expect.poll(async () => (await aside(page).boundingBox())?.width, { timeout: 15_000 }).toBe(64);

        await page.setViewportSize({ width: 375, height: 800 });
        await page.getByRole("button", { name: "Apri menù di navigazione" }).click();
        await expect(nav(page).getByRole("link", { name: "Prodotti", exact: true })).toBeVisible();
        const box = (await aside(page).boundingBox())!;
        expect(Math.round(box.height)).toBe(800);
        await expect(page.getByRole("button", { name: /menù laterale/ })).toHaveCount(0);
    });
});

test.describe("Header: percorso e selettore di sede (§51.7, §51.8)", () => {
    const banner = (page: Page) => page.getByRole("banner");

    /** Il nome della sede dalla sua pagina: la Scheda lo ha nel campo «Nome del locale». */
    async function sedeName(page: Page, path: string): Promise<string> {
        await page.goto(`${path}/anagrafica`);
        const field = page.getByRole("textbox", { name: /Nome del locale/ });
        await expect(field).not.toHaveValue("", { timeout: 15_000 });
        return field.inputValue();
    }

    test("una sede: il nome della sede, il menu con «Aggiungi una sede» che apre la creazione", async ({ page }) => {
        const paths = await locationPaths(page);
        const name = await sedeName(page, paths[0]);
        await asSingleSede(page);
        await page.goto(`${businessRoot(paths[0])}/products`);
        await expect(sedeSwitcher(page)).toContainText(name, { timeout: 15_000 });
        await sedeSwitcher(page).click();
        const menu = page.getByRole("menu");
        await expect(menu.getByRole("menuitem", { name: new RegExp(name) })).toBeVisible();
        await expect(menu.getByRole("menuitem", { name: "Tutte le sedi" })).toHaveCount(0);
        await menu.getByRole("menuitem", { name: "Aggiungi una sede" }).click();
        await expect(page.getByRole("dialog").getByText(/Nuova sede|Aggiungi una sede al piano/).first()).toBeVisible();
    });

    test("più sedi, in azienda: «Tutte le sedi», scegliere una sede ci entra", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        const name = await sedeName(page, paths[1]);
        await page.goto(`${businessRoot(paths[0])}/products`);
        await expect(sedeSwitcher(page)).toContainText("Tutte le sedi", { timeout: 15_000 });
        await sedeSwitcher(page).click();
        const menu = page.getByRole("menu");
        await expect(menu.getByRole("menuitem", { name: "Aggiungi una sede" })).toBeVisible();
        await expect(menu.getByRole("menuitem", { name: "Tutte le sedi" })).toBeVisible();
        await menu.getByRole("menuitem", { name: new RegExp(`^${name}`) }).click();
        await expect(page).toHaveURL(new RegExp(`${paths[1]}/[a-z-]+$`), { timeout: 15_000 });
        await expect(sedeSwitcher(page)).toContainText(name);
    });

    test("dentro una sede: cambiare sede resta su Comande", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        const name = await sedeName(page, paths[1]);
        await page.goto(`${paths[0]}/comande`);
        await sedeSwitcher(page).click();
        await page.getByRole("menu").getByRole("menuitem", { name: new RegExp(`^${name}`) }).click();
        await expect(page).toHaveURL(`${paths[1]}/comande`, { timeout: 15_000 });
        await expect(sedeSwitcher(page)).toContainText(name);
    });

    test("manager di una sede: il menu ha la sola sede, senza «Aggiungi»", async ({ page }) => {
        const paths = await locationPaths(page);
        await asRole(page, "manager", activityIdOf(paths[0]), "pro");
        await page.goto(`${paths[0]}/anagrafica`);
        await sedeSwitcher(page).click();
        const menu = page.getByRole("menu");
        await expect(menu.getByRole("menuitem")).toHaveCount(1);
        await expect(menu.getByRole("menuitem", { name: "Aggiungi una sede" })).toHaveCount(0);
    });

    test("una sede sospesa: «Sospesa» accanto al nome", async ({ page }) => {
        const paths = await locationPaths(page);
        await page.route(/\/rest\/v1\/activities\?/, async route => {
            try {
                const response = await route.fetch();
                const text = await response.text();
                const body: unknown = text ? JSON.parse(text) : null;
                if (!Array.isArray(body)) {
                    await route.fulfill({ response, body: text });
                    return;
                }
                const rows = (body as Array<Record<string, unknown>>).map(r =>
                    r.id === activityIdOf(paths[0]) ? { ...r, status: "inactive", inactive_reason: "renovation" } : r
                );
                await route.fulfill({ response, json: rows });
            } catch {
                // Pagina chiusa a metà richiesta.
            }
        });
        await page.goto(`${paths[0]}/comande`);
        await expect(sedeSwitcher(page)).toContainText("Sospesa", { timeout: 15_000 });
        await expect(banner(page).getByText("Pubblicata")).toHaveCount(0);
    });

    test("1280: logo / azienda / sede / pagina", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        await page.goto(`${paths[0]}/comande`);
        await expect(sedeSwitcher(page)).toBeVisible({ timeout: 15_000 });
        await expect(banner(page).getByRole("link", { name: /CataloGlobe/ })).toBeVisible();
        await expect(banner(page).getByText("Comande", { exact: true })).toBeVisible();
    });

    test("375: azienda e sede, niente logo né pagina", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        await page.setViewportSize({ width: 375, height: 800 });
        await page.goto(`${paths[0]}/comande`);
        await expect(sedeSwitcher(page)).toBeVisible({ timeout: 15_000 });
        await expect(banner(page).getByRole("button", { name: /^Azienda:/ })).toBeVisible();
        await expect(banner(page).getByRole("link", { name: /CataloGlobe/ })).toBeHidden();
        await expect(banner(page).getByText("Comande", { exact: true })).toBeHidden();
        // La sede resta intera, l'azienda si accorcia: niente scroll orizzontale.
        const sede = (await sedeSwitcher(page).boundingBox())!;
        expect(sede.x + sede.width).toBeLessThanOrEqual(375);
        const azienda = (await banner(page).getByRole("button", { name: /^Azienda:/ }).boundingBox())!;
        expect(azienda.x + azienda.width).toBeLessThanOrEqual(sede.x);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    });

    test("nessun selettore di scope «Sede attiva» nell'header", async ({ page }) => {
        const paths = await locationPaths(page);
        for (const p of ["analytics", "reviews", "scheduling"]) {
            await page.goto(`${businessRoot(paths[0])}/${p}`);
            await expect(sedeSwitcher(page)).toBeVisible({ timeout: 15_000 });
            await expect(banner(page).getByRole("button", { name: "Sede attiva" })).toHaveCount(0);
        }
    });
});

test.describe("Atterraggio (§51.6) e indirizzi (§51.14)", () => {
    test("owner con una sede: l'azienda apre la Panoramica", async ({ page }) => {
        const paths = await locationPaths(page);
        await asSingleSede(page);
        await page.goto(businessRoot(paths[0]));
        await expect(page).toHaveURL(/\/overview$/, { timeout: 15_000 });
    });

    test("manager di una sede: l'azienda apre la Panoramica", async ({ page }) => {
        const paths = await locationPaths(page);
        await asRole(page, "manager", activityIdOf(paths[0]), "pro");
        await page.goto(businessRoot(paths[0]));
        await expect(page).toHaveURL(/\/overview$/, { timeout: 15_000 });
    });

    test("staff con più sedi: l'azienda apre Sedi, entrando si arriva a Servizio", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        await asRole(page, "staff", [activityIdOf(paths[0]), activityIdOf(paths[1])], "pro");
        await page.goto(businessRoot(paths[0]));
        await expect(page).toHaveURL(/\/locations$/, { timeout: 15_000 });
        await page.goto(paths[1]);
        await expect(page).toHaveURL(`${paths[1]}/servizio`, { timeout: 15_000 });
    });

    test("owner con più sedi: entrare in una sede porta alla Scheda", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        await page.goto(paths[1]);
        await expect(page).toHaveURL(`${paths[1]}/anagrafica`, { timeout: 15_000 });
    });

    test("/locations con una sede porta alla sua Scheda", async ({ page }) => {
        const paths = await locationPaths(page);
        await asSingleSede(page);
        await page.goto(`${businessRoot(paths[0])}/locations`);
        await expect(page).toHaveURL(`${paths[0]}/anagrafica`, { timeout: 15_000 });
    });

    test("/reservations porta dentro una sede", async ({ page }) => {
        const paths = await locationPaths(page);
        await page.goto(`${businessRoot(paths[0])}/reservations`);
        await expect(page).toHaveURL(/\/locations\/[0-9a-f-]+\/prenotazioni$|\/locations$/, { timeout: 15_000 });
    });

    test("il logo porta all'ingresso dell'azienda", async ({ page }) => {
        const paths = await locationPaths(page);
        await page.goto(`${businessRoot(paths[0])}/products`);
        await expect(page.getByRole("banner").getByRole("link", { name: /CataloGlobe/ })).toHaveAttribute(
            "href",
            businessRoot(paths[0])
        );
    });
});

test.describe("Impostazioni con tab (§51.12)", () => {
    /** Le tab della testata: Azienda · Team · Abbonamento (Membri · Inviti stanno nel corpo). */
    const settingsTabs = (page: Page) =>
        page.getByRole("tab", { name: /^(Azienda|Team|Abbonamento)$/ });

    test("tre tab che navigano; Membri · Inviti dentro Team", async ({ page }) => {
        const paths = await locationPaths(page);
        const root = businessRoot(paths[0]);
        await page.goto(`${root}/settings`);
        await expect(settingsTabs(page)).toHaveText(["Azienda", "Team", "Abbonamento"], { timeout: 15_000 });
        await expect(page.getByRole("tab", { name: "Azienda" })).toHaveAttribute("aria-selected", "true");

        await page.getByRole("tab", { name: "Team" }).click();
        await expect(page).toHaveURL(`${root}/settings/team`);
        const main = page.getByRole("main");
        await expect(main.getByRole("tab", { name: "Membri" })).toBeVisible({ timeout: 15_000 });
        await expect(main.getByRole("tab", { name: /^Inviti in attesa/ })).toBeVisible();
        // In cima al corpo, sopra la tabella: non si prendono l'altezza della pagina.
        const membri = (await main.getByRole("tab", { name: "Membri" }).boundingBox())!;
        const table = (await main.getByRole("table").first().boundingBox())!;
        expect(membri.y).toBeLessThan(table.y);
        expect(table.y - (membri.y + membri.height)).toBeLessThan(80);
        await expect(nav(page).getByRole("link", { name: "Impostazioni", exact: true })).toHaveAttribute(
            "aria-current",
            "page"
        );

        await page.getByRole("tab", { name: "Abbonamento" }).click();
        await expect(page).toHaveURL(`${root}/settings/abbonamento`);
        await expect(page).toHaveTitle(/^Abbonamento — /);
    });

    test("/team e /subscription portano alle tab, con query e ancora", async ({ page }) => {
        const paths = await locationPaths(page);
        const root = businessRoot(paths[0]);
        await page.goto(`${root}/team`);
        await expect(page).toHaveURL(`${root}/settings/team`, { timeout: 15_000 });
        await page.goto(`${root}/subscription?prova=1#utilizzo-ai`);
        await expect(page).toHaveURL(`${root}/settings/abbonamento?prova=1#utilizzo-ai`, { timeout: 15_000 });
    });

    test("manager: Azienda e Team, niente Abbonamento", async ({ page }) => {
        const paths = await locationPaths(page);
        await asRole(page, "manager", activityIdOf(paths[0]), "pro");
        await page.goto(`${businessRoot(paths[0])}/settings`);
        await expect(settingsTabs(page)).toHaveText(["Azienda", "Team"], { timeout: 15_000 });
    });

    test("staff: una tab sola, nessuna fila di tab", async ({ page }) => {
        const paths = await locationPaths(page);
        await asRole(page, "staff", activityIdOf(paths[0]), "pro");
        await page.goto(`${businessRoot(paths[0])}/settings`);
        await expect(nav(page).getByRole("link", { name: "Impostazioni", exact: true })).toBeVisible({ timeout: 15_000 });
        await expect(settingsTabs(page)).toHaveCount(0);
    });
});

test.describe("Andamento a due livelli (§51.10)", () => {
    /** Il `p_activity_id` della prima lettura del riepilogo di Analitiche. */
    function overviewActivity(page: Page): Promise<string | null> {
        return page
            .waitForRequest(r => r.url().includes("/rpc/analytics_overview_stats"), { timeout: 20_000 })
            .then(r => (r.postDataJSON() as { p_activity_id: string | null }).p_activity_id);
    }

    /** Le sedi chieste dall'elenco delle recensioni (`activity_id=in.(…)`). */
    function reviewsActivities(page: Page): Promise<string[]> {
        return page
            .waitForRequest(r => /\/rest\/v1\/reviews\?/.test(r.url()) && r.method() === "GET" && r.url().includes("activity_id=in."), {
                timeout: 20_000
            })
            .then(r => {
                const value = new URL(r.url()).searchParams.get("activity_id") ?? "";
                return value.replace(/^in\.\(|\)$/g, "").split(",").map(s => s.replace(/"/g, "")).filter(Boolean);
            });
    }

    test("dentro la sede: Analitiche e Recensioni di quella sede", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        const id = activityIdOf(paths[1]);

        const analytics = overviewActivity(page);
        await page.goto(`${paths[1]}/analitiche`);
        expect(await analytics).toBe(id);
        await expect(nav(page).getByRole("link", { name: "Analitiche", exact: true })).toHaveAttribute("aria-current", "page");

        const reviews = reviewsActivities(page);
        await page.goto(`${paths[1]}/recensioni`);
        expect(await reviews).toEqual([id]);
    });

    test("in azienda: il totale delle sedi leggibili, senza selettore", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        const root = businessRoot(paths[0]);

        const analytics = overviewActivity(page);
        await page.goto(`${root}/analytics`);
        expect(await analytics).toBeNull();

        const reviews = reviewsActivities(page);
        await page.goto(`${root}/reviews`);
        expect((await reviews).length).toBeGreaterThanOrEqual(2);
        await expect(page.getByRole("button", { name: "Sede attiva" })).toHaveCount(0);
    });

    test("una sede: /analytics e /reviews portano alle rotte della sede, con la query", async ({ page }) => {
        const paths = await locationPaths(page);
        await asSingleSede(page);
        const root = businessRoot(paths[0]);
        await page.goto(`${root}/analytics?period=7d`);
        await expect(page).toHaveURL(`${paths[0]}/analitiche?period=7d`, { timeout: 15_000 });
        await page.goto(`${root}/reviews`);
        await expect(page).toHaveURL(`${paths[0]}/recensioni`, { timeout: 15_000 });
    });

    test("staff dentro la sede: Recensioni sì, Analitiche no (gate sulla sede)", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        await asRole(page, "staff", [activityIdOf(paths[0]), activityIdOf(paths[1])], "pro");
        await page.goto(`${paths[1]}/servizio`);
        await expect(nav(page).getByRole("link", { name: "Recensioni", exact: true })).toBeVisible({ timeout: 15_000 });
        await expect(nav(page).getByRole("link", { name: "Analitiche", exact: true })).toHaveCount(0);
    });
});

test.describe("Programmazione: il filtro sede nella pagina (§51.11)", () => {
    const sedeFilter = (page: Page) => page.getByRole("main").getByRole("combobox", { name: "Sede" });

    test("dalla pagina: scegliere una sede la mette nell'indirizzo; «Tutte le sedi» la toglie", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        const root = businessRoot(paths[0]);
        const id = activityIdOf(paths[1]);
        await page.goto(`${root}/scheduling`);
        await expect(sedeFilter(page)).toHaveValue("", { timeout: 15_000 });
        await sedeFilter(page).selectOption(id);
        await expect(page).toHaveURL(`${root}/scheduling?sede=${id}`);
        await sedeFilter(page).selectOption("");
        await expect(page).toHaveURL(`${root}/scheduling`);
    });

    test("da «Cosa vedono i clienti»: Programmazione si apre filtrata sulla sede", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        const id = activityIdOf(paths[1]);
        await page.goto(`${paths[1]}/cosa-vedono`);
        await expect(page.getByRole("main").getByRole("table").first()).toBeVisible({ timeout: 15_000 });
        // Il link compare solo quando c'è qualcosa da sistemare in Programmazione:
        // se c'è, porta già filtrato sulla sede.
        const link = page.getByRole("main").getByRole("link", { name: "Vai a Programmazione" });
        if ((await link.count()) > 0) {
            await expect(link.first()).toHaveAttribute("href", `${businessRoot(paths[1])}/scheduling?sede=${id}`);
        }
        await page.goto(`${businessRoot(paths[1])}/scheduling?sede=${id}`);
        await expect(sedeFilter(page)).toHaveValue(id, { timeout: 15_000 });
        // Fuori dal contesto sede: la sidebar è quella dell'azienda.
        await expect(nav(page).getByRole("link", { name: "Sedi", exact: true })).toBeVisible();
    });

    test("una sede: niente filtro", async ({ page }) => {
        const paths = await locationPaths(page);
        await asSingleSede(page);
        await page.goto(`${businessRoot(paths[0])}/scheduling`);
        await expect(nav(page).getByRole("link", { name: "Programmazione", exact: true })).toHaveAttribute(
            "aria-current",
            "page",
            { timeout: 15_000 }
        );
        await expect(sedeFilter(page)).toHaveCount(0);
    });
});
