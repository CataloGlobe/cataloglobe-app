import { expect, test } from "@playwright/test";

/**
 * Il JSON-LD `FAQPage` di / nasce dallo stesso elenco della sezione FAQ
 * (`FAQ.items` in `content/landing.ts`): domande e risposte devono essere
 * quelle che il visitatore legge, nello stesso ordine. /b non lo ha.
 */

type Entry = { "@type": string; name: string; acceptedAnswer: { "@type": string; text: string } };

const norm = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim();

test("/: il FAQPage coincide con le domande e le risposte visibili", async ({ page }) => {
    await page.goto("/");
    const blocks = await page.locator('script[type="application/ld+json"][data-landing-ld]').allTextContents();
    const faq = blocks.map((b) => JSON.parse(b)).filter((ld) => ld["@type"] === "FAQPage");
    expect(faq).toHaveLength(1);

    const ld = (faq[0].mainEntity as Entry[]).map((e) => ({ q: norm(e.name), a: norm(e.acceptedAnswer.text) }));
    const section = page.locator("#faq");
    const questions = await section.locator("h3 button").allTextContents();
    const answers = await section.locator('[role="region"] p').allTextContents();
    const visible = questions.map((q, i) => ({ q: norm(q), a: norm(answers[i]) }));

    expect(visible.length).toBeGreaterThan(0);
    expect(ld).toEqual(visible);
});

test("/b: niente FAQPage", async ({ page }) => {
    await page.goto("/b.html");
    await expect(page.locator("#landing-hero-title")).toBeVisible();
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(blocks.some((b) => JSON.parse(b)["@type"] === "FAQPage")).toBe(false);
});
