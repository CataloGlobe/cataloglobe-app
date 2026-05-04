#!/usr/bin/env node
/**
 * Translate i18next locale files from IT (master) to FR/DE/ES via DeepL API.
 *
 * Usage:
 *   DEEPL_API_KEY=xxx node scripts/translations/translate-i18n-locales.mjs
 *
 * What it does:
 *   1. Reads src/i18n/locales/it/{public,common,errors,admin}.json (master).
 *   2. For each target language (fr, de, es), sends ALL strings in a namespace
 *      as a single batched DeepL call (avoids per-string rate limiting).
 *   3. Writes src/i18n/locales/{fr,de,es}/{public,common,errors,admin}.json.
 *
 * Notes:
 *   - "Always overwrites" semantics: re-run after modifying IT files to update.
 *   - {{placeholders}} preserved via tokenization (PLCH0, PLCH1, ...) — no XML.
 *   - 12 total API calls (4 namespaces × 3 languages).
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const LOCALES_DIR = path.join(REPO_ROOT, "src/i18n/locales");

const SOURCE_LANG = "IT";
const TARGET_LANGS = ["FR", "DE", "ES"];
const NAMESPACES = ["public", "common", "errors", "admin"];

const DEEPL_API_KEY = process.env.DEEPL_API_KEY;
if (!DEEPL_API_KEY) {
    console.error("[FATAL] DEEPL_API_KEY env var not set.");
    console.error("");
    console.error("Setup options:");
    console.error("  Option A (shell):  export DEEPL_API_KEY=your-key-here");
    console.error("  Option B (inline): DEEPL_API_KEY=your-key node scripts/translations/translate-i18n-locales.mjs");
    console.error("");
    console.error("Get a free key at: https://www.deepl.com/pro-api");
    process.exit(1);
}

const isFreeKey = DEEPL_API_KEY.endsWith(":fx");
const DEEPL_API_BASE = isFreeKey
    ? "https://api-free.deepl.com/v2"
    : "https://api.deepl.com/v2";

console.log(`[INFO] Using DeepL ${isFreeKey ? "Free" : "Pro"} API`);
console.log(`[INFO] Source: IT → Targets: ${TARGET_LANGS.join(", ")}`);

// ─── Flatten / rebuild helpers ────────────────────────────────────────────────

function flattenStrings(obj, prefix = "") {
    const entries = [];
    if (typeof obj === "string") {
        entries.push({ path: prefix, value: obj });
    } else if (Array.isArray(obj)) {
        obj.forEach((v, i) => entries.push(...flattenStrings(v, `${prefix}[${i}]`)));
    } else if (obj !== null && typeof obj === "object") {
        for (const [k, v] of Object.entries(obj)) {
            entries.push(...flattenStrings(v, prefix ? `${prefix}.${k}` : k));
        }
    }
    return entries;
}

function setAtPath(obj, dotPath, value) {
    const parts = dotPath.replace(/\[(\d+)\]/g, ".$1").split(".");
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (cur[p] === undefined) cur[p] = /^\d+$/.test(parts[i + 1]) ? [] : {};
        cur = cur[p];
    }
    cur[parts[parts.length - 1]] = value;
}

// ─── Placeholder tokenization ────────────────────────────────────────────────

function tokenize(text) {
    const placeholders = [];
    const tokenized = text.replace(/\{\{[^}]+\}\}/g, (match) => {
        const idx = placeholders.length;
        placeholders.push(match);
        return `PLCH${idx}`;
    });
    return { tokenized, placeholders };
}

function detokenize(text, placeholders) {
    return text.replace(/PLCH(\d+)/g, (_, idx) => placeholders[Number(idx)] ?? `PLCH${idx}`);
}

// ─── DeepL batch translate ────────────────────────────────────────────────────

async function translateBatch(strings, targetLang) {
    if (strings.length === 0) return [];

    const tokenized = strings.map(tokenize);

    // Single request with multiple `text` params
    const params = new URLSearchParams();
    params.append("source_lang", SOURCE_LANG);
    params.append("target_lang", targetLang);
    for (const { tokenized: t } of tokenized) {
        params.append("text", t);
    }

    const response = await fetch(`${DEEPL_API_BASE}/translate`, {
        method: "POST",
        headers: {
            Authorization: `DeepL-Auth-Key ${DEEPL_API_KEY}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
    });

    if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`DeepL API error ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    return data.translations.map((t, i) => detokenize(t.text, tokenized[i].placeholders));
}

// ─── Namespace processing ─────────────────────────────────────────────────────

async function processNamespace(namespace) {
    const sourceFile = path.join(LOCALES_DIR, "it", `${namespace}.json`);
    const sourceContent = await fs.readFile(sourceFile, "utf8");
    const sourceJson = JSON.parse(sourceContent);
    const entries = flattenStrings(sourceJson);

    console.log(`\n[NS] ${namespace} — ${entries.length} strings`);

    for (const lang of TARGET_LANGS) {
        const langLower = lang.toLowerCase();
        const targetDir = path.join(LOCALES_DIR, langLower);
        const targetFile = path.join(targetDir, `${namespace}.json`);

        console.log(`  [${lang}] Translating ${entries.length} strings in one batch...`);

        const translated = await translateBatch(entries.map(e => e.value), lang);

        // Log each translation
        for (let i = 0; i < entries.length; i++) {
            console.log(`    ${entries[i].path}: "${entries[i].value}" → "${translated[i]}"`);
        }

        // Rebuild the object with translated values
        const result = JSON.parse(JSON.stringify(sourceJson));
        for (let i = 0; i < entries.length; i++) {
            setAtPath(result, entries[i].path, translated[i]);
        }

        await fs.mkdir(targetDir, { recursive: true });
        await fs.writeFile(targetFile, JSON.stringify(result, null, 4) + "\n", "utf8");

        console.log(`  [${lang}] ✓ Written: src/i18n/locales/${langLower}/${namespace}.json`);
    }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log(`\n[START] IT → ${TARGET_LANGS.join(", ")} — ${NAMESPACES.length} namespaces (${NAMESPACES.length * TARGET_LANGS.length} API calls total)`);

    for (const ns of NAMESPACES) {
        await processNamespace(ns);
    }

    console.log("\n[DONE] All translations completed.");
    console.log("\nFiles written:");
    for (const lang of TARGET_LANGS) {
        for (const ns of NAMESPACES) {
            console.log(`  src/i18n/locales/${lang.toLowerCase()}/${ns}.json`);
        }
    }
    console.log("\nNext step: update src/i18n/index.ts to register FR/DE/ES");
}

main().catch(err => {
    console.error("\n[FATAL]", err.message || err);
    process.exit(1);
});
