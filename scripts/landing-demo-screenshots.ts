#!/usr/bin/env node
/**
 * scripts/landing-demo-screenshots.ts
 *
 * Rigenera gli screenshot dei tre menù di esempio mostrati nel telefono della
 * sezione «prova tu» della landing (`CampaignLanding/components/sections/Demos`).
 * Da rifare quando cambiano i menù in produzione.
 *
 * Usage: npm run landing:demo-screenshots [-- --base https://cataloglobe.com] [-- --out <dir>]
 *
 * Per ogni slug: pagina pubblica a 390×808 @2x (sola lettura), poi due WebP
 * larghi quanto lo schermo del telefono sul desktop (280 px) e il doppio
 * (560 px). 808 = 390 × 580 / 280: lo scatto ha le proporzioni dello schermo
 * del telefono sul desktop (280×580), così la barra di navigazione in basso
 * della pagina cade intera sul bordo invece di uscire tagliata.
 * La conversione in WebP la fa Chromium stesso (canvas), senza dipendenze in più.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const SLUGS = ["il-molo-34", "la-pausa", "velvet-garden"] as const;
const VIEWPORT = { width: 390, height: 808 };
const SCALE = 2;
/** Larghezza dello schermo del telefono sul desktop (`.phone` 300 − 2 × 10 di padding), 1x e 2x. */
const WIDTHS = [280, 560] as const;
const QUALITY = 0.82;

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
    const base = arg("base", "https://cataloglobe.com").replace(/\/$/, "");
    const outDir = resolve(process.cwd(), arg("out", "src/pages/CampaignLanding/assets/demos"));
    mkdirSync(outDir, { recursive: true });

    const browser = await chromium.launch();
    const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: SCALE,
        isMobile: true,
        hasTouch: true,
        locale: "it-IT",
        reducedMotion: "reduce"
    });
    const page = await context.newPage();

    try {
        for (const slug of SLUGS) {
            const url = `${base}/${slug}`;
            const response = await page.goto(url, { waitUntil: "networkidle" });
            if (!response || !response.ok()) throw new Error(`${url} → HTTP ${response?.status() ?? "?"}`);
            // Font pronti e immagini caricate prima dello scatto.
            await page.evaluate(async () => {
                await document.fonts.ready;
                await Promise.all(
                    Array.from(document.images)
                        .filter((img) => !img.complete)
                        .map((img) => new Promise((done) => img.addEventListener("load", done, { once: true })))
                );
            });
            await page.waitForTimeout(500);
            const png = await page.screenshot({ type: "png" });

            // Ridimensiona e codifica in WebP dentro la pagina (canvas di Chromium).
            const encoded = await page.evaluate(
                async ({ dataUrl, widths, quality }) => {
                    const img = new Image();
                    img.src = dataUrl;
                    await img.decode();
                    return widths.map((w) => {
                        const h = Math.round((img.naturalHeight * w) / img.naturalWidth);
                        const canvas = document.createElement("canvas");
                        canvas.width = w;
                        canvas.height = h;
                        const ctx = canvas.getContext("2d");
                        if (!ctx) throw new Error("canvas 2d non disponibile");
                        ctx.imageSmoothingQuality = "high";
                        ctx.drawImage(img, 0, 0, w, h);
                        return { w, h, data: canvas.toDataURL("image/webp", quality) };
                    });
                },
                { dataUrl: `data:image/png;base64,${png.toString("base64")}`, widths: [...WIDTHS], quality: QUALITY }
            );

            for (const { w, h, data } of encoded) {
                if (!data.startsWith("data:image/webp")) throw new Error("WebP non supportato dal canvas");
                const file = resolve(outDir, `${slug}-${w}.webp`);
                const bytes = Buffer.from(data.split(",")[1], "base64");
                writeFileSync(file, bytes);
                console.log(`${slug}: ${w}×${h} ${Math.round(bytes.length / 1024)} KB → ${file}`);
            }
        }
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
