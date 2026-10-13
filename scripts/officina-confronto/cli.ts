// CLI del confronto «vincitore uguale a prima» (pacchetto database dell'Officina).
//
//   npm run officina:confronto -- esito --dati fotografia.json --settimana 2026-10-19 --out prima.json
//   npm run officina:confronto -- confronta --prima prima.json --dopo dopo.json [--md differenze.md]
//
// `esito`: per ogni sede e ogni 15 minuti della settimana (lunedì dato, ora di
// Roma) chi vince e cosa vede il cliente, col giudice di oggi.
// `confronta`: dove il cliente vede qualcosa di diverso; esce con 1 se ce n'è.
// I dati arrivano da `fotografia.sql` (sola lettura); i file di esito contengono
// nomi di sedi e regole: tenerli fuori dal repo.

import { readFileSync, writeFileSync } from "node:fs";
import { calcolaEsito, confronta, type Differenza, type Esito, type Snapshot } from "./model";

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

function required(name: string): string {
    const value = arg(name);
    if (!value) {
        console.error(`manca --${name}`);
        process.exit(2);
    }
    return value;
}

function readJson<T>(path: string): T {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    // Da psql o dall'SQL editor la fotografia può arrivare dentro { fotografia: ... }
    // o come [{ fotografia: ... }].
    const unwrapped = Array.isArray(raw) ? raw[0] : raw;
    if (unwrapped && typeof unwrapped === "object" && "fotografia" in unwrapped) {
        return (unwrapped as { fotografia: T }).fotografia;
    }
    return unwrapped as T;
}

function nextMonday(): string {
    const d = new Date();
    const delta = (8 - d.getUTCDay()) % 7 || 7;
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
}

function riassunto(esito: Esito): string {
    const righe = [`Esito «${esito.giudice}», settimana dal ${esito.settimana}, passo ${esito.passo_minuti} min`];
    for (const sede of esito.sedi) {
        const parti = Object.entries(sede.strati)
            .map(([tipo, tratti]) => {
                const vincenti = new Set(tratti.filter(t => t.regola).map(t => t.regola));
                const conAltre = tratti.filter(t => t.altre.length > 0).length;
                return `${tipo} ${vincenti.size}${conAltre ? ` (${conAltre} tratti con altre in finestra)` : ""}`;
            })
            .join(", ");
        righe.push(`- ${sede.azienda} / ${sede.nome} [${sede.stato}]: ${parti}`);
    }
    return righe.join("\n");
}

function markdown(diffs: Differenza[], prima: Esito, dopo: Esito): string {
    const nome = (id: string | null) => (id ? (dopo.nomi[id] ?? prima.nomi[id] ?? id) : "-");
    const righe = [
        `# Confronto «${prima.giudice}» → «${dopo.giudice}», settimana dal ${prima.settimana}`,
        "",
        diffs.length === 0
            ? "Nessuna differenza: in ogni sede e ogni quarto d'ora il cliente vede lo stesso."
            : `${diffs.length} differenze.`,
        ""
    ];
    if (diffs.length > 0) {
        righe.push("| Azienda | Sede | Strato | Da | Fino a | Prima | Dopo |", "|---|---|---|---|---|---|---|");
        for (const d of diffs) {
            righe.push(
                `| ${d.azienda} | ${d.sede} | ${d.strato} | ${d.quando} | ${d.a.slice(0, 16)}Z | ${nome(d.regola_prima)} | ${nome(d.regola_dopo)} |`
            );
        }
    }
    return righe.join("\n") + "\n";
}

const command = process.argv[2];

if (command === "esito") {
    const snapshot = readJson<Snapshot>(required("dati"));
    const esito = calcolaEsito(snapshot, arg("settimana") ?? nextMonday(), {
        nomeGiudice: arg("giudice") ?? "oggi"
    });
    writeFileSync(required("out"), JSON.stringify(esito, null, 2));
    console.log(riassunto(esito));
} else if (command === "confronta") {
    const prima = readJson<Esito>(required("prima"));
    const dopo = readJson<Esito>(required("dopo"));
    const diffs = confronta(prima, dopo);
    const md = markdown(diffs, prima, dopo);
    const out = arg("md");
    if (out) writeFileSync(out, md);
    console.log(md);
    process.exit(diffs.length === 0 ? 0 : 1);
} else {
    console.error("uso: cli.ts esito --dati <fotografia.json> [--settimana AAAA-MM-GG] --out <esito.json>");
    console.error("     cli.ts confronta --prima <esito.json> --dopo <esito.json> [--md <file.md>]");
    process.exit(2);
}
