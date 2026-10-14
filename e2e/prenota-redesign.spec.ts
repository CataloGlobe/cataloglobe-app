import { expect, test, type Page } from "@playwright/test";
import { SLUG, featured, stubPublicPage } from "./publicPageStub";

/**
 * Prenota a passi nel foglio unico del redesign (spec v25, mockup v38): Quando,
 * I tuoi dati, Riepilogo, poi la conferma. «1 di 3 · Quando» con giorni in fila,
 * persone con − e +, orari a vista per fascia; giorno già scelto, ora mai; il
 * pulsante del primo passo porta il riepilogo; le note nel Riepilogo. Pagina servita da stub, orologio fisso (mercoledì
 * 14/10/2026 12:30), `reservation-availability` e `submit-reservation` finti.
 *
 * Solo col redesign acceso: `VITE_PUBLIC_REDESIGN=true bash scripts/e2e.sh
 * e2e/prenota-redesign.spec.ts`.
 */

test.use({ viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } });
test.skip(process.env.VITE_PUBLIC_REDESIGN !== "true", "solo con VITE_PUBLIC_REDESIGN=true");

type Submitted = Record<string, unknown>;

async function open(page: Page, opts: { submit?: { status: number; body: unknown }; featuredCta?: boolean; time?: string } = {}) {
    await page.clock.install({ time: new Date(opts.time ?? "2026-10-14T12:30:00+02:00") });
    await stubPublicPage(page, {
        ordering: false,
        reservations: true,
        featured: opts.featuredCta
            ? { before_catalog: [featured({ cta_text: "Prenota", cta_url: `/${SLUG}/prenota` })] }
            : undefined
    });
    await page.route("**/functions/v1/reservation-availability**", route => {
        const body = route.request().postDataJSON() as { times: string[] };
        return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ slots: body.times.map(time => ({ time, available: true })) })
        });
    });
    const submitted: Submitted[] = [];
    const response = opts.submit ?? { status: 200, body: { success: true, reservation_id: "r-1", status: "pending" } };
    await page.route("**/functions/v1/submit-reservation**", route => {
        submitted.push(route.request().postDataJSON() as Submitted);
        return route.fulfill({ status: response.status, contentType: "application/json", body: JSON.stringify(response.body) });
    });
    await page.goto(`/${SLUG}`);
    await page.getByText("Antipasti 1", { exact: true }).waitFor();
    test.skip((await page.getByRole("button", { name: "Altre opzioni" }).count()) === 0, "pagina senza redesign");
    return submitted;
}

const dialog = (page: Page) => page.getByRole("dialog");

/** Dal fondo pagina, «Prenota un tavolo». */
async function openFromFooter(page: Page) {
    await page.locator("footer", { hasText: "Fine del menu" }).getByRole("button", { name: "Prenota un tavolo" }).click();
    await expect(dialog(page).getByRole("heading", { name: "Prenota un tavolo" })).toBeVisible();
}

/** Primo passo: 20:00 fra gli orari della sera. */
async function pickEvening(page: Page) {
    await dialog(page).getByRole("group", { name: "Sera" }).getByRole("button", { name: "20:00" }).click();
}

async function fillDetails(page: Page) {
    await dialog(page).getByRole("textbox", { name: /Nome e cognome/ }).fill("Anna Rossi");
    await dialog(page).getByRole("textbox", { name: /Telefono/ }).fill("+39 333 1234567");
    await dialog(page).getByRole("textbox", { name: /Email/ }).fill("anna@example.com");
}

test("i tre passi e la conferma: giorno già scelto, ora no, riepilogo nel pulsante", async ({ page }) => {
    const submitted = await open(page);
    await openFromFooter(page);
    const sheet = dialog(page);

    // Oggi è già scelto; l'ora no, e il pulsante lo dice e porta lì.
    await expect(sheet.getByText("1 di 3 · Quando")).toBeVisible();
    await expect(sheet.getByRole("group", { name: /^Giorno/ }).getByRole("button", { pressed: true })).toContainText("14");
    await sheet.getByRole("button", { name: "Scegli l'orario" }).click();
    await expect(sheet.getByRole("alert").filter({ hasText: "Inserisci un orario valido." })).toBeVisible();

    // Persone: numero esatto con − e + (D37).
    const people = sheet.getByRole("group", { name: "Persone" });
    await people.getByRole("button", { name: "Una persona in più" }).click();
    await people.getByRole("button", { name: "Una persona in più" }).click();
    await people.getByRole("button", { name: "Una persona in meno" }).click();
    await expect(people.locator("output")).toHaveText("3persone");

    await pickEvening(page);
    await expect(sheet.getByRole("button", { name: "Continua · mer 14 ott · 20:00 · 3 persone" })).toBeVisible();
    await sheet.getByRole("button", { name: /^Continua/ }).click();

    await expect(sheet.getByRole("heading", { name: "I tuoi dati" })).toBeVisible();
    await expect(sheet.getByText("2 di 3 · I tuoi dati")).toBeVisible();
    // Un titolo solo: niente «02 Chi» del modulo di /prenota sotto il passo.
    await expect(sheet.getByText("02", { exact: true })).toHaveCount(0);
    await expect(sheet.getByRole("button", { name: "Indietro" })).toBeVisible();
    await sheet.getByRole("button", { name: "Continua", exact: true }).click();
    await expect(sheet.getByText("Il nome è obbligatorio.")).toBeVisible();
    await expect(sheet.getByRole("textbox", { name: /Nome e cognome/ })).toBeFocused();
    await fillDetails(page);
    await sheet.getByRole("button", { name: "Continua", exact: true }).click();

    await expect(sheet.getByRole("heading", { name: "Riepilogo" })).toBeVisible();
    await expect(sheet.getByText("Sede e2e barra")).toBeVisible();
    await expect(sheet.locator("#booking-recap").getByText("20:00")).toBeVisible();
    await expect(sheet.getByText("03", { exact: true })).toHaveCount(0);
    // Le note nel Riepilogo (v38).
    await sheet.locator("#booking-recap textarea").first().fill("Un seggiolone");
    await sheet.getByRole("button", { name: "Invia richiesta" }).click();

    await expect(sheet.getByRole("heading", { name: "Richiesta inviata!" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: /^Torna a / })).toHaveCount(0);
    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toMatchObject({
        slug: SLUG,
        reservation_date: "2026-10-14",
        reservation_time: "20:00",
        party_size: 3,
        notes: "Un seggiolone",
        customer_name: "Anna Rossi",
        customer_email: "anna@example.com",
        customer_phone: "+39 333 1234567"
    });

    await sheet.getByRole("button", { name: "Torna al menu" }).click();
    await expect(sheet).toHaveCount(0);

    // Riaperto, il modulo riparte da capo.
    await openFromFooter(page);
    await expect(dialog(page).getByRole("button", { name: "Scegli l'orario" })).toBeVisible();
});

test("orario pieno all'invio: si torna a Quando col messaggio sotto l'orario", async ({ page }) => {
    await open(page, { submit: { status: 409, body: { error_code: "CAPACITY_FULL" } } });
    await openFromFooter(page);
    const sheet = dialog(page);
    await pickEvening(page);
    await sheet.getByRole("button", { name: /^Continua/ }).click();
    await fillDetails(page);
    await sheet.getByRole("button", { name: "Continua", exact: true }).click();
    await sheet.getByRole("button", { name: "Invia richiesta" }).click();

    await expect(sheet.getByRole("heading", { name: "Prenota un tavolo" })).toBeVisible();
    await expect(sheet.getByRole("alert").filter({ hasText: "Non ci sono più posti per l'orario scelto. Prova un altro orario." })).toBeVisible();
});

test("dal ⋯ il primo passo entra a spinta, con «‹»", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Altre opzioni" }).click();
    const sheet = dialog(page);
    await sheet.getByRole("button", { name: /Prenota un tavolo/ }).click();
    await expect(sheet.getByRole("heading", { name: "Prenota un tavolo" })).toBeVisible();
    await sheet.getByRole("button", { name: "Indietro" }).click();
    await expect(sheet.getByRole("heading", { name: "Altro" })).toBeVisible();
});

test("In evidenza col pulsante verso la prenotazione della sede apre i passi nel foglio", async ({ page }) => {
    await open(page, { featuredCta: true });
    await page.getByRole("list", { name: "Contenuti in evidenza" }).getByRole("listitem").first().click();
    const sheet = dialog(page);
    await sheet.getByRole("button", { name: "Prenota", exact: true }).click();
    await expect(sheet.getByRole("heading", { name: "Prenota un tavolo" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Indietro" })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/${SLUG}$`));
});

test("persone fino a 20, poi il rimando alle richieste particolari; i giorni in fila", async ({ page }) => {
    await open(page);
    await openFromFooter(page);
    const sheet = dialog(page);
    const more = sheet.getByRole("button", { name: "Una persona in più" });
    for (let i = 2; i < 20; i++) await more.click();
    await expect(more).toBeDisabled();
    await expect(sheet.getByText(/Oltre 20 persone scrivilo nelle richieste particolari/)).toBeVisible();
    const days = sheet.getByRole("group", { name: /^Giorno/ }).getByRole("button");
    expect(await days.count()).toBeGreaterThan(7);
});

test("di sera la lista degli orari va da sola al primo libero (D91)", async ({ page }) => {
    // Telefono basso: gli orari della sera non stanno a vista senza scorrere.
    await page.setViewportSize({ width: 390, height: 640 });
    await open(page, { time: "2026-10-14T20:10:00+02:00" });
    await openFromFooter(page);
    const sheet = dialog(page);
    const firstFree = sheet.getByRole("group", { name: "Sera" }).getByRole("button", { disabled: false }).first();
    await expect(firstFree).toBeInViewport();
    // Il foglio è sceso: la fila dei giorni è passata sopra.
    await expect(sheet.getByRole("group", { name: /^Giorno/ })).not.toBeInViewport();
});
