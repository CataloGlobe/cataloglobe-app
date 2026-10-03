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

/** Il selettore di sede nell'header (§51.7). */
export function sedeSwitcher(page: Page): Locator {
    return page.getByRole("banner").getByRole("button", { name: /^Sede:/ });
}

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

/** Gruppi e voci della sidebar come si leggono: `[titolo | null, voci]`. */
export async function sidebarShape(page: Page): Promise<Array<[string | null, string[]]>> {
    const sidebar = nav(page);
    await expect(sidebar.getByRole("link").first()).toBeVisible({ timeout: 15_000 });
    return sidebar.getByRole("group").evaluateAll(groups =>
        groups.map(g => [
            g.getAttribute("aria-label"),
            // Il testo della voce senza il contatore in coda (badge «3», «99+»).
            [...g.querySelectorAll("a")].map(a => (a.textContent ?? "").trim().replace(/\s*\d+\+?$/, ""))
        ]) as Array<[string | null, string[]]>
    );
}
