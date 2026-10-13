import { expect, test, type Page } from "@playwright/test";
import { SLUG, stubPublicPage } from "./publicPageStub";

/**
 * Invito al voto nel redesign (PR 8b, spec §11): dopo la permanenza (20 s con
 * `?prova-voto=1`) e un ritorno in cima arriva la modale piccola, senza velo.
 * × = «no grazie»; ignorata vola nella barra come «Com'è andata?», poi «Vota»,
 * che riapre la modale; una stella fa crescere la modale nel modulo (mockup v38),
 * con le scelte rapide in testa al commento (D71). Pagina servita da stub, orologio finto.
 *
 * Solo col redesign acceso: `VITE_PUBLIC_REDESIGN=true bash scripts/e2e.sh
 * e2e/voto-invito-redesign.spec.ts`.
 */

test.use({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } });
test.skip(process.env.VITE_PUBLIC_REDESIGN !== "true", "solo con VITE_PUBLIC_REDESIGN=true");

test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date("2026-10-14T12:30:00+02:00") });
    await stubPublicPage(page, { ordering: false, venueInfo: true });
    await page.route("**/functions/v1/submit-review**", route =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) })
    );
    await page.goto(`/${SLUG}?prova-voto=1`);
    await page.getByText("Antipasti 1", { exact: true }).waitFor();
    test.skip((await page.getByRole("button", { name: "Altre opzioni" }).count()) === 0, "pagina senza redesign");
});

// Anche il blocco del fondo è una regione «Com'è andata?»: l'invito è quella con «No grazie».
const invite = (page: Page) =>
    page.getByRole("region", { name: "Com'è andata?" }).filter({ has: page.getByRole("button", { name: "No grazie" }) });

/**
 * Giù di qualche schermata e di nuovo in cima. WebKit consegna l'evento di
 * scorrimento al disegno dopo: si aspetta l'evento, poi si fa girare l'orologio.
 */
async function scrollDownAndBack(page: Page) {
    for (const y of [2400, 0]) {
        await page.evaluate(
            top =>
                new Promise<void>(resolve => {
                    window.addEventListener("scroll", () => resolve(), { once: true });
                    window.scrollTo(0, top);
                }),
            y
        );
        await page.clock.runFor(500);
    }
}

/** Permanenza passata, poi giù e di nuovo in cima. */
async function arriveInvite(page: Page) {
    await page.clock.runFor(21_000);
    await scrollDownAndBack(page);
    await expect(invite(page)).toBeVisible();
}

test("prima della permanenza tornare in cima non chiede niente", async ({ page }) => {
    await page.clock.runFor(5_000);
    await scrollDownAndBack(page);
    await expect(invite(page)).toHaveCount(0);
});

test("× è «no grazie»: la modale esce e non torna", async ({ page }) => {
    await arriveInvite(page);
    await invite(page).getByRole("button", { name: "No grazie" }).click();
    await expect(invite(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Vota|Com'è andata/ })).toHaveCount(0);

    await scrollDownAndBack(page);
    await expect(invite(page)).toHaveCount(0);
});

test("ignorata vola nella barra, si stringe, e dal pulsante si vota", async ({ page }) => {
    await arriveInvite(page);
    await page.clock.runFor(8_500);
    await expect(invite(page)).toHaveCount(0);
    const wide = page.getByRole("button", { name: "Com'è andata?" });
    await expect(wide).toBeVisible();
    await page.clock.runFor(5_000);
    const narrow = page.getByRole("button", { name: "Vota", exact: true });
    await expect(narrow).toBeVisible();

    // «Vota» riapre la modale piccola; ignorata di nuovo, torna stretto.
    await narrow.click();
    await expect(invite(page)).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(invite(page)).toHaveCount(0);
    await expect(narrow).toBeVisible();
});

test("una stella apre il modulo col voto; dopo l'invio il pulsante non c'è e il fondo ringrazia", async ({ page }) => {
    let sent: { rating?: number; comment?: string } = {};
    await page.route("**/functions/v1/submit-review**", route => {
        sent = route.request().postDataJSON();
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
    });
    await arriveInvite(page);
    await invite(page).getByRole("button", { name: "4 stelle" }).click();
    // La modale è cresciuta nel modulo: stessa domanda, il voto scritto sotto.
    const sheet = page.getByRole("dialog", { name: "Com'è andata?" });
    await expect(sheet.getByText("Molto bene · 4 su 5")).toBeVisible();
    await sheet.getByRole("button", { name: "Servizio" }).click();
    await sheet.getByRole("textbox", { name: /Vuoi aggiungere qualcosa/ }).fill("Tutto ottimo");
    await sheet.getByRole("button", { name: "Invia", exact: true }).click();
    await expect(sheet.getByRole("heading", { name: "Grazie!" })).toBeVisible();
    expect(sent).toMatchObject({ rating: 4, comment: "Servizio: Tutto ottimo" });
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^(Vota|Com'è andata\?)$/ })).toHaveCount(0);
    await expect(page.locator("footer", { hasText: "Fine del menu" }).getByRole("heading", { name: "Grazie, hai votato" })).toBeAttached();
});
