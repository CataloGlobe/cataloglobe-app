import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { SLUG, featured, stubPublicPage } from "./publicPageStub";

const box = async (locator: Locator) => {
    const b = await locator.boundingBox();
    if (!b) throw new Error("elemento senza riquadro");
    return b;
};

/**
 * Isola desktop del redesign (spec §13, mockup v38): estesa su due righe, col
 * campo di ricerca e «Filtri» nella prima e le sole categorie nella seconda;
 * scorrendo una riga sola con la lente. La Storia si apre dal ⋯.
 *
 * Solo col redesign acceso: `VITE_PUBLIC_REDESIGN=true bash scripts/e2e.sh
 * e2e/desktop-redesign.spec.ts`; senza il flag la spec si salta da sola.
 */

test.use({ viewport: { width: 1440, height: 900 }, storageState: { cookies: [], origins: [] } });
test.skip(process.env.VITE_PUBLIC_REDESIGN !== "true", "solo con VITE_PUBLIC_REDESIGN=true");

test.beforeEach(async ({ page }) => {
    await stubPublicPage(page, { ordering: false, allergens: true, venueInfo: true, story: true });
    await page.goto(`/${SLUG}`);
    await page.getByText("Antipasti 1", { exact: true }).waitFor();
    test.skip((await page.getByRole("button", { name: "Altre opzioni" }).count()) === 0, "pagina senza redesign");
});

test("isola estesa: campo di ricerca, «Filtri», pagine e categorie in seconda riga", async ({ page }) => {
    const field = page.getByRole("button", { name: "Cerca un piatto o un ingrediente" });
    await expect(field).toBeVisible();
    // Da estesa il campo prende il posto della lente.
    await expect(page.getByRole("button", { name: /^Cerca nel catalogo/ })).toBeHidden();
    // Menu e Storia non stanno nell'isola: su desktop la Storia si apre dal ⋯.
    await expect(page.locator("#pub-island").getByRole("tab")).toHaveCount(0);
    const categories = page.getByRole("navigation", { name: "Categorie" });
    await expect(categories.getByRole("button", { name: "Antipasti" })).toHaveAttribute("aria-current", "true");

    await field.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("searchbox")).toBeFocused();
    // A tendina: 8 px sotto l'isola, larga e allineata come il campo.
    const island = await box(page.locator("#pub-island"));
    const fieldBox = await box(page.locator("#pub-search-field"));
    await expect.poll(async () => Math.round((await box(dialog)).y - (island.y + island.height))).toBe(8);
    await expect.poll(async () => Math.abs(Math.round((await box(dialog)).x - fieldBox.x))).toBe(0);
    await expect.poll(async () => Math.abs(Math.round((await box(dialog)).width - fieldBox.width))).toBe(0);
    await dialog.getByRole("button", { name: "Annulla" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(field).toBeFocused();

    await page.getByRole("button", { name: "Filtri", exact: true }).click();
    await expect(dialog.getByRole("heading", { name: "Filtri" })).toBeVisible();
    await dialog.getByRole("button", { name: /Glutine/ }).click();
    await dialog.getByRole("button", { name: /^Mostra/ }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Filtri · 1" })).toBeVisible();
});

test("una categoria porta alla sua sezione e l'isola resta su una riga, con la lente", async ({ page }) => {
    const categories = page.getByRole("navigation", { name: "Categorie" });
    await categories.getByRole("button", { name: "Secondi" }).click();

    await expect(categories.getByRole("button", { name: "Secondi" })).toHaveAttribute("aria-current", "true");
    await expect
        .poll(() => page.getByRole("heading", { name: "Secondi", exact: true }).evaluate(el => el.getBoundingClientRect().top))
        .toBeLessThan(140);
    await expect(page.getByRole("button", { name: /^Cerca nel catalogo/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cerca un piatto o un ingrediente" })).toBeHidden();

    // Da compatta la ricerca si apre sotto l'isola, sul bordo destro.
    await page.getByRole("button", { name: /^Cerca nel catalogo/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("searchbox")).toBeFocused();
    const island = await box(page.locator("#pub-island"));
    await expect.poll(async () => Math.round((await box(dialog)).y - (island.y + island.height))).toBe(8);
    await expect
        .poll(async () => {
            const panel = await box(dialog);
            return Math.abs(Math.round(island.x + island.width - 12 - (panel.x + panel.width)));
        })
        .toBe(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    await categories.getByRole("button", { name: "Tutte le categorie" }).click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Categorie" })).toBeVisible();
});

test("la Storia si apre dal ⋯, e dal ⋯ si torna al menu", async ({ page }) => {
    const more = page.getByRole("button", { name: "Altre opzioni" });
    const dialog = page.getByRole("dialog");
    await more.click();
    await dialog.getByRole("button", { name: /La nostra storia/ }).click();
    await expect(dialog).toHaveCount(0);
    // In Storia la seconda riga non c'è.
    await expect(page.getByRole("navigation", { name: "Categorie" })).toHaveCount(0);

    await more.click();
    await dialog.getByRole("button", { name: /Torna al menu/ }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Categorie" }).getByRole("button", { name: "Antipasti" })).toBeVisible();
});

test("⋯ e lingua si aprono come popover sotto il loro pulsante", async ({ page }) => {
    for (const trigger of [
        page.getByRole("button", { name: "Altre opzioni" }),
        page.getByRole("button", { name: "Seleziona lingua" })
    ]) {
        // Da tastiera: WebKit non dà il fuoco a un pulsante cliccato, e il fuoco deve tornare lì.
        await trigger.focus();
        await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        const button = await box(trigger);
        await expect.poll(async () => Math.round((await box(dialog)).y - (button.y + button.height))).toBe(8);
        await expect
            .poll(async () => {
                const panel = await box(dialog);
                return Math.abs(Math.round(panel.x + panel.width - (button.x + button.width)));
            })
            .toBe(0);
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
    }
});

test("carosello in evidenza: tre card per vista, frecce solo dove c'è altro", async ({ page }) => {
    const blocks = Array.from({ length: 5 }, (_, i) => featured({ id: `f-${i}`, title: `Evento ${i + 1}` }));
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await stubPublicPage(page, { ordering: false, featured: { before_catalog: blocks } });
    await page.goto(`/${SLUG}`);
    const list = page.getByRole("list", { name: "In evidenza" });
    await expect(list).toBeVisible();
    const prev = page.getByRole("button", { name: "Contenuti precedenti" });
    const next = page.getByRole("button", { name: "Contenuti successivi" });
    await expect(prev).toHaveCount(0);
    await expect(next).toBeVisible();
    const track = await box(list);
    const first = await box(list.getByRole("listitem").first());
    expect(Math.round((track.width - 24) / 3)).toBe(Math.round(first.width));
    await next.click();
    await expect(prev).toBeVisible();
    await expect(next).toHaveCount(0);
    await expect(list.getByRole("listitem").filter({ hasText: "Evento 5" })).toBeInViewport();
});
