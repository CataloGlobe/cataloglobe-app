// Riepilogo del CRM via email, ogni lunedì (F1-9), nel guscio comune delle mail.
//
// Lo usano crm-notify (job «weekly») e i test. I numeri vengono
// da crm_summary (migration 20261004020000), letti solo da questa mail (in /admin il Riepilogo è una vista di Lead).

import {
    PARAGRAPH_BODY,
    PARAGRAPH_NOTE,
    renderButton,
    renderCard,
    renderTitle
} from "./emailLayout.ts";

export interface WeeklySummaryNumbers {
    leads_in: number;
    contacted: number;
    stages: Record<string, number>;
    lost: Record<string, number>;
    first_contact_minutes_median: number | null;
    leads_by_source: Record<string, number>;
}

const ROWS: { key: string; label: string }[] = [
    { key: "leads_in", label: "Lead entrati" },
    { key: "contacted", label: "Contattati" },
    { key: "telefonata_fissata", label: "Telefonate fissate" },
    { key: "telefonata_fatta", label: "Telefonate fatte" },
    { key: "demo_fissata", label: "Demo fissate" },
    { key: "demo_fatta", label: "Demo fatte" },
    { key: "in_prova", label: "In prova" },
    { key: "cliente_pagante", label: "Clienti paganti" }
];

const SOURCE_LABEL: Record<string, string> = {
    landing: "Landing",
    meta_form: "Modulo Meta",
    whatsapp: "Chat WhatsApp",
    manuale: "A mano"
};

function value(s: WeeklySummaryNumbers, key: string): number {
    if (key === "leads_in") return Number(s.leads_in ?? 0);
    if (key === "contacted") return Number(s.contacted ?? 0);
    return Number(s.stages?.[key] ?? 0);
}

function escapeHtml(v: string): string {
    return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** «+3», «-1», «=». */
export function formatChange(current: number, previous: number): string {
    const d = current - previous;
    return d === 0 ? "=" : d > 0 ? `+${d}` : `${d}`;
}

function minutesLabel(m: number | null): string {
    if (m === null || !Number.isFinite(m)) return "nessun primo contatto";
    const r = Math.round(m);
    if (r < 60) return `${r} minuti`;
    const h = Math.floor(r / 60);
    const rest = r % 60;
    return rest ? `${h} h ${rest} min` : `${h} h`;
}

export function buildWeeklyEmail(input: {
    current: WeeklySummaryNumbers;
    previous: WeeklySummaryNumbers;
    /** «dal 28 settembre al 4 ottobre». */
    weekLabel: string;
    summaryUrl: string | null;
}): { subject: string; text: string; html: string } {
    const { current, previous, weekLabel, summaryUrl } = input;
    const lines = ROWS.map(r => ({
        label: r.label,
        now: value(current, r.key),
        change: formatChange(value(current, r.key), value(previous, r.key))
    }));
    const lost = Number(current.lost?.obiezione ?? 0) + Number(current.lost?.stop ?? 0);
    const sources = Object.entries(current.leads_by_source ?? {})
        .filter(([, n]) => Number(n) > 0)
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .map(([k, n]) => `${SOURCE_LABEL[k] ?? k} ${n}`);

    const subject = `CRM, la settimana ${weekLabel}: ${value(current, "leads_in")} lead, ${value(current, "telefonata_fatta")} telefonate fatte`;
    const text = [
        `La settimana ${weekLabel}, tra parentesi la differenza con la settimana prima.`,
        "",
        ...lines.map(l => `${l.label}: ${l.now} (${l.change})`),
        `Persi: ${lost} (${Number(current.lost?.obiezione ?? 0)} per obiezione, ${Number(current.lost?.stop ?? 0)} stop)`,
        `Primo contatto, mediana: ${minutesLabel(current.first_contact_minutes_median)}`,
        sources.length ? `Fonti: ${sources.join(", ")}` : "Fonti: nessun lead",
        "",
        summaryUrl ? `Il dettaglio: ${summaryUrl}` : ""
    ]
        .filter((l, i, all) => l !== "" || (i > 0 && all[i - 1] !== ""))
        .join("\n")
        .trim();

    const rows = lines
        .map(
            l =>
                `<tr><td style="padding:6px 12px 6px 0;border-bottom:1px solid #f3f4f6">${escapeHtml(l.label)}</td><td style="padding:6px 12px;text-align:right;border-bottom:1px solid #f3f4f6"><b>${l.now}</b></td><td style="padding:6px 0;color:#6b7280;text-align:right;border-bottom:1px solid #f3f4f6">${l.change}</td></tr>`
        )
        .join("");
    const html = renderCard(
        [
            renderTitle(`CRM, la settimana ${escapeHtml(weekLabel)}`),
            `<p ${PARAGRAPH_BODY}>Accanto a ogni numero la differenza con la settimana prima.</p>`,
            `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;margin:0 0 16px;font-size:15px;color:#111827">${rows}</table>`,
            `<p ${PARAGRAPH_NOTE}>Persi: ${lost} (${Number(current.lost?.obiezione ?? 0)} per obiezione, ${Number(current.lost?.stop ?? 0)} stop).<br>
Primo contatto, mediana: ${escapeHtml(minutesLabel(current.first_contact_minutes_median))}.<br>
${escapeHtml(sources.length ? `Fonti: ${sources.join(", ")}.` : "Fonti: nessun lead.")}</p>`,
            summaryUrl ? `<div style="margin-top:24px">${renderButton("Apri il riepilogo", escapeHtml(summaryUrl))}</div>` : ""
        ],
        { preheader: `${value(current, "leads_in")} lead, ${value(current, "telefonata_fatta")} telefonate fatte` }
    );
    return { subject, text, html };
}

// -----------------------------------------------------------------------------
// La settimana appena finita, da lunedì a lunedì in ora di Roma
// -----------------------------------------------------------------------------
const ROME = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short"
});
const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

function parts(at: Date) {
    const p: Record<string, string> = {};
    for (const part of ROME.formatToParts(at)) p[part.type] = part.value;
    return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), min: Number(p.minute), wd: WEEKDAY[p.weekday] };
}

function romeMidnight(y: number, m: number, d: number): Date {
    const cal = new Date(Date.UTC(y, m - 1, d));
    for (const off of [2, 1]) {
        const t = new Date(cal.getTime() - off * 3_600_000);
        const p = parts(t);
        if (p.h === 0 && p.min === 0 && p.d === cal.getUTCDate()) return t;
    }
    return new Date(cal.getTime() - 3_600_000);
}

export function lastWeekBounds(now: Date): { from: Date; to: Date; previousFrom: Date; key: string; label: string } {
    const p = parts(now);
    const monday = new Date(Date.UTC(p.y, p.m - 1, p.d - (p.wd - 1)));
    const prevMonday = new Date(monday.getTime() - 7 * 86_400_000);
    const prevPrev = new Date(monday.getTime() - 14 * 86_400_000);
    const sunday = new Date(monday.getTime() - 86_400_000);
    const at = (d: Date) => romeMidnight(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    const label = `dal ${prevMonday.getUTCDate()} ${MONTHS[prevMonday.getUTCMonth()]} al ${sunday.getUTCDate()} ${MONTHS[sunday.getUTCMonth()]}`;
    return { from: at(prevMonday), to: at(monday), previousFrom: at(prevPrev), key: prevMonday.toISOString().slice(0, 10), label };
}
