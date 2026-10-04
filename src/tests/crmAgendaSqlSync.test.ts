import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { callReminderAt, REMINDER_HOUR } from "@shared/crmCallSlots";

// Le regole dell'agenda che stanno sia nell'edge sia nel SQL devono restare
// uguali: se una cambia da sola, il cron non sveglia l'edge quando c'è un
// sollecito o un passaggio da fare, o il promemoria al lead parte all'ora
// sbagliata.

const DIR = "supabase/migrations";

// Letto dal testo, come in crmAgentSqlSync.test.ts.
const messagesSource = readFileSync("supabase/functions/_shared/crmAgendaMessages.ts", "utf8");
function tsConstant(name: string): number {
    const match = messagesSource.match(new RegExp(`const ${name} = (\\d+);`));
    expect(match, `costante ${name} non trovata`).not.toBeNull();
    return Number(match![1]);
}
const CALLER_REMINDER_MINUTES = tsConstant("CALLER_REMINDER_MINUTES");
const HANDOVER_HOURS_BEFORE = tsConstant("HANDOVER_HOURS_BEFORE");
const HANDOVER_LAST_MINUTES = tsConstant("HANDOVER_LAST_MINUTES");

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

describe("crm_agenda_has_work ↔ sollecito e passaggio del «Puoi tu?»", () => {
    const body = lastDefinition("crm_agenda_has_work");

    it("sollecito dopo gli stessi minuti (CALLER_REMINDER_MINUTES)", () => {
        const minutes = [...body.matchAll(/caller_asked_at \+ interval '(\d+) minutes'/g)].map(m => Number(m[1]));
        expect(minutes.length).toBeGreaterThan(0);
        for (const m of minutes) expect(m).toBe(CALLER_REMINDER_MINUTES);
    });

    it("passaggio: stesse ore prima e stesso margine finale di handoverAt", () => {
        const hours = body.match(/starts_at - interval '(\d+) hours'/);
        expect(Number(hours?.[1])).toBe(HANDOVER_HOURS_BEFORE);
        const last = body.match(/least\([\s\S]*?a\.starts_at - interval '(\d+) minutes'\)/);
        expect(Number(last?.[1])).toBe(HANDOVER_LAST_MINUTES);
    });
});

describe("crm_call_reminder_at ↔ callReminderAt", () => {
    const body = lastDefinition("crm_call_reminder_at");

    it("il giorno prima, alla stessa ora di Roma", () => {
        const match = body.match(/- 1\) \+ time '(\d{2}):(\d{2})'/);
        expect(match).not.toBeNull();
        expect(Number(match![1])).toBe(REMINDER_HOUR);
        expect(Number(match![2])).toBe(0);
        expect(body).toContain("AT TIME ZONE 'Europe/Rome'");
    });

    it("callReminderAt rispetta il cambio d'ora (come il SQL, che lavora in ora di Roma)", () => {
        // Lunedì 26/10/2026 alle 9:15 di Roma (ora solare): promemoria domenica
        // 25 alle 18 di Roma, cioè 17:00 UTC.
        expect(callReminderAt(new Date("2026-10-26T08:15:00Z")).toISOString()).toBe("2026-10-25T17:00:00.000Z");
        // Lunedì 30/3/2026 (ora legale): domenica 29 alle 18 di Roma = 16:00 UTC.
        expect(callReminderAt(new Date("2026-03-30T07:15:00Z")).toISOString()).toBe("2026-03-29T16:00:00.000Z");
    });
});
