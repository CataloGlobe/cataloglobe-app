import { expect, test, type Page } from "@playwright/test";

/**
 * Registrazione col codice (deciso da Lorenzo il 2026-10-09): dopo «Crea
 * l'account» si scrive il codice della mail e si entra subito, senza login né
 * un secondo codice. Tutto finto: `/auth/v1/*` e la riga di
 * otp_user_verifications che il trigger su auth.users scrive alla conferma.
 */

const EMAIL = "nuovo@example.invalid";
const GOOD = "123456";

function base64url(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function session() {
    const now = Math.floor(Date.now() / 1000);
    const user = {
        id: "00000000-0000-4000-8000-0000000000e5",
        aud: "authenticated",
        role: "authenticated",
        email: EMAIL,
        app_metadata: { provider: "email" },
        user_metadata: {},
        created_at: "2026-01-01T00:00:00Z"
    };
    const accessToken = [
        base64url({ alg: "HS256", typ: "JWT" }),
        base64url({ sub: user.id, aud: "authenticated", role: "authenticated", exp: now + 3600, iat: now }),
        "e2e"
    ].join(".");
    return { access_token: accessToken, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "e2e-refresh", user };
}

/** Codice giusto → sessione; altro codice → otp_expired, come GoTrue. Ritorna i codici provati. */
async function stubSignupCode(page: Page): Promise<() => string[]> {
    const tried: string[] = [];
    const value = session();
    await page.route(/\/rest\/v1\//, route => route.fulfill({ status: 200, json: [] }));
    await page.route(/\/rest\/v1\/otp_user_verifications/, route =>
        route.fulfill({ status: 200, json: [{ user_id: value.user.id }] })
    );
    await page.route(/\/auth\/v1\/user/, route => route.fulfill({ status: 200, json: value.user }));
    await page.route(/\/auth\/v1\/verify/, route => {
        const body = route.request().postDataJSON() as { token?: string; type?: string; email?: string };
        tried.push(`${body.type}:${body.email}:${body.token}`);
        if (body.token === GOOD) return route.fulfill({ status: 200, json: value });
        return route.fulfill({
            status: 403,
            json: { code: 403, error_code: "otp_expired", msg: "Token has expired or is invalid" }
        });
    });
    return () => tried;
}

async function openCodePage(page: Page): Promise<void> {
    await page.goto("/login");
    await page.evaluate(email => sessionStorage.setItem("cg.signupEmail", email), EMAIL);
    await page.goto("/check-email");
    await expect(page.getByRole("heading", { name: "Conferma la tua email" })).toBeVisible({ timeout: 15_000 });
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Registrazione col codice", () => {
    test("codice sbagliato: lo dice e svuota il campo; codice giusto: dentro subito", async ({ page }) => {
        const tried = await stubSignupCode(page);
        await openCodePage(page);

        await page.locator("#signup-code").fill("111111");
        await expect(page.getByText(/Codice non corretto o scaduto/)).toBeVisible();
        await expect(page.locator("#signup-code")).toHaveValue("");

        await page.locator("#signup-code").fill(GOOD);
        await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
        expect(tried()).toEqual([`signup:${EMAIL}:111111`, `signup:${EMAIL}:${GOOD}`]);
    });

    test("Cancella svuota il codice, Incolla lo prende dagli appunti", async ({ page, context }) => {
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);
        await stubSignupCode(page);
        await openCodePage(page);

        await page.locator("#signup-code").fill("48");
        await page.getByRole("button", { name: "Cancella" }).click();
        await expect(page.locator("#signup-code")).toHaveValue("");

        await page.evaluate(() => navigator.clipboard.writeText("Il tuo codice: 123 456"));
        await page.getByRole("button", { name: "Incolla" }).click();
        await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
    });

    test("frecce e correzioni: la casella accesa segue il cursore, la cifra si sostituisce", async ({ page }) => {
        await stubSignupCode(page);
        await openCodePage(page);
        const field = page.locator("#signup-code");
        const boxes = page.locator('[class*="boxes"] > div');

        // Da pc il cursore è già sul campo, sulla prima casella.
        await expect(field).toBeFocused();
        await expect(boxes.nth(0)).toHaveClass(/active/);

        await field.pressSequentially("1234");
        await expect(boxes.nth(4)).toHaveClass(/active/);
        await page.keyboard.press("ArrowLeft");
        await page.keyboard.press("ArrowLeft");
        await expect(boxes.nth(2)).toHaveClass(/active/);

        // Prima si inseriva in mezzo («12934»): ora sostituisce la casella accesa.
        await page.keyboard.press("9");
        await expect(field).toHaveValue("1294");
        await expect(boxes.nth(3)).toHaveClass(/active/);

        await page.keyboard.press("Backspace");
        await expect(field).toHaveValue("124");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("5");
        await expect(field).toHaveValue("1245");

        // Due cifre di fila senza pause: la seconda va nella casella dopo, non in fondo.
        for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowLeft");
        await page.keyboard.type("78", { delay: 0 });
        await expect(field).toHaveValue("1785");
        await expect(boxes.nth(3)).toHaveClass(/active/);

        // Tastiera del telefono: arriva il testo, non il tasto. Sostituisce lo stesso.
        await page.keyboard.insertText("0");
        await expect(field).toHaveValue("1780");
    });

    test("codice sbagliato: l'errore sta subito sotto le caselle, sopra «Incolla» e «Cancella»", async ({ page }) => {
        await stubSignupCode(page);
        await openCodePage(page);

        await page.locator("#signup-code").fill("111111");
        const message = page.getByText(/Codice non corretto o scaduto/);
        await expect(message).toBeVisible();
        const messageBox = await message.boundingBox();
        const clearBox = await page.getByRole("button", { name: "Cancella" }).boundingBox();
        expect(messageBox!.y).toBeLessThan(clearBox!.y);
        await expect(page.locator("#signup-code")).toBeFocused();

        // Alla prima cifra il rosso va via.
        await page.keyboard.press("4");
        await expect(message).toBeHidden();
    });

    test("senza email (pagina aperta da sola): niente campo, resta il link della mail", async ({ page }) => {
        await page.goto("/check-email");
        await expect(page.getByRole("heading", { name: "Conferma la tua email" })).toBeVisible({ timeout: 15_000 });
        await expect(page.locator("#signup-code")).toHaveCount(0);
        await expect(page.getByText(/tocca il link/)).toBeVisible();
    });
});
