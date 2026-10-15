import { expect, test } from "@playwright/test";
import { SLUG, stubPublicPage } from "./publicPageStub";

/**
 * Foglio «Categorie» nel redesign della pagina pubblica (spec §4): Menu toccato
 * di nuovo nella capsula apre l'elenco a riquadri nel foglio unico; il tocco su
 * una categoria chiude il foglio e porta alla sezione. Stub senza login.
 */

test.use({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } });

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

test("pill nell'isola: la ⌄ apre le sottocategorie, una porta alla sua sezione", async ({ page }) => {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await stubPublicPage(page, { ordering: false, subcategories: true });
    await page.goto(`/${SLUG}`);
    const island = page.locator("#pub-island");
    const pills = island.getByRole("navigation", { name: "Categorie" });
    await expect(pills.getByRole("button", { name: "Antipasti" })).toHaveAttribute("aria-current", "true");
    // La fila vecchia delle categorie sotto l'isola non c'è più.
    await expect(page.getByRole("navigation", { name: "Navigazione sezioni del catalogo" })).toBeHidden();
    // Niente Menu · Storia nell'isola: stanno nella barra in basso.
    await expect(island.getByRole("tab")).toHaveCount(0);

    // La ⌄ solo dove ci sono sottocategorie.
    await expect(pills.getByRole("button", { name: /^Sottocategorie di/ })).toHaveCount(1);
    const chevron = pills.getByRole("button", { name: "Sottocategorie di Primi" });
    await chevron.click();
    const menu = page.getByRole("menu", { name: "Primi" });
    await expect(menu.getByRole("menuitem")).toHaveText([/Pasta fresca\s*3/, /Risotti\s*3/]);
    await expect(menu.getByRole("menuitem").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(chevron).toBeFocused();

    // Da tastiera: col clic WebKit fa scorrere la pagina per portare la voce in vista, e il menu si chiude.
    await chevron.click();
    await expect(menu.getByRole("menuitem").first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: /Risotti/ })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(menu).toHaveCount(0);
    // La voce sparisce col menu: il fuoco torna alla sua ⌄, non cade sul body.
    await expect(chevron).toBeFocused();
    await expect
        .poll(() => page.getByRole("heading", { name: "Risotti" }).first().evaluate(el => el.getBoundingClientRect().top))
        .toBeLessThan(200);
    await expect(pills.getByRole("button", { name: "Primi", exact: true })).toHaveAttribute("aria-current", "true");

    // Compatta: resta la sola fila delle pill, dentro i 62 px in alto.
    await expect(island).toHaveAttribute("data-compact", "true");
    await expect
        .poll(async () => {
            const box = await pills.getByRole("button", { name: "Primi", exact: true }).boundingBox();
            return box ? Math.round(box.y + box.height) : 999;
        })
        .toBeLessThanOrEqual(62);
});

test("in Storia niente pill, e il ⋯ resta nell'isola", async ({ page }) => {
    // Sul telefono la Storia sta nella barra in basso: nel ⋯ non c'è.
    await page.getByRole("button", { name: "Altre opzioni" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Altro" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /La nostra storia/ })).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    await page.getByRole("navigation", { name: "Navigazione", exact: true }).getByRole("button", { name: "Storia" }).click();
    const island = page.locator("#pub-island");
    await expect(island.getByRole("navigation", { name: "Categorie" })).toHaveCount(0);
    await expect(island.getByRole("button", { name: "Altre opzioni" })).toBeVisible();
});
