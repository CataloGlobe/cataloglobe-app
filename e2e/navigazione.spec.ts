import { expect, test, type Page } from "@playwright/test";
import { asRole } from "./asRole";
import {
    activityIdOf,
    asSingleSede,
    brandLink,
    businessRoot,
    closeSections,
    confrontaSwitcher,
    locationPaths,
    menuRows,
    nav,
    openSection,
    sectionPanel,
    sectionRow,
    sedePicker,
    sedeSwitcher,
    sidebarLink,
    sidebarShape,
    sidebarVoci,
    withLongNames
} from "./nav";

/**
 * Navigazione dell'Officina (artifact «Navigazione di CataloGlobe» v4, D143;
 * sedi in alto a destra, D152): la stessa sidebar fuori e dentro una sede,
 * «Sede» e «Confronta con» accanto alle notifiche. Locator per ruolo, nessuna
 * scrittura; una sede sola si ottiene riducendo l'elenco delle sedi in
 * pagina, i ruoli con `asRole`.
 */

/** Un nome di sede dentro una RegExp. */
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Le sezioni (D143): uguali in azienda e dentro una sede.
const MENU_VETRINA = ["Menù e vetrina", ["Menù", "Prodotti", "Stili", "In evidenza", "Storie"]] as [string, string[]];
const CALENDARIO = ["Calendario", ["Calendario", "Regole"]] as [string, string[]];
const SERVIZIO = ["Servizio", ["In servizio", "Cosa vedono i clienti", "Sala", "Storico"]] as [string, string[]];
const NUMERI = ["Clienti e numeri", ["Andamento", "Recensioni", "Clienti"]] as [string, string[]];
const SEZIONI = ["Panoramica", MENU_VETRINA, CALENDARIO, SERVIZIO, NUMERI];
const ACCOUNT = ["Impostazioni", "Team", "Abbonamento", "Lingue", "Assistenza"];

/** Il pulsante dell'account in fondo alla sidebar. */
const accountButton = (page: Page) => page.getByRole("button", { name: /^Account:/ });

/** Le voci del menù dell'account prima del divisore (le pagine dell'azienda). */
async function accountPages(page: Page): Promise<string[]> {
    // Finché la sidebar carica il menù dell'account è vuoto: si aspettano le voci.
    await expect(menuRows(page).first()).toBeVisible({ timeout: 15_000 });
    await accountButton(page).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const items = await menu.evaluate(el => {
        const out: string[] = [];
        for (const child of Array.from(el.children)) {
            if (child.getAttribute("role") === "separator" && out.length > 0) break;
            if (child.getAttribute("role") === "menuitem") {
                out.push((child.textContent ?? "").trim().replace(/\s*\d+\+?$/, ""));
            }
        }
        return out;
    });
    await page.keyboard.press("Escape");
    return items;
}

/** Il nome della sede dalla sua pagina: la parte «locale» della Scheda lo ha nel campo «Nome del locale». */
async function sedeName(page: Page, path: string): Promise<string> {
    await page.goto(`${path}/anagrafica?parte=locale`);
    const field = page.getByRole("textbox", { name: /Nome del locale/ });
    await expect(field).not.toHaveValue("", { timeout: 15_000 });
    return field.inputValue();
}

test.describe("Sidebar (artifact v4, D143)", () => {
    test("più sedi, in azienda: Panoramica, le sezioni, Sedi; l'account in fondo", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        await page.goto(`${businessRoot(paths[0])}/products`);
        await expect.poll(() => sidebarShape(page), { timeout: 15_000 }).toEqual([...SEZIONI, "Sedi"]);
        // Su Prodotti il pulsante dell'account non è «dove sono».
        await expect(accountButton(page)).not.toHaveAttribute("aria-current", "page");
        expect(await accountPages(page)).toEqual(ACCOUNT);
        await expect(nav(page).getByRole("separator")).toHaveCount(0);
        const voci = await sidebarVoci(page);
        for (const voce of ["Ordini", "Analitiche", "Programmazione", ...ACCOUNT]) expect(voci).not.toContain(voce);
    });

    test("dentro una sede: la stessa sidebar, senza «← Tutte le sedi»", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        await page.goto(`${paths[0]}/anagrafica`);
        await expect.poll(() => sidebarShape(page), { timeout: 15_000 }).toEqual([...SEZIONI, "Sedi"]);
        // L'account è dell'azienda: lo stesso menù anche dentro la sede.
        expect(await accountPages(page)).toEqual(ACCOUNT);
        // Si esce dalla sede col selettore in alto, non con un ritorno in testa al menu.
        await expect(page.getByRole("navigation", { name: "Contesto" })).toHaveCount(0);
        await expect(page.getByRole("link", { name: /Tutte le sedi/ })).toHaveCount(0);
    });

    test("dentro la sede le voci portano alle rotte della sede; Clienti resta dell'azienda", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        const root = businessRoot(paths[0]);
        await page.goto(`${paths[0]}/anagrafica`);
        await expect(await sidebarLink(page, "In servizio")).toHaveAttribute("href", `${paths[0]}/servizio`);
        await expect(await sidebarLink(page, "Regole")).toHaveAttribute("href", `${paths[0]}/programmazione`);
        await expect(await sidebarLink(page, "Andamento")).toHaveAttribute("href", `${paths[0]}/analitiche`);
        await expect(await sidebarLink(page, "Recensioni")).toHaveAttribute("href", `${paths[0]}/recensioni`);
        await expect(await sidebarLink(page, "Clienti")).toHaveAttribute("href", `${root}/guests`);
    });

    test("una sede: «Il locale» al posto di Sedi, e porta alla sua Scheda", async ({ page }) => {
        const paths = await locationPaths(page);
        await asSingleSede(page);
        await page.goto(`${businessRoot(paths[0])}/products`);
        await expect.poll(() => sidebarShape(page), { timeout: 15_000 }).toEqual([...SEZIONI, "Il locale"]);
        expect(await accountPages(page)).toEqual(ACCOUNT);
        await expect(menuRows(page).getByRole("link", { name: "Il locale", exact: true })).toHaveAttribute(
            "href",
            `${paths[0]}/anagrafica`
        );
    });

    test("una sede: dentro la sede la sidebar resta quella, Comande accende «In servizio»", async ({ page }) => {
        const paths = await locationPaths(page);
        await asSingleSede(page);
        await page.goto(`${paths[0]}/comande`);
        await expect(menuRows(page).getByRole("link", { name: "Il locale", exact: true })).toBeVisible({ timeout: 15_000 });
        // La sezione della pagina è aperta e la parte accesa sotto la riga.
        await expect(sectionRow(page, SERVIZIO[0])).toHaveAttribute("aria-expanded", "true");
        await expect(await sidebarLink(page, "In servizio")).toHaveAttribute("aria-current", "page");
    });

    test("staff di una sede: Servizio sì, né Calendario né Andamento; Clienti e numeri sono le Recensioni", async ({ page }) => {
        const paths = await locationPaths(page);
        await asRole(page, "staff", activityIdOf(paths[0]), "pro");
        await page.goto(`${paths[0]}/servizio`);
        await expect(sectionRow(page, SERVIZIO[0])).toBeVisible({ timeout: 15_000 });
        const voci = await sidebarVoci(page);
        for (const voce of SERVIZIO[1]) expect(voci).toContain(voce);
        for (const voce of ["Calendario", "Regole", "Andamento", "Sedi"]) expect(voci).not.toContain(voce);
        // Una pagina sola nella sezione: la riga porta lì col nome della sezione.
        await expect(menuRows(page).getByRole("link", { name: NUMERI[0], exact: true })).toHaveAttribute(
            "href",
            `${paths[0]}/recensioni`
        );
    });

    test("manager di una sede su più: sidebar di una sede, con il Calendario", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        await asRole(page, "manager", activityIdOf(paths[0]), "pro");
        await page.goto(`${businessRoot(paths[0])}/scheduling`);
        await expect(await sidebarLink(page, "Regole")).toHaveAttribute("aria-current", "page");
        await expect(menuRows(page).getByRole("link", { name: "Il locale", exact: true })).toHaveAttribute(
            "href",
            `${paths[0]}/anagrafica`
        );
        expect(await sidebarVoci(page)).not.toContain("Sedi");
    });

    test("aperta, si apre solo la sezione della pagina; il clic su una sezione porta alla sua ultima parte", async ({ page }) => {
        const paths = await locationPaths(page);
        await page.goto(`${businessRoot(paths[0])}/styles`);
        const menu = sectionRow(page, MENU_VETRINA[0]);
        const calendario = sectionRow(page, CALENDARIO[0]);
        await expect(menu).toHaveAttribute("aria-expanded", "true", { timeout: 15_000 });
        await expect(sectionPanel(page, MENU_VETRINA[0]).locator('a[aria-current="page"]')).toHaveText(/Stili/);
        await expect(calendario).toHaveAttribute("aria-expanded", "false");
        // Un'altra sezione: si va alla sua parte, si apre lei e si chiude quella di prima.
        await calendario.click();
        await expect(page).toHaveURL(/\/scheduling/, { timeout: 15_000 });
        await expect(calendario).toHaveAttribute("aria-expanded", "true");
        await expect(sectionPanel(page, MENU_VETRINA[0])).toHaveCount(0);
        // Tornando, Menù e vetrina riparte da dove si era: Stili.
        await menu.click();
        await expect(page).toHaveURL(/\/styles$/, { timeout: 15_000 });
        // Nessun pannello sopra la pagina, da aperta.
        await expect(page.locator("body > [role='group']")).toHaveCount(0);
    });

    test("chiusa, la sezione apre il pannello senza cambiare pagina; Esc torna alla riga", async ({ page }) => {
        const paths = await locationPaths(page);
        await page.goto(`${businessRoot(paths[0])}/products`);
        const url = page.url();
        const row = sectionRow(page, MENU_VETRINA[0]);
        await expect(row).toBeVisible({ timeout: 15_000 });
        const collapse = page.getByRole("button", { name: "Comprimi menù laterale" });
        if (await collapse.isVisible()) await collapse.click();
        await expect(page.getByRole("button", { name: "Espandi menù laterale" })).toBeVisible();
        await row.click();
        await expect(sectionPanel(page, MENU_VETRINA[0])).toBeVisible();
        await expect(row).toHaveAttribute("aria-expanded", "true");
        expect(page.url()).toBe(url);
        // Da tastiera: Esc chiude e il fuoco resta sulla riga.
        await page.keyboard.press("Escape");
        await expect(sectionPanel(page, MENU_VETRINA[0])).toHaveCount(0);
        await expect(row).toBeFocused();
        // Invio riapre e porta sulla prima voce del pannello.
        await page.keyboard.press("Enter");
        await expect(sectionPanel(page, MENU_VETRINA[0]).getByRole("link").first()).toBeFocused();
        // Una voce del pannello porta alla sua pagina e chiude il pannello.
        await sectionPanel(page, MENU_VETRINA[0]).getByRole("link", { name: "Stili", exact: true }).click();
        await expect(page).toHaveURL(/\/styles$/, { timeout: 15_000 });
        await expect(sectionPanel(page, MENU_VETRINA[0])).toHaveCount(0);
        await page.getByRole("button", { name: "Espandi menù laterale" }).click();
    });
});

test.describe("Aspetto della sidebar (§51.15)", () => {
    /** La sidebar desktop: l'`aside` che contiene il menu. */
    const aside = (page: Page) => page.locator("aside").filter({ has: nav(page) });

    async function ensureOpen(page: Page): Promise<void> {
        const expand = page.getByRole("button", { name: "Espandi menù laterale" });
        if (await expand.isVisible()) await expand.click();
        await expect(page.getByRole("button", { name: "Comprimi menù laterale" })).toBeVisible();
        await expect.poll(async () => (await aside(page).boundingBox())?.width).toBe(232);
    }

    /** La y delle righe del menu, dall'alto: aperta e chiusa devono coincidere. */
    async function rowTops(page: Page): Promise<number[]> {
        return menuRows(page).evaluateAll(rows =>
            rows.map(r => Math.round((r.querySelector("a, button") ?? r).getBoundingClientRect().top))
        );
    }

    test("aperta 232, chiusa 64: righe alla stessa distanza, il pannello con le parti della sezione", async ({ page }) => {
        const paths = await locationPaths(page);
        // Sulla Panoramica nessuna sezione è aperta: si misurano le righe sole.
        await page.goto(`${businessRoot(paths[0])}/overview`);
        await expect(sectionRow(page, SERVIZIO[0])).toBeVisible({ timeout: 15_000 });
        await ensureOpen(page);
        await expect(menuRows(page).locator(':scope > button[aria-expanded="true"]')).toHaveCount(0);
        const open = await rowTops(page);
        await page.getByRole("button", { name: "Comprimi menù laterale" }).click();
        await expect.poll(async () => (await aside(page).boundingBox())?.width).toBe(64);
        const closed = await rowTops(page);

        // Chiusa la riga sta nei 64 meno i margini (64 − bordo − 2 × 11): il
        // testo è tagliato, non a vista.
        const widths = await menuRows(page).evaluateAll(rows =>
            rows.map(r => Math.round((r.querySelector("a, button") ?? r).getBoundingClientRect().width))
        );
        for (const w of widths) expect(w).toBeLessThanOrEqual(42);
        // Le righe restano alla stessa distanza fra loro.
        expect(closed.length).toBe(open.length);
        closed.forEach((y, i) => expect(Math.abs(y - closed[0] - (open[i] - open[0]))).toBeLessThanOrEqual(1));

        // Chiusa: al passaggio la sezione apre il pannello, con le sue parti.
        await sectionRow(page, SERVIZIO[0]).hover();
        await expect(sectionPanel(page, SERVIZIO[0])).toBeVisible();
        const voci = (await sectionPanel(page, SERVIZIO[0]).getByRole("link").allTextContents()).map(t => t.trim());
        expect(voci).toEqual(SERVIZIO[1]);
        await closeSections(page);
        await page.getByRole("button", { name: "Espandi menù laterale" }).click();
        await expect.poll(async () => (await aside(page).boundingBox())?.width).toBe(232);
    });

    test("righe 40, parti sotto la sezione 34; chiusa, il pannello a destra, almeno 208, come il nome di Panoramica", async ({ page }) => {
        const paths = await locationPaths(page);
        await page.goto(`${businessRoot(paths[0])}/products`);
        await ensureOpen(page);
        // Finché le sedi caricano la sidebar non ha righe: si misura dopo.
        await expect(sectionRow(page, MENU_VETRINA[0])).toBeVisible({ timeout: 15_000 });
        const rows = await menuRows(page).evaluateAll(items =>
            items.map(r => Math.round((r.querySelector("a, button") ?? r).getBoundingClientRect().height))
        );
        expect(new Set(rows)).toEqual(new Set([40]));

        // Aperta: le parti della sezione stanno dentro la sidebar, a 34.
        const list = await openSection(page, MENU_VETRINA[0]);
        const side = (await aside(page).boundingBox())!;
        const listBox = (await list.boundingBox())!;
        expect(listBox.x + listBox.width).toBeLessThanOrEqual(side.x + side.width);
        const sub = await list.getByRole("link").evaluateAll(links => links.map(l => Math.round(l.getBoundingClientRect().height)));
        expect(new Set(sub)).toEqual(new Set([34]));

        // Chiusa: il pannello a destra della sidebar.
        await page.getByRole("button", { name: "Comprimi menù laterale" }).click();
        await expect.poll(async () => (await aside(page).boundingBox())?.width).toBe(64);
        const panel = (await (await openSection(page, MENU_VETRINA[0])).boundingBox())!;
        const closedSide = (await aside(page).boundingBox())!;
        expect(panel.x).toBeGreaterThan(closedSide.x + closedSide.width);
        expect(panel.width).toBeGreaterThanOrEqual(208);
        await closeSections(page);

        // Chiusa, il nome di una voce diretta ha l'aspetto del pannello.
        await menuRows(page).getByRole("link", { name: "Panoramica", exact: true }).hover();
        // Il riquadro visibile del tooltip (il `role="tooltip"` di Radix è il testo nascosto).
        await expect(page.getByRole("tooltip")).toContainText("Panoramica");
        const label = (await page.locator("[data-radix-popper-content-wrapper]").last().boundingBox())!;
        expect(label.width).toBeGreaterThanOrEqual(208);
        await page.getByRole("button", { name: "Espandi menù laterale" }).click();
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

test.describe("Sede in alto a destra (D152)", () => {
    test("1440: niente testata né «Dove sei»; il logo sopra il menu, «Sede» accanto alle notifiche", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        await page.goto(`${paths[0]}/servizio`);
        await expect(sedeSwitcher(page)).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole("banner")).toHaveCount(0);
        await expect(page.getByRole("button", { name: /^Dove sei:/ })).toHaveCount(0);
        const logo = (await brandLink(page).boundingBox())!;
        const menu = (await nav(page).boundingBox())!;
        expect(logo.y + logo.height).toBeLessThanOrEqual(menu.y);
        // In alto a destra, sulla riga delle notifiche e prima di loro.
        const sede = (await sedeSwitcher(page).boundingBox())!;
        const notifiche = (await page.getByRole("button", { name: /^Notifiche/ }).boundingBox())!;
        expect(Math.abs(sede.y + sede.height / 2 - (notifiche.y + notifiche.height / 2))).toBeLessThanOrEqual(4);
        expect(sede.x + sede.width).toBeLessThanOrEqual(notifiche.x);
        expect(sede.x).toBeGreaterThan(menu.x + menu.width + 400);
    });

    test("per sezione: Menù e vetrina e Sedi niente; Servizio «Sede»; Clienti e numeri anche «Confronta con»", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        const root = businessRoot(paths[0]);
        await page.goto(`${paths[0]}/servizio`);
        await expect(sedeSwitcher(page)).toBeVisible({ timeout: 15_000 });
        await expect(confrontaSwitcher(page)).toHaveCount(0);
        await page.goto(`${paths[0]}/analitiche`);
        await expect(sedeSwitcher(page)).toBeVisible({ timeout: 15_000 });
        await expect(confrontaSwitcher(page)).toBeVisible();
        for (const p of ["products", "styles", "locations"]) {
            await page.goto(`${root}/${p}`);
            await expect(menuRows(page).first()).toBeVisible({ timeout: 15_000 });
            await expect(page.getByRole("button", { name: "Notifiche" })).toBeVisible();
            await expect(sedeSwitcher(page)).toHaveCount(0);
        }
    });

    test("Servizio: la scelta è una sede, senza «Tutte»; cambiare sede resta su Comande", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        const name = await sedeName(page, paths[1]);
        await page.goto(`${paths[0]}/comande`);
        await expect(sedeSwitcher(page)).toBeVisible({ timeout: 15_000 });
        const before = await sedeSwitcher(page).textContent();
        await sedeSwitcher(page).click();
        await expect(sedePicker(page)).toBeVisible();
        await expect(sedePicker(page).getByRole("radio", { name: /^Tutte le sedi/ })).toHaveCount(0);
        await sedePicker(page).getByRole("radio", { name: new RegExp(`^${escapeRe(name)}`) }).click();
        await expect(page).toHaveURL(`${paths[1]}/comande`, { timeout: 15_000 });
        await expect(sedeSwitcher(page)).toContainText(name);
        expect(await sedeSwitcher(page).textContent()).not.toBe(before);
    });

    test("Andamento: «Tutte le sedi» in azienda, una sede porta dentro la sede e torna fuori", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        const root = businessRoot(paths[0]);
        const name = await sedeName(page, paths[1]);
        await page.goto(`${root}/analytics`);
        await expect(sedeSwitcher(page)).toContainText("Tutte le sedi", { timeout: 15_000 });
        // Con «Tutte le sedi» il confronto non c'è (D152, E).
        await expect(confrontaSwitcher(page)).toHaveCount(0);
        await sedeSwitcher(page).click();
        await sedePicker(page).getByRole("radio", { name: new RegExp(`^${escapeRe(name)}`) }).click();
        await expect(page).toHaveURL(`${paths[1]}/analitiche`, { timeout: 15_000 });
        await expect(confrontaSwitcher(page)).toBeVisible();
        await sedeSwitcher(page).click();
        await sedePicker(page).getByRole("radio", { name: /^Tutte le sedi/ }).click();
        await expect(page).toHaveURL(`${root}/analytics`, { timeout: 15_000 });
    });

    test("una sede: niente «Sede», non c'è niente da scegliere", async ({ page }) => {
        const paths = await locationPaths(page);
        await asSingleSede(page);
        await page.goto(`${paths[0]}/servizio`);
        await expect(sectionRow(page, SERVIZIO[0])).toHaveAttribute("aria-expanded", "true", { timeout: 15_000 });
        await expect(page.getByRole("button", { name: "Notifiche" })).toBeVisible();
        await expect(sedeSwitcher(page)).toHaveCount(0);
    });

    test("375: il menu, le notifiche e «Sede» nello schermo, senza scroll orizzontale", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        await page.setViewportSize({ width: 375, height: 800 });
        await page.goto(`${paths[0]}/comande`);
        await expect(sedeSwitcher(page)).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole("banner").getByRole("button", { name: "Apri menù di navigazione" })).toBeVisible();
        // L'azienda si cambia dal menù dell'account, non dalla testata.
        await expect(page.getByRole("button", { name: /^Azienda:/ })).toHaveCount(0);
        const sede = (await sedeSwitcher(page).boundingBox())!;
        expect(sede.x + sede.width).toBeLessThanOrEqual(375);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    });

    test("375, nome di sede lungo: si accorcia «Sede», niente scroll orizzontale", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        await withLongNames(page, {
            azienda: "Ristorante Pizzeria Trattoria Al Vecchio Mulino di Montebello",
            sede: "Sede storica di Corso Vittorio Emanuele secondo angolo Piazza Duomo"
        });
        await page.setViewportSize({ width: 375, height: 800 });
        await page.goto(`${paths[0]}/comande`);
        await expect(sedeSwitcher(page)).toBeVisible({ timeout: 15_000 });
        const sede = (await sedeSwitcher(page).boundingBox())!;
        expect(sede.x).toBeGreaterThanOrEqual(0);
        expect(sede.x + sede.width).toBeLessThanOrEqual(375);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    });

    test("nessun selettore di scope «Sede attiva»", async ({ page }) => {
        const paths = await locationPaths(page);
        for (const p of ["analytics", "reviews", "scheduling"]) {
            await page.goto(`${businessRoot(paths[0])}/${p}`);
            await expect(menuRows(page).first()).toBeVisible({ timeout: 15_000 });
            await expect(page.getByRole("button", { name: "Sede attiva" })).toHaveCount(0);
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
            await page.goto(`${sede}/anagrafica?parte=locale`);
            // Dentro la sede, a sede caricata: la parte «locale» della Scheda ha il nome.
            await expect(page.getByRole("textbox", { name: /Nome del locale/ })).not.toHaveValue("", { timeout: 15_000 });
            // Il layout la ricorda quando l'elenco delle sedi è arrivato.
            await expect
                .poll(() => page.evaluate(() => window.localStorage.getItem("cataloglobe:orders:lastActivityId")))
                .toBe(activityIdOf(sede));
            await page.goto(`${root}/${legacy}`);
            await expect(page).toHaveURL(new RegExp(`${sede}/${segment}`), { timeout: 15_000 });
        }
    });

    test("il logo porta all'ingresso dell'azienda", async ({ page }) => {
        const paths = await locationPaths(page);
        await page.goto(`${businessRoot(paths[0])}/products`);
        await expect(brandLink(page)).toHaveAttribute("href", businessRoot(paths[0]), { timeout: 15_000 });
    });
});

test.describe("Impostazioni, Team e Abbonamento (§51.12, D170)", () => {
    /** Le tab che ripetevano il menù dell'account: non ci sono più (D170). */
    const settingsTabs = (page: Page) =>
        page.getByRole("tab", { name: /^(Azienda|Team|Abbonamento)$/ });

    test("voci del menù dell'account, senza tab che le ripetano; Membri · Inviti dentro Team", async ({ page }) => {
        const paths = await locationPaths(page);
        const root = businessRoot(paths[0]);
        await page.goto(`${root}/settings`);
        // Dove sono: Impostazioni è una voce del menù dell'account, il pulsante resta acceso.
        await expect(accountButton(page)).toHaveAttribute("aria-current", "page", { timeout: 15_000 });
        expect(await accountPages(page)).toEqual(ACCOUNT);
        await expect(settingsTabs(page)).toHaveCount(0);

        await page.goto(`${root}/settings/team`);
        await expect(page).toHaveTitle(/^Team · /, { timeout: 15_000 });
        await expect(accountButton(page)).toHaveAttribute("aria-current", "page");
        const main = page.getByRole("main");
        await expect(main.getByRole("radio", { name: /^Membri/ })).toBeVisible({ timeout: 15_000 });
        await expect(main.getByRole("radio", { name: /^Inviti in attesa/ })).toBeVisible();
        await expect(settingsTabs(page)).toHaveCount(0);
        // In cima al corpo, sopra la tabella: non si prendono l'altezza della pagina.
        const membri = (await main.getByRole("radio", { name: /^Membri/ }).boundingBox())!;
        const table = (await main.getByRole("table").first().boundingBox())!;
        expect(membri.y).toBeLessThan(table.y);
        expect(table.y - (membri.y + membri.height)).toBeLessThan(80);

        await page.goto(`${root}/settings/abbonamento`);
        await expect(page).toHaveTitle(/^Abbonamento · /, { timeout: 15_000 });
        await expect(settingsTabs(page)).toHaveCount(0);
    });

    test("/team e /subscription portano alle pagine nuove, con query e ancora", async ({ page }) => {
        const paths = await locationPaths(page);
        const root = businessRoot(paths[0]);
        await page.goto(`${root}/team`);
        await expect(page).toHaveURL(`${root}/settings/team`, { timeout: 15_000 });
        await page.goto(`${root}/subscription?prova=1#utilizzo-ai`);
        await expect(page).toHaveURL(`${root}/settings/abbonamento?prova=1#utilizzo-ai`, { timeout: 15_000 });
    });

    test("manager: Team sì, Abbonamento no", async ({ page }) => {
        const paths = await locationPaths(page);
        await asRole(page, "manager", activityIdOf(paths[0]), "pro");
        await page.goto(`${businessRoot(paths[0])}/settings`);
        await expect(accountButton(page)).toBeVisible({ timeout: 15_000 });
        const pages = await accountPages(page);
        expect(pages).toContain("Team");
        expect(pages).not.toContain("Abbonamento");
    });

    test("staff: Impostazioni, Lingue e Assistenza, nessuna fila di tab", async ({ page }) => {
        const paths = await locationPaths(page);
        await asRole(page, "staff", activityIdOf(paths[0]), "pro");
        await page.goto(`${businessRoot(paths[0])}/settings`);
        await expect(accountButton(page)).toBeVisible({ timeout: 15_000 });
        expect(await accountPages(page)).toEqual(["Impostazioni", "Lingue", "Assistenza"]);
        await expect(settingsTabs(page)).toHaveCount(0);
    });
});

test.describe("Clienti e numeri a due livelli (§51.10)", () => {
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

    test("dentro la sede: Andamento e Recensioni di quella sede", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        const id = activityIdOf(paths[1]);

        const analytics = overviewActivity(page);
        await page.goto(`${paths[1]}/analitiche`);
        expect(await analytics).toBe(id);
        await expect(await sidebarLink(page, "Andamento")).toHaveAttribute("aria-current", "page");

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

    test("staff dentro la sede: Recensioni sì, Andamento no (gate sulla sede)", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        await asRole(page, "staff", [activityIdOf(paths[0]), activityIdOf(paths[1])], "pro");
        await page.goto(`${paths[1]}/servizio`);
        // Una pagina sola nella sezione: la riga porta lì col nome della sezione.
        await expect(menuRows(page).getByRole("link", { name: NUMERI[0], exact: true })).toHaveAttribute(
            "href",
            `${paths[1]}/recensioni`,
            { timeout: 15_000 }
        );
        expect(await sidebarVoci(page)).not.toContain("Andamento");
    });
});

test.describe("Calendario e Regole: azienda e sede (T9b, D143)", () => {
    const sedeFilter = (page: Page) => page.getByRole("main").getByRole("combobox", { name: "Sede" });

    test("più sedi, in azienda: niente filtro sede; un vecchio link ?sede= porta alla sede", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        const root = businessRoot(paths[0]);
        const id = activityIdOf(paths[1]);
        await page.goto(`${root}/scheduling`);
        await expect(await sidebarLink(page, "Regole")).toHaveAttribute("aria-current", "page");
        await expect(sedeFilter(page)).toHaveCount(0);
        await page.goto(`${root}/scheduling?sede=${id}`);
        await expect(page).toHaveURL(`${paths[1]}/programmazione`, { timeout: 15_000 });
    });

    test("dentro la sede: Calendario e Regole portano alla Programmazione della sede", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        const name = await sedeName(page, paths[1]);
        await page.goto(`${paths[1]}/programmazione`);
        const regole = await sidebarLink(page, "Regole");
        await expect(regole).toHaveAttribute("aria-current", "page");
        await expect(regole).toHaveAttribute("href", `${paths[1]}/programmazione`);
        await expect(await sidebarLink(page, "Calendario")).toHaveAttribute("href", `${paths[1]}/programmazione?vista=calendario`);
        await expect(sedeFilter(page)).toHaveCount(0);
        // Di quale sede sono le regole: «Sede» in alto, senza confronto; «Tutte le sedi» torna alle Regole dell'azienda.
        await expect(sedeSwitcher(page)).toContainText(name);
        await expect(confrontaSwitcher(page)).toHaveCount(0);
        await sedeSwitcher(page).click();
        await sedePicker(page).getByRole("radio", { name: /^Tutte le sedi/ }).click();
        await expect(page).toHaveURL(`${businessRoot(paths[0])}/scheduling`, { timeout: 15_000 });
    });

    test("da «Cosa vedono i clienti» si va alla Programmazione della sede", async ({ page }) => {
        const paths = await locationPaths(page);
        test.skip(paths.length < 2, "serve più di una sede");
        await page.goto(`${paths[1]}/cosa-vedono`);
        await expect(page.getByRole("main").getByRole("table").first()).toBeVisible({ timeout: 15_000 });
        // Il link compare solo quando c'è qualcosa da sistemare in Programmazione.
        const link = page.getByRole("main").getByRole("link", { name: "Vai alle regole" });
        if ((await link.count()) > 0) {
            await expect(link.first()).toHaveAttribute("href", `${paths[1]}/programmazione`);
        }
    });

    test("una sede: niente filtro", async ({ page }) => {
        const paths = await locationPaths(page);
        await asSingleSede(page);
        await page.goto(`${businessRoot(paths[0])}/scheduling`);
        await expect(await sidebarLink(page, "Regole")).toHaveAttribute("aria-current", "page");
        await expect(sedeFilter(page)).toHaveCount(0);
    });
});
