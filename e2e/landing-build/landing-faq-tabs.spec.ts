import { expect, test } from "@playwright/test";

/**
 * Pill della FAQ (tablist): i tre pannelli sono già nell'HTML prerenderizzato,
 * gli inattivi con `hidden`; un clic o le frecce mostrano un pannello senza
 * montarlo. A 390 px le tre pill stanno su una riga.
 */

test("HTML prerenderizzato: tre pannelli, il primo attivo", async ({ request }) => {
    const html = await (await request.get("/")).text();
    const panels = [...html.matchAll(/<div id="landing-faq-panel-[^>]*>/g)].map((m) => m[0]);
    expect(panels).toHaveLength(3);
    expect(panels.map((p) => / hidden=""/.test(p))).toEqual([false, true, true]);
    expect(html).toMatch(/id="landing-faq-tab-iniziare"[^>]*aria-selected="true"/);
});

test("clic e frecce cambiano pannello, senza montarlo", async ({ page }) => {
    await page.goto("/");
    const tabs = page.getByRole("tablist", { name: "Argomenti delle domande" }).getByRole("tab");
    await expect(tabs).toHaveCount(3);
    await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");

    // Marca il pannello prima del clic: se venisse rimontato, il marcatore sparirebbe.
    await page.locator("#landing-faq-panel-prezzi").evaluate((el) => el.setAttribute("data-mark", "1"));
    await tabs.nth(2).click();
    const prezzi = page.getByRole("tabpanel", { name: /Prezzi e prova/ });
    await expect(prezzi).toBeVisible();
    await expect(prezzi).toHaveAttribute("data-mark", "1");
    await expect(page.locator("#landing-faq-panel-iniziare")).toBeHidden();
    await expect(prezzi.getByRole("button", { name: "Quanto costa CataloGlobe?" })).toHaveAttribute("aria-expanded", "true");

    await tabs.nth(2).press("ArrowRight");
    await expect(tabs.nth(0)).toBeFocused();
    await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
    await tabs.nth(0).press("ArrowLeft");
    await expect(tabs.nth(2)).toBeFocused();
    await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
});

test("a 390 px le tre pill stanno su una riga", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const boxes = await page.getByRole("tablist", { name: "Argomenti delle domande" }).getByRole("tab").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
    expect(boxes).toHaveLength(3);
    expect(new Set(boxes.map((b) => Math.round(b.top))).size).toBe(1);
    expect(Math.max(...boxes.map((b) => b.right))).toBeLessThanOrEqual(390 - 20);
});
