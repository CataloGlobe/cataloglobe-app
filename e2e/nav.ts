import { expect, type Locator, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";

/**
 * Helper della navigazione v2 (§51): sidebar, header, atterraggio.
 * Nessuna scrittura: le sedi si leggono dalla griglia di Sedi (owner con più
 * sedi), una sede sola si ottiene riducendo l'elenco in pagina.
 */

export function nav(page: Page): Locator {
    return page.getByRole("navigation", { name: "Menu principale" });
}

/** L'intestazione del contesto di sede: «← Tutte le sedi». */
export function contextNav(page: Page): Locator {
    return page.getByRole("navigation", { name: "Contesto" });
}

/** Il selettore di sede nell'header: c'è solo sotto 768 (§51.7). */
export function sedeSwitcher(page: Page): Locator {
    return page.getByRole("banner").getByRole("button", { name: /^Sede:/ });
}

/** Azienda e sede in cima alla sidebar, sul desktop (Officina): «Dove sei: …». */
export function placeSwitcher(page: Page): Locator {
    return page.getByRole("button", { name: /^Dove sei:/ });
}

/** Il logo in cima alla sidebar, sul desktop: porta all'ingresso dell'azienda. */
export function brandLink(page: Page): Locator {
    return page.locator("aside").getByRole("link", { name: "CataloGlobe, vai all'inizio" });
}

/**
 * Le righe del menu (Officina, desktop): le voci dirette (Panoramica, Sedi) e
 * le sezioni, pulsanti che aprono il loro pannello a destra.
 */
export function menuRows(page: Page): Locator {
    return nav(page).locator("ul").first().locator(":scope > li");
}

/** La riga di una sezione: un pulsante, non porta a una pagina. */
export function sectionRow(page: Page, title: string): Locator {
    return menuRows(page).getByRole("button", { name: title, exact: true });
}

/** Il pannello di una sezione: sta fuori dalla sidebar, in fondo al documento. */
export function sectionPanel(page: Page, title: string): Locator {
    return page.locator("body > [role='group']").and(page.getByRole("group", { name: title, exact: true }));
}

/** Apre il pannello di una sezione col clic e lo ritorna. */
export async function openSection(page: Page, title: string): Promise<Locator> {
    const panel = sectionPanel(page, title);
    if (!(await panel.isVisible())) await sectionRow(page, title).click();
    await expect(panel).toBeVisible();
    return panel;
}

/** Chiude il pannello aperto: Esc dalla riga, il mouse lontano dalla sidebar. */
export async function closeSections(page: Page): Promise<void> {
    await page.keyboard.press("Escape");
    await page.mouse.move(900, 600);
    await expect(page.locator("body > [role='group']")).toHaveCount(0);
}

const cleanLabel = (text: string | null | undefined) => (text ?? "").trim().replace(/\s*\d+\+?$/, "");

/** I titoli delle sezioni, dall'alto. */
async function sectionTitles(page: Page): Promise<string[]> {
    return menuRows(page)
        .locator(":scope > button[aria-expanded]")
        .evaluateAll(buttons => buttons.map(b => (b.textContent ?? "").trim()));
}

/**
 * Una voce della sidebar, ovunque stia: diretta nel menu o nel pannello della
 * sua sezione (che resta aperto). Se non c'è, un locator senza risultati.
 */
export async function sidebarLink(page: Page, name: string | RegExp): Promise<Locator> {
    const exact = typeof name === "string";
    await expect(menuRows(page).first()).toBeVisible({ timeout: 15_000 });
    const direct = menuRows(page).getByRole("link", { name, exact });
    if ((await direct.count()) > 0) return direct;
    for (const title of await sectionTitles(page)) {
        const link = (await openSection(page, title)).getByRole("link", { name, exact });
        if ((await link.count()) > 0) return link;
    }
    await closeSections(page);
    return direct;
}

/** Una riga della sidebar come si legge: una voce diretta o `[sezione, voci del pannello]`. */
export type SidebarRow = string | [string, string[]];

/** Gli indirizzi delle sedi (owner, più sedi), nell'ordine della griglia. */
export async function locationPaths(page: Page): Promise<string[]> {
    await openBusinessPage(page, "locations", "Sedi");
    await page.getByRole("radio", { name: "Vista griglia" }).click();
    const cards = page.getByRole("main").getByRole("listitem");
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });
    const hrefs = await cards.locator("a").evaluateAll(links =>
        links.map(l => (l as HTMLAnchorElement).getAttribute("href") ?? "").filter(h => h.includes("/locations/"))
    );
    return [...new Set(hrefs.map(h => h.replace(/\/locations\/([^/?#]+).*$/, "/locations/$1")))];
}

/** `/business/:id` da un indirizzo di sede. */
export function businessRoot(locationPath: string): string {
    return locationPath.replace(/\/locations\/.*$/, "");
}

export function activityIdOf(locationPath: string): string {
    return locationPath.split("/").pop()!;
}

/**
 * L'elenco delle sedi ridotto alla prima: l'azienda, per chi guarda, ne ha
 * una sola. Le letture di una sede sola (oggetto, non elenco) passano.
 */
export async function asSingleSede(page: Page): Promise<void> {
    await page.route(/\/rest\/v1\/activities\?/, async route => {
        try {
            const response = await route.fetch();
            const text = await response.text();
            // HEAD e conteggi non hanno corpo: passano come sono.
            const body: unknown = text ? JSON.parse(text) : null;
            if (!Array.isArray(body)) {
                await route.fulfill({ response, body: text });
                return;
            }
            await route.fulfill({ response, json: body.slice(0, 1) });
        } catch {
            // Pagina chiusa a metà richiesta.
        }
    });
}

/**
 * Nomi lunghi in pagina, senza scrivere niente: riscrive `name` nelle letture
 * delle aziende (`user_tenants_view`) e, se `sede` c'è, delle sedi.
 */
export async function withLongNames(page: Page, names: { azienda: string; sede?: string }): Promise<void> {
    const rename = (pattern: RegExp, name: string) =>
        page.route(pattern, async route => {
            try {
                const response = await route.fetch();
                const text = await response.text();
                const body: unknown = text ? JSON.parse(text) : null;
                const json = Array.isArray(body)
                    ? body.map(row => ({ ...(row as object), name }))
                    : body && typeof body === "object" && "name" in body
                      ? { ...body, name }
                      : null;
                await route.fulfill(json ? { response, json } : { response, body: text });
            } catch {
                // Pagina chiusa a metà richiesta.
            }
        });
    await rename(/\/rest\/v1\/user_tenants_view\?/, names.azienda);
    if (names.sede) await rename(/\/rest\/v1\/activities\?/, names.sede);
}

/**
 * La sidebar come si legge: le voci dirette e, per ogni sezione, le voci del
 * suo pannello (aperto e richiuso). Senza il contatore in coda (badge «3», «99+»).
 */
export async function sidebarShape(page: Page): Promise<SidebarRow[]> {
    await expect(menuRows(page).first()).toBeVisible({ timeout: 15_000 });
    const rows = await menuRows(page).evaluateAll(items =>
        items.map(li => {
            const section = li.querySelector(":scope > button[aria-expanded]");
            return section ? { section: (section.textContent ?? "").trim() } : { link: li.textContent ?? "" };
        })
    );
    const shape: SidebarRow[] = [];
    for (const row of rows) {
        if ("link" in row) {
            shape.push(cleanLabel(row.link));
            continue;
        }
        const panel = await openSection(page, row.section);
        const voci = await panel.getByRole("link").allTextContents();
        shape.push([row.section, voci.map(cleanLabel)]);
    }
    if (rows.some(row => "section" in row)) await closeSections(page);
    return shape;
}

/** Tutte le voci della sidebar, dirette e nei pannelli, in fila. */
export async function sidebarVoci(page: Page): Promise<string[]> {
    return (await sidebarShape(page)).flatMap(row => (typeof row === "string" ? [row] : row[1]));
}

/**
 * La voce della pagina in cui sei: diretta nel menu o, se sta in una sezione,
 * nel suo pannello (la riga della sezione ha `aria-current="true"`).
 */
export async function currentVoce(page: Page): Promise<Locator> {
    await expect(menuRows(page).locator("[aria-current]")).toHaveCount(1, { timeout: 15_000 });
    const direct = menuRows(page).locator('a[aria-current="page"]');
    if ((await direct.count()) > 0) return direct;
    const title = ((await menuRows(page).locator("button[aria-current]").textContent()) ?? "").trim();
    return (await openSection(page, title)).locator('a[aria-current="page"]');
}
