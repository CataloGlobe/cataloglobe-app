// Peso del bundle della pagina pubblica (build `public-client`, dist/public).
// Legge il manifest di Vite e confronta tre numeri (byte gzip) con i tetti in
// scripts/public-bundle-budget.json:
//   - initialJs  : entry-client + gli import statici (quello che il telefono
//                  scarica prima di disegnare)
//   - initialCss : i CSS dell'entry e dei suoi import statici
//   - lazyJs     : tutti gli altri chunk JS (fogli, ricerca, prenotazioni...)
// Un tetto = misura di oggi + margine; per alzarlo si cambia il JSON nella
// stessa PR, con il motivo nella descrizione.
//   node scripts/public-bundle-budget.mjs          stampa le misure e controlla
//   node scripts/public-bundle-budget.mjs --check  idem, esce 1 se sfora
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "dist/public");
const budget = JSON.parse(readFileSync(path.join(root, "scripts/public-bundle-budget.json"), "utf8"));

let manifest;
try {
    manifest = JSON.parse(readFileSync(path.join(outDir, ".vite/manifest.json"), "utf8"));
} catch {
    console.error("Manifest mancante: lanciare prima `npm run build:ssr:client`.");
    process.exit(2);
}

const gz = file => gzipSync(readFileSync(path.join(outDir, file)), { level: 9 }).length;

const entryKey = Object.keys(manifest).find(k => manifest[k].isEntry);
const initialJs = new Set();
const initialCss = new Set();
(function walk(key) {
    const chunk = manifest[key];
    if (!chunk || initialJs.has(chunk.file)) return;
    initialJs.add(chunk.file);
    for (const css of chunk.css ?? []) initialCss.add(css);
    for (const dep of chunk.imports ?? []) walk(dep);
})(entryKey);

const lazyJs = new Set(
    Object.values(manifest)
        .map(c => c.file)
        .filter(f => f.endsWith(".js") && !initialJs.has(f))
);

const sum = files => [...files].reduce((n, f) => n + gz(f), 0);
const measured = {
    initialJs: sum(initialJs),
    initialCss: sum(initialCss),
    lazyJs: sum(lazyJs)
};

const kb = n => `${(n / 1024).toFixed(1)} kB`;
let failed = false;
for (const [name, value] of Object.entries(measured)) {
    const limit = budget[name];
    const over = value > limit;
    failed ||= over;
    console.log(`${over ? "SFORA" : "ok   "} ${name.padEnd(10)} ${kb(value).padStart(9)} / tetto ${kb(limit)}`);
}
if (failed) {
    console.log(
        "\nIl bundle pubblico è cresciuto oltre il tetto. Se è voluto, alza il valore in " +
            "scripts/public-bundle-budget.json e spiega il motivo nella PR."
    );
}
process.exit(failed && process.argv.includes("--check") ? 1 : 0);
