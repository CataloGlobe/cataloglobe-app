/**
 * Riepilogo del giro in /admin (F1-9): periodi in ora di Roma, confronto col
 * periodo prima, righe da mostrare. Puro.
 */
import type { CrmStage, CrmSummary } from "@/types/crm";

export type CrmSummaryPeriod = "today" | "7d" | "30d" | "month";

export const CRM_SUMMARY_PERIOD_LABEL: Record<CrmSummaryPeriod, string> = {
    today: "Oggi",
    "7d": "7 giorni",
    "30d": "30 giorni",
    month: "Questo mese"
};

const ROME = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
});

function romeParts(at: Date) {
    const p: Record<string, string> = {};
    for (const part of ROME.formatToParts(at)) p[part.type] = part.value;
    return { year: Number(p.year), month: Number(p.month), day: Number(p.day) };
}


/** Mezzanotte di Roma di quel giorno di calendario (ora legale e solare). */
export function romeMidnight(year: number, month: number, day: number): Date {
    const wanted = Date.UTC(year, month - 1, day, 0, 0);
    for (const offsetHours of [2, 1]) {
        const t = new Date(wanted - offsetHours * 3_600_000);
        const p: Record<string, string> = {};
        for (const part of ROME.formatToParts(t)) p[part.type] = part.value;
        if (Number(p.hour) === 0 && Number(p.minute) === 0 && Number(p.day) === new Date(wanted).getUTCDate()) return t;
    }
    return new Date(wanted - 3_600_000);
}

export interface SummaryRange {
    from: Date;
    to: Date;
    previousFrom: Date;
    previousTo: Date;
    /** «vs ieri», «vs i 7 giorni prima». */
    compareLabel: string;
}

export function summaryRange(period: CrmSummaryPeriod, now: Date = new Date()): SummaryRange {
    const today = romeParts(now);
    const day = 24 * 3_600_000;
    if (period === "today") {
        const from = romeMidnight(today.year, today.month, today.day);
        // Ieri fino alla stessa ora: il confronto è alla pari. Mezzogiorno di
        // ieri è sempre nel giorno di calendario giusto, anche al cambio dell'ora.
        const y = romeParts(new Date(from.getTime() - 12 * 3_600_000));
        const previousFrom = romeMidnight(y.year, y.month, y.day);
        return {
            from,
            to: now,
            previousFrom,
            previousTo: new Date(previousFrom.getTime() + (now.getTime() - from.getTime())),
            compareLabel: "vs ieri alla stessa ora"
        };
    }
    if (period === "month") {
        const from = romeMidnight(today.year, today.month, 1);
        const prevMonth = today.month === 1 ? { year: today.year - 1, month: 12 } : { year: today.year, month: today.month - 1 };
        const previousFrom = romeMidnight(prevMonth.year, prevMonth.month, 1);
        return {
            from,
            to: now,
            previousFrom,
            previousTo: new Date(previousFrom.getTime() + (now.getTime() - from.getTime())),
            compareLabel: "vs lo stesso punto del mese prima"
        };
    }
    const days = period === "7d" ? 7 : 30;
    const from = new Date(now.getTime() - days * day);
    return {
        from,
        to: now,
        previousFrom: new Date(from.getTime() - days * day),
        previousTo: from,
        compareLabel: `vs i ${days} giorni prima`
    };
}

/** Variazione in percentuale, o null se la base è troppo piccola per dire qualcosa. */
export const MIN_SUMMARY_BASE = 5;

export function summaryDelta(current: number, previous: number): number | null {
    if (previous < MIN_SUMMARY_BASE) return null;
    return Math.round(((current - previous) / previous) * 100);
}

/** Le fasi del giro da mostrare, nell'ordine della pipeline (Perso a parte). */
export const SUMMARY_FUNNEL: CrmStage[] = [
    "contattato",
    "in_conversazione",
    "telefonata_fissata",
    "telefonata_fatta",
    "demo_fissata",
    "demo_fatta",
    "in_prova",
    "cliente_pagante"
];

export function stageCount(summary: CrmSummary | null, stage: CrmStage): number {
    return Number(summary?.stages?.[stage] ?? 0);
}

/** «45 min», «3 h 10 min», «2 g 4 h», «—». */
export function formatMinutes(minutes: number | null): string {
    if (minutes === null || !Number.isFinite(minutes)) return "—";
    const m = Math.round(minutes);
    if (m < 60) return `${m} min`;
    if (m < 24 * 60) {
        const h = Math.floor(m / 60);
        const r = m % 60;
        return r ? `${h} h ${r} min` : `${h} h`;
    }
    const d = Math.floor(m / (24 * 60));
    const h = Math.floor((m % (24 * 60)) / 60);
    return h ? `${d} g ${h} h` : `${d} g`;
}
