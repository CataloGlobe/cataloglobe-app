import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "fs";
import path from "path";

/**
 * Parità delle chiavi fra i dizionari: ogni chiave dell'italiano (lingua di
 * riferimento) deve esistere in tutte le altre lingue, con gli stessi
 * segnaposto `{{...}}`. Senza, il buco si scopre per caso (toast o alt in
 * italiano o con la chiave grezza).
 */

const LOCALES_DIR = path.resolve(__dirname, "../i18n/locales");
const REFERENCE = "it";

type Dict = { [key: string]: string | Dict };

function flatten(dict: Dict, prefix = ""): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(dict)) {
        const full = prefix ? `${prefix}.${key}` : key;
        if (typeof value === "string") out[full] = value;
        else Object.assign(out, flatten(value, full));
    }
    return out;
}

function load(lang: string, ns: string): Record<string, string> {
    return flatten(JSON.parse(readFileSync(path.join(LOCALES_DIR, lang, `${ns}.json`), "utf8")));
}

function placeholders(text: string): string[] {
    return [...text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map(m => m[1]).sort();
}

const languages = readdirSync(LOCALES_DIR).filter(l => l !== REFERENCE);
const namespaces = readdirSync(path.join(LOCALES_DIR, REFERENCE))
    .filter(f => f.endsWith(".json"))
    .map(f => f.replace(/\.json$/, ""));

describe("i18n: parità delle chiavi con l'italiano", () => {
    it("ci sono le lingue e i namespace attesi", () => {
        expect(languages.sort()).toEqual(["de", "en", "es", "fr"]);
        expect(namespaces.length).toBeGreaterThan(0);
    });

    for (const ns of namespaces) {
        const reference = load(REFERENCE, ns);
        for (const lang of languages) {
            it(`${lang}/${ns}.json ha tutte le chiavi di it`, () => {
                const dict = load(lang, ns);
                const missing = Object.keys(reference).filter(k => !(k in dict));
                expect(missing).toEqual([]);
            });

            it(`${lang}/${ns}.json ha gli stessi segnaposto di it`, () => {
                const dict = load(lang, ns);
                const mismatched = Object.keys(reference)
                    .filter(k => k in dict)
                    .filter(k => placeholders(reference[k]).join() !== placeholders(dict[k]).join());
                expect(mismatched).toEqual([]);
            });
        }
    }
});
