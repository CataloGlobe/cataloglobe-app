import { LayoutRule } from "@/services/supabase/v2/layoutScheduling";

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
                segments.push(`${start}–${end}`);
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

    return segments.join(" • ");
}
