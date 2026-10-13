import { expect, test } from "@playwright/test";
import { SLUG, stubPublicPage } from "./publicPageStub";

/**
 * Scheda prodotto nel foglio unico del redesign (spec §6), senza ordine al
 * tavolo: nome e prezzo in testata, blocchi nell'ordine del mockup v38, prezzi
 * «12,00 €», regola nel titolo del gruppo, «Mostra tutti» oltre cinque voci,
 * ingredienti in testo (D70), «Perfetto con» a spinta con
 * «‹ Nome», link diretto `?prodotto=`. Stub senza login.
 *
 * Solo col redesign acceso: `VITE_PUBLIC_REDESIGN=true bash scripts/e2e.sh
 * e2e/scheda-redesign.spec.ts`; senza il flag la spec si salta da sola.
 */

test.use({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } });
test.skip(process.env.VITE_PUBLIC_REDESIGN !== "true", "solo con VITE_PUBLIC_REDESIGN=true");

test.beforeEach(async ({ page }) => {
    await stubPublicPage(page, { ordering: false, details: true, allergens: true });
});

test("il piatto apre la scheda: blocchi, prezzi, regola, «Mostra tutti» e «Perfetto con»", async ({ page }) => {
    await page.goto(`/${SLUG}`);
    await page.getByText("Antipasti 1", { exact: true }).waitFor();
    test.skip((await page.getByRole("button", { name: "Altre opzioni" }).count()) === 0, "pagina senza redesign");

    await page.getByText("Primi 1", { exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Primi 1" });
    await expect(dialog).toBeVisible();

    await expect(dialog.locator("h3")).toHaveText([
        "Formato",
        "Aggiunte · fino a 3 · facoltativa",
        "Dettagli",
        "Ingredienti",
        "Caratteristiche",
        "Allergeni",
        "Perfetto con"
    ]);
    // Nome in testata, fermo mentre il corpo scorre; coi formati i prezzi stanno nel riquadro (mockup v38).
    await expect(dialog.getByRole("heading", { level: 2, name: "Primi 1" })).toBeVisible();
    await expect(dialog.getByText("16,00\u00a0€")).toBeVisible();
    // Ingredienti in testo con le virgole, tutti a vista (D70).
    await expect(dialog.getByText("Ingrediente 1, Ingrediente 2, Ingrediente 3, Ingrediente 4, Ingrediente 5, Ingrediente 6, Ingrediente 7")).toBeVisible();
    // Cinque aggiunte a vista; la prima è senza sovrapprezzo e non dice «+0».
    await expect(dialog.getByText("+1,50\u00a0€")).toHaveCount(4);
    await expect(dialog.getByText("Per allergie o intolleranze chiedi al personale.")).toBeVisible();

    const showAll = dialog.getByRole("button", { name: "Mostra tutti (7)" });
    await expect(showAll).toHaveCount(1);
    await showAll.click();
    await expect(dialog.getByText("Aggiunta 7")).toBeVisible();
    // Il pulsante sparisce: il fuoco passa alla prima voce comparsa, non al body.
    await expect(dialog.getByRole("listitem").filter({ hasText: "Aggiunta 6" })).toBeFocused();
    await expect(showAll).toHaveCount(0);

    await dialog.getByRole("button", { name: /Dolci 2/ }).click();
    const back = page.getByRole("button", { name: "Torna a Primi 1" });
    await expect(back).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Dolci 2" })).toBeVisible();
    await back.click();
    await expect(page.getByRole("dialog", { name: "Primi 1" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("`?prodotto=` apre la pagina con la scheda già sul prodotto", async ({ page }) => {
    await page.goto(`/${SLUG}?prodotto=prod-2-3`);
    await page.getByText("Antipasti 1", { exact: true }).waitFor();
    test.skip((await page.getByRole("button", { name: "Altre opzioni" }).count()) === 0, "pagina senza redesign");

    const dialog = page.getByRole("dialog", { name: "Secondi 4" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("12,00\u00a0€")).toBeVisible();
    // Il parametro esce dall'indirizzo: ricaricare non riapre la scheda.
    await expect(page).not.toHaveURL(/prodotto=/);
});

test("«La storia» apre il lettore nel foglio con «‹ Nome», e tornando la scheda è dov'era", async ({ page }) => {
    await stubPublicPage(page, { ordering: false, details: true, allergens: true, story: true });
    await page.goto(`/${SLUG}`);
    await page.getByText("Antipasti 1", { exact: true }).waitFor();
    test.skip((await page.getByRole("button", { name: "Altre opzioni" }).count()) === 0, "pagina senza redesign");

    await page.getByText("Primi 1", { exact: true }).click();
    const dialog = page.getByRole("dialog");
    const storyRow = dialog.getByRole("button", { name: /La pasta della nonna/ });
    await storyRow.scrollIntoViewIfNeeded();
    const scrolledTo = await dialog.locator("[class*='page']").first().evaluate(el => el.scrollTop);
    expect(scrolledTo).toBeGreaterThan(0);

    await storyRow.click();
    await expect(page.getByRole("dialog", { name: "La pasta della nonna" })).toBeVisible();
    await expect(dialog.getByText("Tradizione", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Il grano", { exact: true })).toBeVisible();
    await expect(dialog.locator("strong", { hasText: "a mano" })).toBeVisible();
    // Il blocco Prodotto porta a «Dolci 2»; «Si abbina a» il piatto di partenza non c'è (fa già «‹»).
    await expect(dialog.getByRole("button", { name: /Dolci 2/ })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Si abbina a/ })).toHaveCount(0);

    await dialog.getByRole("button", { name: "Torna a Primi 1" }).click();
    await expect(page.getByRole("dialog", { name: "Primi 1" })).toBeVisible();
    await expect(storyRow).toBeInViewport();
    expect(await dialog.locator("[class*='page']").first().evaluate(el => el.scrollTop)).toBe(scrolledTo);

    // Dal racconto a un altro piatto, a spinta: solo «‹» (la madre non è un piatto, mockup v38).
    await storyRow.click();
    await dialog.getByRole("button", { name: /Dolci 2/ }).click();
    await expect(page.getByRole("dialog", { name: "Dolci 2" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Indietro" })).toBeVisible();
});
