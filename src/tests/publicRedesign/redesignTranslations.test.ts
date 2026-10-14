import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import it_ from "@/i18n/locales/it/public.json";
import de from "@/i18n/locales/de/public.json";
import en from "@/i18n/locales/en/public.json";
import es from "@/i18n/locales/es/public.json";
import fr from "@/i18n/locales/fr/public.json";

/**
 * Traduzioni della pagina pubblica nuova: ogni chiave `t("…")` scritta nei
 * componenti di `redesign/` esiste in tutte e cinque le lingue (anche come
 * plurale `_one`/`_other`), e le lingue straniere non copiano l'italiano.
 * Le chiavi costruite a runtime (`t(\`x.${y}\`)`) qui non si vedono.
 */

const DIR = join(process.cwd(), "src/components/PublicCollectionView/redesign");
const LOCALES = { it: it_, en, de, fr, es } as const;

/** Uguali all'italiano per natura: marchi, nomi propri, parole identiche. */
const SAME_ON_PURPOSE = new Set([
    "social.instagram",
    "social.facebook",
    "social.whatsapp",
    "footer.powered_by",
    "page_end.privacy",
    "header.logo_alt",
    "reviews.privacy_disclaimer_link",
    "reservation.party_count",
    "booking.people_word",
    "categories.summary_filters"
]);

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sourceFiles(path);
        return /\.tsx?$/.test(name) ? [path] : [];
    });
}

function usedKeys(): Map<string, string> {
    const keys = new Map<string, string>();
    for (const file of sourceFiles(DIR)) {
        const text = readFileSync(file, "utf8");
        for (const match of text.matchAll(/\bt\(\s*["'`]([a-z0-9_.]+)["'`]/gi)) {
            if (!keys.has(match[1])) keys.set(match[1], relative(DIR, file));
        }
    }
    return keys;
}

function lookup(dict: unknown, key: string): unknown {
    const at = (k: string) => k.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], dict);
    return at(key) ?? at(`${key}_one`) ?? at(`${key}_other`);
}

describe("traduzioni del redesign", () => {
    const keys = usedKeys();

    it("trova le chiavi nei componenti", () => {
        expect(keys.size).toBeGreaterThan(100);
    });

    it("ogni chiave usata c'è in tutte le lingue", () => {
        const missing: string[] = [];
        for (const [key, file] of keys) {
            for (const [lang, dict] of Object.entries(LOCALES)) {
                if (typeof lookup(dict, key) !== "string") missing.push(`${lang} ${key} (${file})`);
            }
        }
        expect(missing).toEqual([]);
    });

    it("le lingue straniere non copiano l'italiano", () => {
        const copied: string[] = [];
        for (const key of keys.keys()) {
            if (SAME_ON_PURPOSE.has(key)) continue;
            const italian = lookup(it_, key);
            if (typeof italian !== "string" || !/[a-zà-ù]{4,}/i.test(italian)) continue;
            for (const lang of ["en", "de", "fr", "es"] as const) {
                if (lookup(LOCALES[lang], key) === italian) copied.push(`${lang} ${key}: ${italian}`);
            }
        }
        expect(copied).toEqual([]);
    });
});
