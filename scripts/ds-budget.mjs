#!/usr/bin/env node
// Budget del design system (piano refactor M17, §2).
// Conta cinque segnali "grossolani" sul perimetro del back office.
// I numeri possono solo scendere: `--check` esce 1 se uno supera il valore
// salvato in scripts/ds-budget.json; senza flag stampa e salva.

import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const BUDGET_FILE = join(ROOT, "scripts", "ds-budget.json");

const PAGE_DIRS = [
  "Admin", "Auth", "Business", "Dashboard", "Invite",
  "Onboarding", "Operativita", "Setup", "Workspace",
].map((d) => join("src", "pages", d));
const PERIMETER = [...PAGE_DIRS, join("src", "layouts"), join("src", "components")];
const COMPONENTS_EXCLUDED = new Set(["public", "PublicCollectionView", "catalog-renderer", "ui"]);

const METRICS = [
  { key: "hex", label: "hex nudi (.module.scss)" },
  { key: "transition", label: "transition all/width/height/margin/padding" },
  { key: "toastError", label: "showToast type error" },
  { key: "inlineComponents", label: "componenti dentro file di pagina" },
  { key: "fontSize", label: "font-size (.module.scss)" },
];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

function collectFiles() {
  const files = [];
  for (const base of PERIMETER) {
    const abs = join(ROOT, base);
    if (!existsSync(abs)) continue;
    for (const file of walk(abs)) {
      const rel = relative(ROOT, file).split(sep);
      if (rel[1] === "components" && COMPONENTS_EXCLUDED.has(rel[2])) continue;
      files.push(file);
    }
  }
  return files;
}

const PAGES_ABS = join(ROOT, "src", "pages") + sep;
const isPageFile = (file) => file.startsWith(PAGES_ABS);

const stripScssComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// (1) hex letterali fuori dal fallback di var(--x, #hex)
function countHex(scss) {
  const noVar = stripScssComments(scss).replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, "");
  return (noVar.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length;
}

// (2) transition su proprietà di layout
const LAYOUT_PROPS = /^(all|width|height|margin|padding|max-width|min-width|max-height|min-height|margin-[a-z]+|padding-[a-z]+)$/;
function countLayoutTransitions(scss) {
  const decls = stripScssComments(scss).match(/transition(?:-property)?\s*:\s*[^;{}]+/g) ?? [];
  let n = 0;
  for (const decl of decls) {
    const value = decl.replace(/^transition(?:-property)?\s*:\s*/, "");
    const props = value.split(",").map((s) => s.trim().split(/\s+/)[0]);
    if (props.some((p) => LAYOUT_PROPS.test(p))) n += 1;
  }
  return n;
}

// (3) showToast con type error
function countToastErrors(ts) {
  return (ts.match(/showToast\(\s*\{[^}]*?type:\s*["']error["']/g) ?? []).length;
}

// (4) componenti privati (PascalCase, non esportati, JSX nel corpo) definiti a
// top-level nei .tsx sotto src/pages — criterio del censimento M17: il componente
// principale del file (esportato, o col nome del file) non conta.
const TOP_LEVEL_RE = /^(?:export\s+)?(?:const|let|function|type|interface|enum|class)\s+([A-Za-z_$][\w$]*)/gm;
const PASCAL_RE = /^[A-Z][A-Za-z0-9]*$/;
const JSX_RE = /(?:return|=>)\s*\(?\s*<[A-Za-z>]|<\/[A-Za-z]|<>/;
function countInlineComponents(tsx, file) {
  const fileName = basename(file, ".tsx");
  const defs = [...tsx.matchAll(TOP_LEVEL_RE)];
  let n = 0;
  defs.forEach((m, i) => {
    const name = m[1];
    if (!/^(?:const|function)\s/.test(m[0])) return; // esportati = API del file, non inline
    if (!PASCAL_RE.test(name) || !/[a-z]/.test(name)) return; // esclude COSTANTI
    if (name === fileName) return;
    const end = i + 1 < defs.length ? defs[i + 1].index : tsx.length;
    if (JSX_RE.test(tsx.slice(m.index, end))) n += 1;
  });
  return n;
}

// (5) font-size nei .module.scss
function countFontSize(scss) {
  return (stripScssComments(scss).match(/\bfont-size\s*:/g) ?? []).length;
}

function measure() {
  const totals = { hex: 0, transition: 0, toastError: 0, inlineComponents: 0, fontSize: 0 };
  for (const file of collectFiles()) {
    const src = readFileSync(file, "utf8");
    if (file.endsWith(".module.scss")) {
      totals.hex += countHex(src);
      totals.transition += countLayoutTransitions(src);
      totals.fontSize += countFontSize(src);
    } else if (file.endsWith(".tsx") || file.endsWith(".ts")) {
      totals.toastError += countToastErrors(src);
      if (file.endsWith(".tsx") && isPageFile(file)) totals.inlineComponents += countInlineComponents(src, file);
    }
  }
  return totals;
}

function main() {
  const check = process.argv.includes("--check");
  const totals = measure();
  const saved = existsSync(BUDGET_FILE) ? JSON.parse(readFileSync(BUDGET_FILE, "utf8")) : null;

  let failed = false;
  for (const { key, label } of METRICS) {
    const prev = saved?.[key];
    const delta = prev == null ? "" : ` (budget ${prev}, ${totals[key] - prev >= 0 ? "+" : ""}${totals[key] - prev})`;
    const over = prev != null && totals[key] > prev;
    if (over) failed = true;
    console.log(`${over ? "✖" : "•"} ${label}: ${totals[key]}${delta}`);
  }

  if (check) {
    if (!saved) {
      console.error("ds-budget.json mancante: esegui `npm run ds:budget` per salvare la baseline.");
      process.exit(1);
    }
    if (failed) {
      console.error("Budget superato: un contatore è salito rispetto a scripts/ds-budget.json.");
      process.exit(1);
    }
    return;
  }

  writeFileSync(BUDGET_FILE, JSON.stringify(totals, null, 2) + "\n");
  console.log(`Salvato in ${relative(ROOT, BUDGET_FILE)}`);
}

main();
