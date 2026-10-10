// Email interna «Nuova richiesta demo» per ogni contatto salvato da
// `submit-lead`. Builder PURO, come `supportEmails.ts`: dati in ingresso,
// `{ subject, html, text }` in uscita, niente env, rete o DB.
//
// Ogni valore arriva dal form pubblico: si escapa TUTTO al momento del render
// (`renderDetailRow` non escapa da solo).

import { escapeHtml } from "./emailFormat.ts";
import { renderCard, renderDetailRow, renderInfoBlock, renderTitle, type EmailContent } from "./emailLayout.ts";
import type { LeadData, LeadInterest } from "./leadValidation.ts";


const INTEREST_LABEL: Record<LeadInterest, string> = {
    menu: "Il menù",
    prenotazioni: "Le prenotazioni",
    ordini: "Gli ordini al tavolo"
};

export type LeadEmailMeta = {
    variant: string | null;
    utm_source: string | null;
    utm_medium: string | null;
    utm_campaign: string | null;
    utm_content: string | null;
    utm_term: string | null;
    referrer: string | null;
    landing_path: string | null;
};

/** «giovedì 25 settembre 2026, 14:05» nel fuso di Roma. */
export function formatRomeDateTime(date: Date): string {
    return new Intl.DateTimeFormat("it-IT", {
        timeZone: "Europe/Rome",
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    }).format(date);
}

export function buildLeadNotificationEmail(lead: LeadData, meta: LeadEmailMeta, createdAt: Date): EmailContent {
    const when = formatRomeDateTime(createdAt);
    const interests = lead.interests.length > 0 ? lead.interests.map((i) => INTEREST_LABEL[i]).join(", ") : "—";
    const utm: [string, string | null][] = [
        ["Sorgente", meta.utm_source],
        ["Mezzo", meta.utm_medium],
        ["Campagna", meta.utm_campaign],
        ["Contenuto", meta.utm_content],
        ["Termine", meta.utm_term]
    ];
    const context: [string, string | null][] = [
        ["Variante", meta.variant],
        ["Pagina", meta.landing_path],
        ["Provenienza", meta.referrer]
    ];
    const present = (rows: [string, string | null][]) => rows.filter((r): r is [string, string] => !!r[1]);

    const phone = escapeHtml(lead.phone);
    const contactRows = [
        renderDetailRow("Nome", escapeHtml(lead.name)),
        renderDetailRow("Locale", escapeHtml(lead.venueName)),
        renderDetailRow("Telefono", `<a href="tel:${phone}" style="color:#111827">${phone}</a>`),
        renderDetailRow("Email", lead.email ? escapeHtml(lead.email) : "—"),
        renderDetailRow("Interessi", escapeHtml(interests))
    ];
    const utmRows = present(utm).map(([k, v]) => renderDetailRow(k, escapeHtml(v)));
    const contextRows = present(context).map(([k, v]) => renderDetailRow(k, escapeHtml(v)));

    const html = renderCard(
        [
            renderTitle("Nuova richiesta demo"),
            `<p style="margin:0 0 16px;font-size:15px;color:#374151">${escapeHtml(when)}</p>`,
            renderInfoBlock("Contatto", contactRows),
            utmRows.length > 0 ? renderInfoBlock("Campagna", utmRows) : "",
            contextRows.length > 0 ? renderInfoBlock("Contesto", contextRows) : ""
        ],
        { preheader: `${lead.name} · ${lead.phone} · ${interests}` }
    );

    const line = ([k, v]: [string, string]) => `${k}: ${v}`;
    const text = [
        "Nuova richiesta demo",
        when,
        "",
        line(["Nome", lead.name]),
        line(["Locale", lead.venueName]),
        line(["Telefono", lead.phone]),
        line(["Email", lead.email ?? "—"]),
        line(["Interessi", interests]),
        ...(present(utm).length > 0 ? ["", "Campagna", ...present(utm).map(line)] : []),
        ...(present(context).length > 0 ? ["", "Contesto", ...present(context).map(line)] : [])
    ].join("\n");

    return { subject: `Nuova richiesta demo — ${lead.venueName}`, html, text };
}
