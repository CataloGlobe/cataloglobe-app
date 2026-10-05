import { expect, test, type Page } from "@playwright/test";

/**
 * Il form di contatto è nell'HTML prerenderizzato prima che il JS arrivi. Il
 * form non ha action: un invio nativo farebbe una GET su / con nome e telefono
 * nell'URL e perderebbe il contatto. Finché React non idrata il submit deve
 * essere disabilitato; dopo l'idratazione quello che il visitatore ha scritto
 * nel frattempo deve entrare nello stato del form e partire con l'invio.
 */

const JS_DELAY_MS = 2500;

async function delayLandingJs(page: Page) {
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    await page.route(/\/assets\/landing-[^/]*\.js$/, async (route) => {
        await Promise.race([released, new Promise((resolve) => setTimeout(resolve, JS_DELAY_MS))]);
        await route.fallback();
    });
    return release;
}

async function interceptLead(page: Page) {
    const leads: Record<string, unknown>[] = [];
    await page.route("**/functions/v1/submit-lead", async (route) => {
        leads.push(route.request().postDataJSON());
        await route.fulfill({ status: 200, contentType: "application/json", body: '{"success":true}' });
    });
    return leads;
}

function trackDocumentRequests(page: Page) {
    const requests: string[] = [];
    page.on("request", (r) => {
        if (r.isNavigationRequest() && r.frame() === page.mainFrame()) requests.push(r.url());
    });
    return requests;
}

async function fillForm(page: Page) {
    await page.locator('input[name="nome"]').fill("Prova");
    await page.locator('input[name="locale"]').fill("Bar Prova");
    await page.locator('input[name="telefono"]').fill("3331234567");
    await page.locator('input[name="privacy"]').check();
}

test.describe("landing / prima dell'idratazione", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("clic e Invio non inviano il form in modo nativo, il contatto parte dopo l'idratazione", async ({ page }) => {
        const docs = trackDocumentRequests(page);
        const leads = await interceptLead(page);
        await delayLandingJs(page);

        await page.goto("/", { waitUntil: "commit" });
        const submit = page.locator('#landing-contact-form button[type="submit"]');
        await submit.waitFor({ state: "attached" });

        // Il JS della landing non è ancora arrivato: siamo sull'HTML prerenderizzato.
        expect(await page.evaluate(() => performance.getEntriesByType("resource").some((e) => /\/assets\/landing-[^/]*\.js/.test(e.name)))).toBe(false);
        await expect(submit).toBeDisabled();

        await fillForm(page);
        await submit.click({ force: true });
        await page.locator('input[name="telefono"]').press("Enter");
        await page.waitForTimeout(300);

        expect(docs).toHaveLength(1);
        expect(page.url()).not.toContain("telefono=");
        expect(leads).toHaveLength(0);

        // Dopo l'idratazione il pulsante si abilita e i valori scritti restano.
        await expect(submit).toBeEnabled({ timeout: JS_DELAY_MS + 10_000 });
        await expect(page.locator('input[name="nome"]')).toHaveValue("Prova");
        await submit.click();
        await expect(page.locator('#landing-contact-form [id$="-error"]')).toHaveCount(0);

        await expect.poll(() => leads.length).toBe(1);
        expect(leads[0]).toMatchObject({ name: "Prova", venue_name: "Bar Prova", phone: "3331234567", variant: "form" });
        expect(docs).toHaveLength(1);
        expect(new URL(page.url()).search).toBe("");
    });

    test("a pagina idratata il submit è abilitato e senza stile «in invio»", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" });
        const submit = page.locator('#landing-contact-form button[type="submit"]');
        await expect(submit).toBeEnabled();
        await expect(submit).not.toHaveAttribute("aria-busy", /.*/);
        await expect(submit).toHaveCSS("opacity", "1");
    });

    test("/b non ha il form di contatto", async ({ page }) => {
        await page.goto("/b.html", { waitUntil: "networkidle" });
        await expect(page.locator("#landing-contact-form")).toHaveCount(0);
    });
});
