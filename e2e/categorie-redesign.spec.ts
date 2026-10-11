import { expect, test } from "@playwright/test";
import { SLUG, stubPublicPage } from "./publicPageStub";

/**
 * Foglio «Categorie» nel redesign della pagina pubblica (spec §4): Menu toccato
 * di nuovo nella capsula apre l'elenco a riquadri nel foglio unico; il tocco su
 * una categoria chiude il foglio e porta alla sezione. Stub senza login.
 *
 * Solo col redesign acceso: `VITE_PUBLIC_REDESIGN=true bash scripts/e2e.sh
 * e2e/categorie-redesign.spec.ts`; senza il flag la spec si salta da sola.
 */

test.use({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } });
test.skip(process.env.VITE_PUBLIC_REDESIGN !== "true", "solo con VITE_PUBLIC_REDESIGN=true");

test.beforeEach(async ({ page }) => {
    // La capsula Menu · Storia c'è solo con la Storia.
    await stubPublicPage(page, { ordering: false, story: true });
    await page.goto(`/${SLUG}`);
    await page.getByText("Antipasti 1", { exact: true }).waitFor();
    test.skip((await page.getByRole("button", { name: "Altre opzioni" }).count()) === 0, "pagina senza redesign");
});

test("Menu toccato di nuovo apre le categorie, una categoria porta alla sua sezione", async ({ page }) => {
    const menu = page.getByRole("navigation", { name: "Navigazione", exact: true }).getByRole("button", {
        name: "Menu. Tocca di nuovo per tutte le categorie"
    });
    await menu.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Categorie" })).toBeVisible();
    const elenco = dialog.getByRole("navigation", { name: "Categorie" });
    await expect(elenco.getByRole("button")).toHaveText([/Antipasti\s*8/, /Primi\s*8/, /Secondi\s*8/, /Dolci\s*8/]);
    await expect(elenco.getByRole("button", { name: /Antipasti/ })).toHaveAttribute("aria-current", "location");

    await elenco.getByRole("button", { name: /Dolci/ }).click();
    await expect(dialog).toHaveCount(0);
    // La sezione arriva in cima, sotto l'isola e le pill.
    await expect
        .poll(() => page.getByRole("heading", { name: "Dolci" }).first().evaluate(el => el.getBoundingClientRect().top))
        .toBeLessThan(300);
});
