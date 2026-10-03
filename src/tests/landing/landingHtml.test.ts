import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// landing.html copia l'head di index.html (meta, OG, JSON-LD della landing):
// le sole differenze ammesse sono quelle dichiarate nel suo commento SYNC.
const read = (file: string) => readFileSync(path.resolve(__dirname, "../../..", file), "utf8");

const APP_ONLY = [
    '<link rel="preconnect" href="%VITE_SUPABASE_URL%" crossorigin />',
    '<link href="/fonts/app-inter.css" rel="stylesheet" />'
];
const LANDING_ONLY = [
    '<link rel="preload" href="/fonts/app/young-serif-400-normal-latin.woff2" as="font" type="font/woff2" crossorigin />',
    '<link rel="preload" href="/fonts/app/instrument-sans-400-700-normal-latin.woff2" as="font" type="font/woff2" crossorigin />'
];

function normalize(html: string, drop: string[]) {
    let out = html.replace(/<!--[\s\S]*?-->/g, "");
    for (const line of drop) {
        expect(out).toContain(line);
        out = out.replace(line, "");
    }
    return out
        .replace(/<script type="module" src="[^"]+"><\/script>/, "<script entry>")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .join("\n");
}

describe("landing.html", () => {
    it("ha lo stesso head di index.html, a parte le differenze dichiarate", () => {
        expect(normalize(read("landing.html"), LANDING_ONLY)).toBe(normalize(read("index.html"), APP_ONLY));
    });

    it("carica entry-landing, index.html resta su main", () => {
        expect(read("landing.html")).toContain('<script type="module" src="/src/entry-landing.tsx"></script>');
        expect(read("index.html")).toContain('<script type="module" src="/src/main.tsx"></script>');
    });
});
