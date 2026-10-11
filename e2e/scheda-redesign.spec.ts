import { expect, test } from "@playwright/test";
import { SLUG, stubPublicPage } from "./publicPageStub";

/**
 * Scheda prodotto nel foglio unico del redesign (spec §6), senza ordine al
 * tavolo: blocchi nell'ordine della spec, prezzi «12,00 €», regola nel titolo
 * del gruppo, «Mostra tutti» oltre cinque voci, «Perfetto con» a spinta con
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
        "Aggiunte · fino a 3 · facoltativa",
        "Dettagli",
        "Ingredienti",
        "Caratteristiche e allergeni",
        "Perfetto con"
    ]);
    await expect(dialog.getByText("16,00\u00a0€")).toBeVisible();
    // Cinque aggiunte a vista; la prima è senza sovrapprezzo e non dice «+0».
    await expect(dialog.getByText("+1,50\u00a0€")).toHaveCount(4);
    await expect(dialog.getByText("Per allergie o intolleranze chiedi al personale.")).toBeVisible();

    const showAll = dialog.getByRole("button", { name: "Mostra tutti (7)" });
    await expect(showAll).toHaveCount(2);
    await showAll.first().click();
    await expect(dialog.getByText("Aggiunta 7")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Mostra tutti (7)" })).toHaveCount(1);

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
});
