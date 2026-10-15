import { expect, test, type Page } from "@playwright/test";
import { SLUG, stubPublicPage } from "./publicPageStub";

/**
 * Pagina Storia del redesign (spec §15, mockup v38): cappello del locale col testo
 * che si apre, «Approfondimenti» a schede grandi (fino a tre storie) o a lista (da
 * quattro), lettore che entra da destra, errore con «Riprova». Stub senza login.
 *
 * Solo col redesign acceso: `VITE_PUBLIC_REDESIGN=true bash scripts/e2e.sh
 * e2e/storia-redesign.spec.ts`; senza il flag la spec si salta da sola.
 */

test.use({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } });
test.skip(process.env.VITE_PUBLIC_REDESIGN !== "true", "solo con VITE_PUBLIC_REDESIGN=true");

const CAPPELLO = {
    cover: null,
    title: "Da noi, dal 1962",
    intro: Array.from({ length: 4 }, (_, i) => `Paragrafo ${i + 1}: la cucina di casa, il forno a legna e le ricette di famiglia.`).join("\n\n"),
    website: "https://esempio.it"
};

const card = (i: number) => ({
    id: `story-${i}`,
    eyebrow: "Tradizione",
    title: `Storia numero ${i}`,
    cover_media: null,
    excerpt: "Un racconto breve.",
    product: null
});

/** Elenco della Storia sopra quello dello stub; il dettaglio resta allo stub. */
async function routeList(page: Page, list: () => { status: number; body?: unknown }) {
    await page.route("**/functions/v1/resolve-public-story**", route => {
        if ((route.request().postDataJSON() as { story_id?: string } | null)?.story_id) return route.fallback();
        const { status, body } = list();
        return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body ?? { error: "x" }) });
    });
}

async function openStoria(page: Page) {
    await page.goto(`/${SLUG}`);
    await page.getByText("Antipasti 1", { exact: true }).waitFor();
    test.skip((await page.getByRole("button", { name: "Altre opzioni" }).count()) === 0, "pagina senza redesign");
    await page.getByRole("navigation", { name: "Navigazione", exact: true }).getByRole("button", { name: "Storia" }).click();
}

test("cappello col testo che si apre, una storia a scheda grande, lettore e piatto", async ({ page }) => {
    await stubPublicPage(page, { ordering: false, story: true });
    await routeList(page, () => ({
        status: 200,
        body: {
            cappello: CAPPELLO,
            stories: [{ ...card(1), id: "story-1", title: "La pasta della nonna", product: { id: "prod-1-0", name: "Primi 1" } }]
        }
    }));
    await openStoria(page);

    await expect(page.getByRole("heading", { name: "Da noi, dal 1962" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Visita il sito" })).toHaveAttribute("href", "https://esempio.it/");
    const more = page.getByRole("button", { name: "Continua a leggere" });
    await more.click();
    await expect(page.getByRole("button", { name: "Mostra meno" })).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText(/^Paragrafo 4/)).toBeInViewport();

    await expect(page.getByRole("heading", { name: "Approfondimenti" })).toBeVisible();
    await expect(page.getByText("1 storia", { exact: true })).toBeVisible();
    const story = page.getByRole("button", { name: /La pasta della nonna/ });
    await expect(story).toContainText("Si abbina a: Primi 1");

    // Lettore: fuoco su «‹», Escape chiude e il fuoco torna alla scheda.
    await story.click();
    const reader = page.getByRole("dialog", { name: "La pasta della nonna" });
    await expect(reader).toBeVisible();
    await expect(reader.getByRole("button", { name: "Torna alla Storia" })).toBeFocused();
    await expect(reader.getByText(/1 min di lettura · /)).toBeVisible();
    await expect(reader.getByText("Il grano", { exact: true })).toBeVisible();
    // Finestra modale: Shift+Tab da «‹» resta nel lettore, non va sulla pagina dietro.
    await page.keyboard.press("Shift+Tab");
    expect(await reader.evaluate(el => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(reader).toHaveCount(0);
    await expect(story).toBeFocused();

    // «Da provare con questa storia» chiude il lettore e apre la scheda nel menu.
    await story.click();
    await reader.getByRole("button", { name: /Da provare con questa storia/ }).click();
    await expect(page.getByRole("dialog", { name: "Primi 1" })).toBeVisible();
    await expect(reader).toHaveCount(0);
});

test("da quattro storie la lista, senza cappello", async ({ page }) => {
    await stubPublicPage(page, { ordering: false, story: true });
    await routeList(page, () => ({ status: 200, body: { cappello: null, stories: [1, 2, 3, 4].map(card) } }));
    await openStoria(page);

    await expect(page.getByText("4 storie", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Tradizione: Storia numero/ })).toHaveCount(4);
    await expect(page.getByText("Si abbina a", { exact: false })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Continua a leggere" })).toHaveCount(0);
});

test("errore di lettura: messaggio e «Riprova» che rilegge", async ({ page }) => {
    await stubPublicPage(page, { ordering: false, story: true });
    let fail = true;
    await routeList(page, () => (fail ? { status: 500 } : { status: 200, body: { cappello: null, stories: [card(1)] } }));
    await openStoria(page);

    await expect(page.getByText("Non riusciamo a caricare le storie")).toBeVisible();
    await expect(page.getByText(/il menu resta disponibile/)).toBeVisible();
    fail = false;
    await page.getByRole("button", { name: "Riprova" }).click();
    await expect(page.getByRole("button", { name: /Storia numero 1/ })).toBeVisible();
    await expect(page.getByText("Non riusciamo a caricare le storie")).toHaveCount(0);
});
