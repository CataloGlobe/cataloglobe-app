import { expect, test } from "@playwright/test";
import { SLUG, stubPublicPage } from "./publicPageStub";

/**
 * Isola desktop del redesign (spec §13): estesa su due righe, col campo di
 * ricerca e «Filtri» dentro, pagine e categorie sotto; scorrendo una riga
 * sola con la lente. La barra delle categorie del telefono non c'è.
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
    await expect(page.getByRole("tab", { name: "Storia" })).toBeVisible();
    const categories = page.getByRole("navigation", { name: "Categorie" });
    await expect(categories.getByRole("button", { name: "Antipasti" })).toHaveAttribute("aria-current", "true");

    await field.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("searchbox")).toBeFocused();
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

    await categories.getByRole("button", { name: "Tutte le categorie" }).click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Categorie" })).toBeVisible();
});
