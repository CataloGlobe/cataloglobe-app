import { expect, test, type Page } from "@playwright/test";
import { SLUG, stubPublicPage } from "./publicPageStub";

/**
 * L'ordine su desktop (mockup v38 `.d-ofab`, D39): «Il tuo ordine · N» fisso in
 * basso a destra, sempre in modo ordine, col numero solo coi piatti scelti (D74,
 * deciso da Lorenzo il 2026-10-13), apre la finestra «Il tuo ordine» al centro. Sul telefono resta il
 * cerchio nella barra in basso. Stub senza login, `get-orders-for-session` finto.
 */

test.use({ storageState: { cookies: [], origins: [] } });

async function openPage(page: Page, width: number, height: number) {
    await page.setViewportSize({ width, height });
    await stubPublicPage(page, { ordering: true, details: true });
    await page.route("**/functions/v1/get-orders-for-session**", route =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                session_id: "s1",
                table: { id: "t1", label: "Tavolo 4", zone: null },
                current_open_group_id: null,
                bill_requested_at: null,
                orders: []
            })
        })
    );
    await page.goto(`/${SLUG}`);
    await page.getByText("Antipasti 1", { exact: true }).waitFor();
    test.skip((await page.getByRole("button", { name: "Altre opzioni" }).count()) === 0, "pagina senza redesign");
}

const order = (page: Page) => page.getByRole("button", { name: /^Il tuo ordine/ });

test("desktop: c'è in modo ordine, il numero coi piatti scelti, apre la finestra al centro", async ({ page }) => {
    await openPage(page, 1440, 900);
    // Modo ordine senza piatti: c'è, senza numero (porta agli ordini inviati, al cameriere, al conto).
    const button = order(page);
    await expect(button).toHaveCount(1);
    await expect(button).toHaveAccessibleName("Il tuo ordine");
    await expect(button).toHaveText("Il tuo ordine");

    await page.getByRole("button", { name: "Aggiungi alla selezione" }).first().click();
    await expect(button).toHaveAccessibleName("Il tuo ordine (1)");
    await expect(button).toContainText("Il tuo ordine");
    await expect(button).toContainText("1");

    // A 24 px dai bordi, a entrata finita.
    await expect
        .poll(async () => {
            const box = (await button.boundingBox())!;
            return [Math.round(1440 - (box.x + box.width)), Math.round(900 - (box.y + box.height))];
        })
        .toEqual([24, 24]);

    await page.getByRole("button", { name: "Aggiungi alla selezione" }).nth(1).click();
    await expect(button).toHaveAccessibleName("Il tuo ordine (2)");

    await button.click();
    const dialog = page.getByRole("dialog", { name: "Il tuo ordine" });
    await expect(dialog.getByRole("heading", { name: "Il tuo ordine · Tavolo 4" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Da inviare" })).toBeVisible();
    const win = (await dialog.boundingBox())!;
    expect(Math.abs(win.x + win.width / 2 - 720)).toBeLessThan(2);
});

test("telefono: solo il cerchio della barra, niente pulsante desktop", async ({ page }) => {
    await openPage(page, 390, 844);
    await page.getByRole("button", { name: "Aggiungi alla selezione" }).first().click();
    await expect(order(page)).toHaveCount(1);
    await expect(order(page)).toHaveAccessibleName("Il tuo ordine (1)");
    await expect(order(page)).not.toContainText("Il tuo ordine");
});
