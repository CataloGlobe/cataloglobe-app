import { expect, test, type Page } from "@playwright/test";

/**
 * Pagina dell'invito dal link della mail (`/invite/:token`), rifatta come il
 * modale del Workspace (2026-10-10): stesse parole («Sola lettura»,
 * «Invitato da»), cornice delle pagine di accesso, «Declina» secondario.
 * RPC finte: nessun invito vero, nessuna mail.
 */

const TOKEN = "00000000-0000-4000-8000-0000000000e2";

async function stubInvite(page: Page, status: string, inviter: string | null = "titolare@example.invalid") {
    await page.route(/\/rest\/v1\/rpc\/get_invite_info_by_token/, route =>
        route.fulfill({
            status: 200,
            json: [{
                tenant_id: "00000000-0000-4000-8000-0000000000aa",
                tenant_name: "Trattoria E2E",
                effective_role: "viewer",
                status,
                activity_ids: ["00000000-0000-4000-8000-0000000000bb"],
                activity_names: ["Sede Centro"]
            }]
        })
    );
    await page.route(/\/rest\/v1\/rpc\/get_my_pending_invites/, route =>
        route.fulfill({
            status: 200,
            json: inviter
                ? [{
                      membership_id: "00000000-0000-4000-8000-0000000000cc",
                      tenant_id: "00000000-0000-4000-8000-0000000000aa",
                      tenant_name: "Trattoria E2E",
                      invite_token: TOKEN,
                      effective_role: "viewer",
                      status: "pending",
                      inviter_email: inviter,
                      activity_ids: ["00000000-0000-4000-8000-0000000000bb"],
                      activity_names: ["Sede Centro"]
                  }]
                : []
        })
    );
}

/** Con SCREENSHOT_DIR salva la pagina, per le PR. */
async function shot(page: Page, name: string) {
    const dir = process.env.SCREENSHOT_DIR;
    if (dir) await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

test.describe("Invito dal link della mail", () => {
    test("invito valido: parole del modale, Declina secondario", async ({ page }) => {
        await stubInvite(page, "pending");
        let declined = 0;
        await page.route(/\/rest\/v1\/rpc\/decline_invite_by_token/, route => {
            declined += 1;
            return route.fulfill({ status: 200, json: null });
        });

        await page.goto(`/invite/${TOKEN}`);
        await expect(page.getByRole("heading", { name: "Invito ricevuto" })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText("Invitato da")).toBeVisible();
        await expect(page.getByText("titolare@example.invalid")).toBeVisible();
        await expect(page.getByText("Sola lettura")).toBeVisible();
        await expect(page.getByText("Viewer")).toHaveCount(0);
        await expect(page.getByText("Sede Centro")).toBeVisible();
        await expect(page.getByRole("button", { name: "Accetta invito" })).toBeVisible();
        await shot(page, "invito-desktop");

        await page.setViewportSize({ width: 390, height: 844 });
        await shot(page, "invito-telefono");

        await page.getByRole("button", { name: "Declina invito" }).click();
        await expect(page).toHaveURL(/\/workspace/);
        expect(declined).toBe(1);
    });

    test("senza la riga in get_my_pending_invites «Invitato da» non c'è", async ({ page }) => {
        await stubInvite(page, "pending", null);
        await page.goto(`/invite/${TOKEN}`);
        await expect(page.getByRole("heading", { name: "Invito ricevuto" })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText("Invitato da")).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Accetta invito" })).toBeEnabled();
    });

    test("invito scaduto: pagina di stato", async ({ page }) => {
        await stubInvite(page, "expired");
        await page.goto(`/invite/${TOKEN}`);
        await expect(page.getByRole("heading", { name: "Invito scaduto" })).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole("button", { name: "Vai al workspace" })).toBeVisible();
        await shot(page, "invito-scaduto");
    });
});
