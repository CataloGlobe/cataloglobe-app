import { expect, test } from "@playwright/test";

/**
 * Galleria `/dev/ui`: le forme di `ui/` che una pagina usa per la prima volta
 * (lotto `ds-5-programmazione-matrice`, P4). Solo lettura, niente dati.
 */

test.describe("Galleria — RangeInput e DataTable", () => {
    test("RangeInput con le tacche: sotto il cursore, dal primo all'ultimo estremo", async ({ page }) => {
        await page.goto("/dev/ui#input");
        const slider = page.getByRole("slider", { name: "Ora del giorno" });
        await expect(slider).toBeVisible({ timeout: 15_000 });
        const marks = slider.locator("xpath=following-sibling::*[1]");
        await expect(marks).toHaveText(/00\s*06\s*12\s*18\s*24/);
        const s = (await slider.boundingBox())!;
        const first = (await marks.getByText("00", { exact: true }).boundingBox())!;
        const last = (await marks.getByText("24", { exact: true }).boundingBox())!;
        expect(first.y).toBeGreaterThanOrEqual(s.y + s.height - 1);
        expect(Math.abs(first.x - s.x)).toBeLessThan(2);
        expect(Math.abs(last.x + last.width - (s.x + s.width))).toBeLessThan(2);
    });

    test("DataTable con nome: è una tabella per i lettori, la riga spenta resta leggibile e cliccabile", async ({ page }) => {
        await page.goto("/dev/ui#datatable");
        const table = page.getByRole("table", { name: "Cataloghi, uno sospeso" });
        await expect(table).toBeVisible({ timeout: 15_000 });
        await expect(table.getByRole("columnheader", { name: "Nome" })).toBeVisible();
        await expect(table.getByRole("row")).toHaveCount(4);
        const muted = table.getByRole("row").filter({ hasText: "Carta dei vini" });
        const normal = table.getByRole("row").filter({ hasText: "Menù pranzo" });
        const opacity = async (row: typeof muted) => Number(await row.getByRole("cell").first().evaluate(el => getComputedStyle(el).opacity));
        expect(await opacity(muted)).toBeLessThan(1);
        expect(await opacity(normal)).toBe(1);
        await expect(muted.getByRole("button", { name: /Azioni/ })).toBeEnabled();
    });
});
