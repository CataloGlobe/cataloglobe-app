import { expect, test, type Locator, type Page } from "@playwright/test";
import { openBusinessPage } from "./business";
import { STYLE, stubStili } from "./stiliStub";

/**
 * Bottom bar nell'anteprima dello Style Editor (device mobile): stessa logica
 * della pagina pubblica, sullo scroll del device frame invece che della
 * finestra. Le regole sono provate in `bottom-bar.spec.ts` e in
 * `bottomBarVisibility.test.ts`; qui il cablaggio sullo `scrollContainerEl`.
 * Stili finti da `stiliStub.ts`, login e azienda veri.
 */

async function openPreview(page: Page): Promise<Locator> {
    await stubStili(page);
    // L'helper entra dalla sidebar, chiusa sotto 768: si entra larghi e si stringe.
    await page.setViewportSize({ width: 1280, height: 800 });
    await openBusinessPage(page, "styles", "Stili");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(page.url().replace(/\/business\/([0-9a-f-]+)\/.*$/, `/business/$1/styles/${STYLE.sera}`));
    // A 390 il pannello proprietà copre l'anteprima: si comprime.
    await page.getByRole("button", { name: "Comprimi pannello" }).click({ timeout: 15_000 });
    const frame = page.locator(".preview-mobile");
    await expect(frame).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(700);
    return frame;
}

function screen(frame: Locator): Locator {
    return frame.locator('[class*="deviceScreen"]');
}

function barWrap(frame: Locator): Locator {
    return frame.locator('[class*="barWrap"]');
}

async function scrollScreen(frame: Locator, to: number, step = 40): Promise<void> {
    await screen(frame).evaluate(
        async (el, [target, s]) => {
            const frameTick = () => new Promise(r => requestAnimationFrame(() => r(null)));
            let y = el.scrollTop;
            while (Math.abs(target - y) > 0) {
                y = target > y ? Math.min(target, y + s) : Math.max(target, y - s);
                el.scrollTop = y;
                await frameTick();
            }
            await frameTick();
        },
        [to, step] as const
    );
}

test("anteprima mobile: cima, giù, su, fine, tap su categoria", async ({ page }) => {
    const frame = await openPreview(page);
    await expect(barWrap(frame)).toBeVisible();
    await expect(barWrap(frame)).not.toHaveAttribute("data-hidden", /.*/);

    await scrollScreen(frame, 110, 10);
    await expect(barWrap(frame)).not.toHaveAttribute("data-hidden", /.*/);

    await scrollScreen(frame, 700);
    await expect(barWrap(frame)).toHaveAttribute("data-hidden", "true");
    // La finestra non scorre: il segnale è il device frame.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    await scrollScreen(frame, 680, 4);
    await expect(barWrap(frame)).not.toHaveAttribute("data-hidden", /.*/);

    await scrollScreen(frame, 900);
    await expect(barWrap(frame)).toHaveAttribute("data-hidden", "true");
    const end = await screen(frame).evaluate(el => el.scrollHeight - el.clientHeight);
    await scrollScreen(frame, end, 200);
    await expect(barWrap(frame)).not.toHaveAttribute("data-hidden", /.*/);

    // Tap su una categoria della nav del frame: scroll programmatico, la barra resta.
    await scrollScreen(frame, 200, 200);
    const tabs = frame.getByRole("tablist").first().getByRole("tab");
    await tabs.last().click();
    await page.waitForTimeout(300);
    await expect(barWrap(frame)).not.toHaveAttribute("data-hidden", /.*/);
});
