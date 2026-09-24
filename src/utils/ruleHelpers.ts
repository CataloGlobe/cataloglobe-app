import { LayoutRule } from "@/services/supabase/layoutScheduling";

const DAY_LABELS: Record<number, string> = {
    1: "Lun",
    2: "Mar",
    3: "Mer",
    4: "Gio",
    5: "Ven",
    6: "Sab",
    0: "Dom"
};

function formatDays(days: number[]): string {
    if (!days || days.length === 0) return "";
    if (days.length === 7) return "Ogni giorno";

    // Check if consecutive (handling wrap-around for week is complex, keep it simple)
    const sorted = [...days].sort((a, b) => a - b);
    const isConsecutive = sorted.every((val, i) => i === 0 || val === sorted[i - 1] + 1);

    if (isConsecutive && sorted.length > 1) {
        return `${DAY_LABELS[sorted[0]]}–${DAY_LABELS[sorted[sorted.length - 1]]}`;
    }

    return sorted.map(d => DAY_LABELS[d]).join(", ");
}

function formatTime(time: string | null): string {
    if (!time) return "";
    return time.slice(0, 5);
}

function formatDate(dateStr: string | null): string {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

export interface RuleSummaryParams {
    time_mode: string;
    days_of_week?: number[] | null;
    time_from?: string | null;
    time_to?: string | null;
    start_at?: string | null;
    end_at?: string | null;
    enabled?: boolean;
}

export function buildRuleSummary(rule: RuleSummaryParams): string {
    const segments: string[] = [];

    // 1. Expired check
    if (rule.time_mode === "window" && rule.end_at) {
        const isExpired = new Date(rule.end_at) < new Date();
        if (isExpired) {
            segments.push("Scaduta");
        }
    }

    // 2. Disabled check
    if (rule.enabled === false) {
        segments.push("Disabilitata");
    }

    // 3. Temporal logic
    if (rule.time_mode === "always") {
        segments.push("Sempre attiva");
    } else {
        // Date range
        if (rule.start_at || rule.end_at) {
            const start = rule.start_at ? formatDate(rule.start_at) : "";
            const end = rule.end_at ? formatDate(rule.end_at) : "";
            if (start && end) {
                segments.push(start === end ? start : `${start}–${end}`);
            } else if (start) {
                segments.push(`Dal ${start}`);
            } else if (end) {
                segments.push(`Fino al ${end}`);
            }
        }

        // Weekly days
        if (rule.days_of_week && rule.days_of_week.length > 0) {
            segments.push(formatDays(rule.days_of_week));
        }

        // Time window
        if (rule.time_from && rule.time_to) {
            segments.push(`${formatTime(rule.time_from)}–${formatTime(rule.time_to)}`);
        }
    }

    if (segments.length === 0) return "Sempre attiva"; // Fallback to always active if window is empty? Or "Nessuna restrizione"?

    return segments.join(" · ");
}

export function isRuleCurrentlyActive(rule: RuleSummaryParams, now: Date): boolean {
    if (rule.enabled === false) return false;

    // 1. Date range check
    if (rule.time_mode === "window") {
        if (rule.start_at && new Date(rule.start_at) > now) return false;
        if (rule.end_at && new Date(rule.end_at) < now) return false;
    }

    // 2. Weekly days check
    if (rule.days_of_week && rule.days_of_week.length > 0) {
        const currentDay = now.getDay();
        if (!rule.days_of_week.includes(currentDay)) return false;
    }

    // 3. Time window check
    if (rule.time_from && rule.time_to) {
        const currentTimeStr = now.toTimeString().slice(0, 5); // "HH:mm"
        const from = rule.time_from.slice(0, 5);
        const to = rule.time_to.slice(0, 5);

        if (from <= to) {
            // Normal range (e.g., 09:00 - 17:00)
            if (currentTimeStr < from || currentTimeStr > to) return false;
        } else {
            // Overnight range (e.g., 22:00 - 04:00)
            if (currentTimeStr < from && currentTimeStr > to) return false;
        }
    }

    return true;
}

/**
 * Cosa fa la regola, col verbo del mockup: «mostra Carta», «cambia 2 prezzi»,
 * «nasconde 2 · non disponibile 1», «mostra 3 contenuti». Null se non c'è
 * ancora niente da dire (una bozza senza menù, senza prodotti o contenuti).
 */
export function describeRuleAction(
    rule: Pick<LayoutRule, "rule_type" | "layout" | "price_overrides" | "visibility_overrides" | "featured_contents">,
    catalogName?: string
): string | null {
    const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    switch (rule.rule_type) {
        case "layout":
            return catalogName ? `mostra ${catalogName}` : null;
        case "price": {
            const n = rule.price_overrides?.length ?? 0;
            return n > 0 ? `cambia ${count(n, "prezzo", "prezzi")}` : null;
        }
        case "visibility": {
            const hidden = (rule.visibility_overrides ?? []).filter(o => o.mode === "hide").length;
            const unavailable = (rule.visibility_overrides ?? []).filter(o => o.mode === "disable").length;
            const parts = [hidden > 0 ? `nasconde ${hidden}` : null, unavailable > 0 ? `non disponibile ${unavailable}` : null];
            return parts.filter(Boolean).join(" · ") || null;
        }
        case "featured": {
            const n = rule.featured_contents?.length ?? 0;
            return n > 0 ? `mostra ${count(n, "contenuto", "contenuti")}` : null;
        }
        default:
            return null;
    }
}
