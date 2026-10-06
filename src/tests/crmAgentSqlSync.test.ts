import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isAgentNight } from "@shared/crmAgentRules";

// Le regole che l'agente applica sia nell'edge sia nel cron (SQL) devono
// restare uguali: se una cambia da sola, il cron sveglia l'edge per niente
// o non la sveglia quando c'è un promemoria da mandare.

const DIR = "supabase/migrations";

// Letto dal testo: importare crmAgentJob porterebbe nel progetto TS dell'app
// moduli Deno (Google Calendar) che lì non compilano.
const jobSource = readFileSync("supabase/functions/_shared/crmAgentJob.ts", "utf8");
const REMINDER_AFTER_MINUTES = jobSource
    .match(/export const REMINDER_AFTER_MINUTES = \[([\d,\s]+)\]/)![1]
    .split(",")
    .map(s => Number(s.trim()));

/** Il corpo dell'ultima definizione di una funzione, fra tutte le migration. */
function lastDefinition(name: string): string {
    const marker = `CREATE OR REPLACE FUNCTION public.${name}(`;
    const files = readdirSync(DIR)
        .filter(f => f.endsWith(".sql"))
        .sort()
        .filter(f => readFileSync(`${DIR}/${f}`, "utf8").includes(marker));
    expect(files.length, `nessuna migration definisce ${name}`).toBeGreaterThan(0);
    const sql = readFileSync(`${DIR}/${files[files.length - 1]}`, "utf8");
    const start = sql.lastIndexOf(marker);
    const end = sql.indexOf("$$;", start);
    return sql.slice(start, end);
}

describe("crm_agent_has_work ↔ REMINDER_AFTER_MINUTES", () => {
    const body = lastDefinition("crm_agent_has_work");

    it("stessi minuti dei promemoria", () => {
        const match = body.match(/ARRAY\[([\d,\s]+)\]/);
        expect(match).not.toBeNull();
        const minutes = match![1].split(",").map(s => Number(s.trim()));
        expect(minutes).toEqual(REMINDER_AFTER_MINUTES);
    });

    it("stesso numero massimo di promemoria", () => {
        const match = body.match(/reminders\s*<\s*(\d+)/);
        expect(match).not.toBeNull();
        expect(Number(match![1])).toBe(REMINDER_AFTER_MINUTES.length);
    });
});

describe("crm_agent_is_night ↔ isAgentNight", () => {
    const body = lastDefinition("crm_agent_is_night");
    const match = body.match(/time\s*'(\d{2}):(\d{2})'/);

    it("la notte finisce alla stessa ora", () => {
        expect(match).not.toBeNull();
        const [h, m] = [Number(match![1]), Number(match![2])];
        // Ora legale (UTC+2): l'ora di Roma è UTC + 2.
        const at = (hh: number, mm: number) => new Date(Date.UTC(2026, 6, 15, hh - 2, mm));
        const prev = h * 60 + m - 1;
        expect(isAgentNight(at(Math.floor(prev / 60), prev % 60))).toBe(true);
        expect(isAgentNight(at(h, m))).toBe(false);
    });
});
