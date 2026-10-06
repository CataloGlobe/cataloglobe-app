// =============================================================================
// Sezione costi del CRM: etichette, importi e promemoria dei rinnovi
// =============================================================================
// Modulo puro senza import: lo usano crm-notify (promemoria su Telegram) e
// /admin/costi via l'alias `@shared/`. Gli addebiti non si calcolano qui: la
// regola è una sola, in SQL (`crm_expense_charges`, mig 20261003120100).
// =============================================================================

export type CrmExpenseKind = "one_off" | "subscription";
export type CrmExpenseCategory = "software" | "advertising" | "services" | "hardware" | "other";
export type CrmBillingInterval = "month" | "year";

export const CRM_EXPENSE_CATEGORIES: readonly CrmExpenseCategory[] = [
    "software",
    "advertising",
    "services",
    "hardware",
    "other"
];

export const CRM_EXPENSE_CATEGORY_LABEL: Record<CrmExpenseCategory, string> = {
    software: "Software e abbonamenti",
    advertising: "Pubblicità",
    services: "Servizi e consulenze",
    hardware: "Attrezzatura",
    other: "Altro"
};

export const CRM_BILLING_INTERVAL_LABEL: Record<CrmBillingInterval, string> = {
    month: "al mese",
    year: "all'anno"
};

/** «1.234,50 €» da centesimi. */
export function formatEuroCents(cents: number): string {
    return new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(cents / 100);
}

/**
 * Importo scritto a mano in euro («109,80», «1.200», «90.5») → centesimi.
 * null se non è un importo positivo con al massimo due decimali.
 */
export function parseEuroToCents(input: string): number | null {
    const raw = input.replace(/\s|€/g, "");
    if (!raw) return null;
    let normalized: string;
    if (raw.includes(",")) {
        // Formato italiano: i punti sono migliaia, la virgola i decimali.
        normalized = raw.replace(/\./g, "").replace(",", ".");
    } else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
        // «1.200»: punti delle migliaia senza decimali.
        normalized = raw.replace(/\./g, "");
    } else {
        normalized = raw;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
    const cents = Math.round(Number(normalized) * 100);
    if (!Number.isFinite(cents) || cents <= 0 || cents > 10_000_000) return null;
    return cents;
}

/** Costo mensile equivalente: l'annuale diviso 12, arrotondato al centesimo. */
export function monthlyEquivalentCents(amountCents: number, interval: CrmBillingInterval): number {
    return interval === "year" ? Math.round(amountCents / 12) : amountCents;
}

/** Giorni tra due date «AAAA-MM-GG» (b - a), senza fusi orari. */
export function daysBetween(a: string, b: string): number {
    const toUtc = (d: string) => {
        const [y, m, day] = d.split("-").map(Number);
        return Date.UTC(y, m - 1, day);
    };
    return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

const WEEKDAYS = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const MONTHS = [
    "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
    "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"
];

/** «lunedì 2 novembre» da «AAAA-MM-GG». */
export function formatDayIt(date: string): string {
    const [y, m, d] = date.split("-").map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return `${WEEKDAYS[weekday]} ${d} ${MONTHS[m - 1]}`;
}

/** «oggi», «domani», «tra 3 giorni». */
export function formatDaysLeft(days: number): string {
    if (days <= 0) return "oggi";
    if (days === 1) return "domani";
    return `tra ${days} giorni`;
}

function escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export type CrmRenewalReminderData = {
    name: string;
    amountCents: number;
    interval: CrmBillingInterval;
    nextChargeOn: string;
    today: string;
    paidBy: string | null;
    costsUrl: string | null;
};

export type CrmRenewalReminderMessage = {
    text: string;
    reply_markup: { inline_keyboard: { text: string; url: string }[][] };
};

/** Messaggio Telegram «si rinnova domani» per tutto il team collegato. */
export function buildRenewalReminderMessage(data: CrmRenewalReminderData): CrmRenewalReminderMessage {
    const when = formatDaysLeft(daysBetween(data.today, data.nextChargeOn));
    const lines = [
        `🔁 <b>${escapeHtml(data.name)} si rinnova ${when}</b>`,
        `${formatDayIt(data.nextChargeOn)}: ${formatEuroCents(data.amountCents)} ${CRM_BILLING_INTERVAL_LABEL[data.interval]}`
    ];
    if (data.paidBy) lines.push(`Lo paga: ${escapeHtml(data.paidBy)}`);
    lines.push("Se non serve più, disdici prima del rinnovo e segna la disdetta in Costi.");
    const keyboard = data.costsUrl ? [[{ text: "Apri i costi nel CRM", url: data.costsUrl }]] : [];
    return { text: lines.join("\n"), reply_markup: { inline_keyboard: keyboard } };
}
