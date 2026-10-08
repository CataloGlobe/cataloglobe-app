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
    sidebarShape,
    withLongNames
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
/** Dentro una sede, con più sedi: anche la sua Programmazione (T9b, PG6). */
const IL_LOCALE_SEDE = ["Il locale", ["Scheda", "Cosa vedono i clienti", "Programmazione"]] as const;

/** Le voci del piede: quelle della nav fuori da ogni gruppo, in ordine. */
async function footerLinks(page: Page): Promise<string[]> {
    await expect(nav(page).getByRole("link").first()).toBeVisible({ timeout: 15_000 });
    return nav(page)
        .getByRole("link")
        .evaluateAll(links =>
            links.filter(l => !l.closest('[role="group"]')).map(l => (l.textContent ?? "").trim().replace(/\s*\d+\+?$/, ""))
        );
}

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
                ["Andamento", ["Analitiche", "Recensioni", "Clienti"]]
            ]);
        // Piede: Impostazioni · Assistenza, poi apri/chiudi; nessun separatore speciale.
        expect(await footerLinks(page)).toEqual(["Impostazioni", "Assistenza"]);
        await expect(nav(page).getByRole("separator")).toHaveCount(0);
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
            .toEqual([IL_LOCALE_SEDE, OPERATIVITA, ["Andamento", ["Analitiche", "Recensioni"]]]);
        // Il piede della sede: solo Assistenza (§51.5, Impostazioni è d'azienda).
        expect(await footerLinks(page)).toEqual(["Assistenza"]);
        await expect(nav(page).getByRole("link", { name: "Impostazioni", exact: true })).toHaveCount(0);
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
                ["Andamento", ["Analitiche", "Recensioni", "Clienti"]]
            ]);
        expect(await footerLinks(page)).toEqual(["Impostazioni", "Assistenza"]);
        await expect(nav(page).getByRole("separator")).toHaveCount(0);
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

    test("righe 36, titoli in uno slot di 36 col testo in basso: più spazio sopra che sotto", async ({ page }) => {
        const paths = await locationPaths(page);
        await page.goto(`${businessRoot(paths[0])}/products`);
        await ensureOpen(page);
        // Finché le sedi caricano la sidebar non ha voci: si misura dopo.
        await expect(nav(page).getByRole("link", { name: "Prodotti", exact: true })).toBeVisible({ timeout: 15_000 });
        const rows = await nav(page)
            .getByRole("link")
            .evaluateAll(links => links.map(l => Math.round(l.getBoundingClientRect().height)));
        expect(new Set(rows)).toEqual(new Set([36]));
        const group = nav(page).getByRole("group", { name: "Catalogo" });
        const title = group.getByText("Catalogo", { exact: true });
        expect(Math.round((await title.boundingBox())!.height)).toBe(36);
        // Il testo del titolo sta più vicino alle sue voci che a quelle sopra.
        const gaps = await title.evaluate(el => {
            const range = document.createRange();
            range.selectNodeContents(el);
            const text = range.getBoundingClientRect();
            const slot = el.getBoundingClientRect();
            return { above: text.top - slot.top, below: slot.bottom - text.bottom };
        });
        expect(gaps.above).toBeGreaterThan(gaps.below * 2);
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

    /** I box di azienda, sede e notifiche, nell'ordine in cui stanno. */
    async function headerBoxes(page: Page) {
        const box = async (name: RegExp) => (await banner(page).getByRole("button", { name }).boundingBox())!;
        return { azienda: await box(/^Azienda:/), sede: await box(/^Sede:/), notifiche: await box(/^Notifiche/) };
    }

    /**
     * Il nome è tagliato coi puntini: il testo è più largo del suo box. Si
     * misura il testo (Range), non `scrollWidth`: arrotonda, e i puntini
     * compaiono già con una frazione di pixel.
     */
    const isTruncated = (page: Page, name: RegExp, selector: string) =>
        banner(page)
            .getByRole("button", { name })
            .locator(selector)
            .first()
            .evaluate(el => {
                const range = document.createRange();
                range.selectNodeContents(el);
                return range.getBoundingClientRect().width - el.getBoundingClientRect().width > 0.01;
            });

    test("375, nomi lunghi: l'azienda scende al cerchio, poi si accorcia la sede (§51.8)", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        await withLongNames(page, {
            azienda: "Ristorante Pizzeria Trattoria Al Vecchio Mulino di Montebello",
            sede: "Sede storica di Corso Vittorio Emanuele secondo angolo Piazza Duomo"
        });
        await page.setViewportSize({ width: 375, height: 800 });
        await page.goto(`${paths[0]}/anagrafica`);
        await expect(sedeSwitcher(page)).toBeVisible({ timeout: 15_000 });
        const { azienda, sede, notifiche } = await headerBoxes(page);

        // L'azienda resta almeno il cerchio con le iniziali, intero.
        const cerchio = banner(page).getByRole("button", { name: /^Azienda:/ }).getByRole("img");
        const c = (await cerchio.boundingBox())!;
        expect(c.width).toBeGreaterThanOrEqual(24);
        expect(c.x).toBeGreaterThanOrEqual(azienda.x);
        expect(c.x + c.width).toBeLessThanOrEqual(azienda.x + azienda.width);

        // In riga senza sovrapporsi: azienda, sede, notifiche; niente scroll.
        expect(azienda.x + azienda.width).toBeLessThanOrEqual(sede.x);
        expect(sede.x + sede.width).toBeLessThanOrEqual(notifiche.x);
        expect(await isTruncated(page, /^Sede:/, "span")).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

        // Il cerchio apre ancora il menu delle aziende.
        await banner(page).getByRole("button", { name: /^Azienda:/ }).click();
        await expect(page.getByRole("menu").getByText("Le tue aziende")).toBeVisible();
    });

    test("375, azienda lunga e sede corta: la sede resta intera, il menu nello schermo (§51.8)", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        await withLongNames(page, {
            azienda: "Ristorante Pizzeria Trattoria Al Vecchio Mulino di Montebello",
            sede: "Centro"
        });
        await page.setViewportSize({ width: 375, height: 800 });
        await page.goto(`${paths[0]}/anagrafica`);
        await expect(sedeSwitcher(page)).toBeVisible({ timeout: 15_000 });
        const { azienda, sede, notifiche } = await headerBoxes(page);
        expect(azienda.x + azienda.width).toBeLessThanOrEqual(sede.x);
        expect(sede.x + sede.width).toBeLessThanOrEqual(notifiche.x);
        expect(await isTruncated(page, /^Sede:/, "span")).toBe(false);
        expect(await isTruncated(page, /^Azienda:/, "span:nth-child(2)")).toBe(true);

        // In azienda: «Tutte le sedi» intera, l'azienda si accorcia.
        await page.goto(`${businessRoot(paths[0])}/products`);
        await expect(sedeSwitcher(page)).toHaveAccessibleName("Sede: Tutte le sedi", { timeout: 15_000 });
        expect(await isTruncated(page, /^Sede:/, "span")).toBe(false);
        expect(await isTruncated(page, /^Azienda:/, "span:nth-child(2)")).toBe(true);

        // Il menu delle aziende resta nello schermo.
        await banner(page).getByRole("button", { name: /^Azienda:/ }).click();
        const menu = (await page.getByRole("menu").boundingBox())!;
        expect(menu.x + menu.width).toBeLessThanOrEqual(375);
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

    test("/orders e /reservations tornano all'ultima sede in cui si è entrati (§51.9)", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        const root = businessRoot(paths[0]);
        await page.evaluate(() => window.localStorage.removeItem("cataloglobe:orders:lastActivityId"));
        // Due sedi in ordine inverso: almeno una non è la prima dell'elenco,
        // quindi il ritorno non può venire dal default.
        for (const [sede, legacy, segment] of [
            [paths[1], "orders", "comande"],
            [paths[0], "reservations", "prenotazioni"]
        ] as const) {
            await page.goto(`${sede}/anagrafica`);
            await expect(sedeSwitcher(page)).toBeVisible({ timeout: 15_000 });
            await page.goto(`${root}/${legacy}`);
            await expect(page).toHaveURL(new RegExp(`${sede}/${segment}`), { timeout: 15_000 });
        }
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
        await expect(main.getByRole("radio", { name: /^Membri/ })).toBeVisible({ timeout: 15_000 });
        await expect(main.getByRole("radio", { name: /^Inviti in attesa/ })).toBeVisible();
        // In cima al corpo, sopra la tabella: non si prendono l'altezza della pagina.
        const membri = (await main.getByRole("radio", { name: /^Membri/ }).boundingBox())!;
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

test.describe("Programmazione: azienda e sede (T9b, supera §51.11)", () => {
    const sedeFilter = (page: Page) => page.getByRole("main").getByRole("combobox", { name: "Sede" });

    test("più sedi, in azienda: niente filtro sede; un vecchio link ?sede= porta alla sede", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        const root = businessRoot(paths[0]);
        const id = activityIdOf(paths[1]);
        await page.goto(`${root}/scheduling`);
        await expect(nav(page).getByRole("link", { name: "Programmazione", exact: true })).toHaveAttribute("aria-current", "page", {
            timeout: 15_000
        });
        await expect(sedeFilter(page)).toHaveCount(0);
        await page.goto(`${root}/scheduling?sede=${id}`);
        await expect(page).toHaveURL(`${paths[1]}/programmazione`, { timeout: 15_000 });
    });

    test("dentro la sede: Programmazione è una voce della sede, dopo «Cosa vedono i clienti»", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        await page.goto(`${paths[1]}/programmazione`);
        const item = nav(page).getByRole("link", { name: "Programmazione", exact: true });
        await expect(item).toHaveAttribute("aria-current", "page", { timeout: 15_000 });
        await expect(item).toHaveAttribute("href", `${paths[1]}/programmazione`);
        const labels = (await nav(page).getByRole("link").allTextContents()).map(text => text.trim());
        expect(labels.indexOf("Programmazione")).toBe(labels.indexOf("Cosa vedono i clienti") + 1);
        await expect(sedeFilter(page)).toHaveCount(0);
        // Dentro la sede la sidebar è quella della sede.
        await expect(nav(page).getByRole("link", { name: "Sedi", exact: true })).toHaveCount(0);
    });

    test("da «Cosa vedono i clienti» si va alla Programmazione della sede", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        await page.goto(`${paths[1]}/cosa-vedono`);
        await expect(page.getByRole("main").getByRole("table").first()).toBeVisible({ timeout: 15_000 });
        // Il link compare solo quando c'è qualcosa da sistemare in Programmazione.
        const link = page.getByRole("main").getByRole("link", { name: "Vai a Programmazione" });
        if ((await link.count()) > 0) {
            await expect(link.first()).toHaveAttribute("href", `${paths[1]}/programmazione`);
        }
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
