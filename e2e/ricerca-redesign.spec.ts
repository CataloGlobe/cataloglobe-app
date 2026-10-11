import { expect, test } from "@playwright/test";
import { SLUG, stubPublicPage } from "./publicPageStub";

/**
 * Ricerca e Filtri nel foglio unico del redesign (spec §4): la lente apre «Cerca»
 * col campo già attivo; i risultati evidenziano il testo trovato e il tocco porta
 * al piatto; la ricerca fatta torna fra le recenti; «Filtri» si spinge dalla
 * ricerca e dal ⋯, filtra dal vivo e accende il pallino della lente. Stub senza login.
 *
 * Solo col redesign acceso: `VITE_PUBLIC_REDESIGN=true bash scripts/e2e.sh
 * e2e/ricerca-redesign.spec.ts`; senza il flag la spec si salta da sola.
 */

test.use({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } });
test.skip(process.env.VITE_PUBLIC_REDESIGN !== "true", "solo con VITE_PUBLIC_REDESIGN=true");

test.beforeEach(async ({ page }) => {
    await stubPublicPage(page, { ordering: false, allergens: true });
    await page.goto(`/${SLUG}`);
    await page.getByText("Antipasti 1", { exact: true }).waitFor();
    test.skip((await page.getByRole("button", { name: "Altre opzioni" }).count()) === 0, "pagina senza redesign");
});

test("la lente apre «Cerca», un risultato porta al piatto e resta fra le recenti", async ({ page }) => {
    const lens = page.getByRole("button", { name: /^Cerca nel catalogo/ });
    await lens.click();

    const dialog = page.getByRole("dialog");
    const input = dialog.getByRole("searchbox");
    await expect(input).toBeFocused();
    await expect(dialog.getByRole("heading", { name: "Categorie" })).toBeVisible();

    await input.fill("zzz");
    await expect(dialog.getByRole("status")).toHaveText("Nessun risultato per «zzz»");

    await input.fill("dolci 7");
    await expect(dialog.getByText("1 risultato")).toBeVisible();
    await expect(dialog.locator("mark")).toHaveText(["Dolci 7"]);

    await dialog.getByRole("button", { name: /Dolci 7/ }).click();
    await expect(dialog).toHaveCount(0);
    await expect
        .poll(() => page.getByText("Dolci 7", { exact: true }).evaluate(el => el.getBoundingClientRect().top))
        .toBeLessThan(400);

    await lens.click();
    await expect(dialog.getByRole("heading", { name: "Recenti" })).toBeVisible();
    await dialog.getByRole("button", { name: "dolci 7" }).click();
    await expect(input).toHaveValue("dolci 7");
    await dialog.getByRole("button", { name: "Annulla" }).click();
    await expect(dialog).toHaveCount(0);
    // Il fuoco torna alla lente, non al campo invisibile che ha fatto salire la tastiera.
    await expect(lens).toBeFocused();
});

test("«Filtri» dalla ricerca filtra dal vivo e accende il pallino della lente", async ({ page }) => {
    await page.getByRole("button", { name: /^Cerca nel catalogo/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /^Filtri/ }).click();

    await expect(dialog.getByRole("heading", { name: "Filtri" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Torna a Cerca" })).toBeVisible();
    const show = dialog.getByRole("button", { name: /^Mostra/ });
    await expect(show).toHaveText("Mostra 32 piatti");

    await dialog.getByRole("button", { name: /Glutine/ }).click();
    await expect(show).toHaveText("Mostra 20 piatti");

    await show.click();
    await expect(dialog.getByRole("searchbox")).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^Filtri/ })).toContainText("1 filtro attivo");

    await dialog.getByRole("button", { name: "Annulla" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cerca nel catalogo, 1 filtro attivo" })).toBeVisible();
});

test("«Filtri» dal ⋯ si spinge con «‹ Opzioni» e «Azzera» toglie i filtri", async ({ page }) => {
    await page.getByRole("button", { name: "Altre opzioni" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /Filtri/ }).click();

    await expect(dialog.getByRole("heading", { name: "Filtri" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Torna a Opzioni" })).toBeVisible();
    const reset = dialog.getByRole("button", { name: "Azzera" });
    await expect(reset).toBeDisabled();

    await dialog.getByRole("button", { name: /Latte/ }).click();
    await expect(reset).toBeEnabled();
    await reset.click();
    await expect(dialog.getByRole("button", { name: /^Mostra/ })).toHaveText("Mostra 32 piatti");

    // Dal ⋯, «Mostra N piatti» porta ai piatti: il foglio si chiude, non torna al ⋯.
    await dialog.getByRole("button", { name: /^Mostra/ }).click();
    await expect(dialog).toHaveCount(0);
});

test("le preferenze tengono solo i piatti che le portano; «Senza glutine» è l'allergene Glutine", async ({ page }) => {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await stubPublicPage(page, { ordering: false, allergens: true, preferences: true });
    await page.goto(`/${SLUG}`);
    await page.getByText("Antipasti 1", { exact: true }).waitFor();

    await page.getByRole("button", { name: "Altre opzioni" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /Filtri/ }).click();
    const prefs = dialog.getByRole("region", { name: "Preferenze" });
    await expect(prefs.getByRole("button")).toHaveText(["Vegetariano", "Vegano", "Senza glutine", "Piccante"]);
    const show = dialog.getByRole("button", { name: /^Mostra/ });

    // Vegetariano conta anche i vegani; Piccante insieme non lascia nulla.
    await prefs.getByRole("button", { name: "Vegetariano" }).click();
    await expect(show).toHaveText("Mostra 16 piatti");
    await prefs.getByRole("button", { name: "Piccante" }).click();
    await expect(show).toHaveText("Mostra 0 piatti");
    await prefs.getByRole("button", { name: "Vegetariano" }).click();
    await expect(show).toHaveText("Mostra 4 piatti");

    // «Senza glutine» e «Glutine» si accendono insieme.
    await prefs.getByRole("button", { name: "Piccante" }).click();
    await prefs.getByRole("button", { name: "Senza glutine" }).click();
    await expect(dialog.getByRole("button", { name: "Glutine", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(show).toHaveText("Mostra 20 piatti");

    await prefs.getByRole("button", { name: "Vegano" }).click();
    await expect(show).toHaveText("Mostra 4 piatti");
    await show.click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cerca nel catalogo, 2 filtri attivi" })).toBeVisible();
    await expect(page.getByText("Antipasti 5", { exact: true })).toBeVisible();
    await expect(page.getByText("Antipasti 1", { exact: true })).toHaveCount(0);

    // «Mostra tutto» toglie anche le preferenze.
    await page.getByRole("button", { name: "Mostra tutto" }).click();
    await expect(page.getByText("Antipasti 1", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cerca nel catalogo" })).toBeVisible();
});

test("con preferenze e senza allergeni i Filtri si aprono dal ⋯ e dalla ricerca", async ({ page }) => {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await stubPublicPage(page, { ordering: false, preferences: true });
    await page.goto(`/${SLUG}`);
    await page.getByText("Antipasti 1", { exact: true }).waitFor();
    const dialog = page.getByRole("dialog");

    await page.getByRole("button", { name: "Altre opzioni" }).first().click();
    await dialog.getByRole("button", { name: /Filtri/ }).click();
    await expect(dialog.getByRole("region", { name: "Preferenze" }).getByRole("button")).toHaveText(["Vegetariano", "Vegano", "Piccante"]);
    await dialog.getByRole("button", { name: "Chiudi" }).click();
    await expect(dialog).toHaveCount(0);

    await page.getByRole("button", { name: /^Cerca nel catalogo/ }).click();
    await dialog.getByRole("button", { name: /^Filtri/ }).click();
    await expect(dialog.getByRole("heading", { name: "Filtri" })).toBeVisible();
});
