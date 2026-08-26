// Formatter puro orari sede → righe pronte per la pagina di chiusura PDF.
// Nessuna dipendenza da React/DOM (gira client-side puro, riusabile in test).
// Porta la logica di `ActivityHoursSection.formatDaySlots` (che ritorna ReactNode)
// in output stringa + raggruppa i giorni consecutivi con orario identico.

import type { V2ActivityHours } from "@/types/activity-hours";
import type { MenuPdfInfoRow } from "./menuPdfTypes";

/** day_of_week 0=Lun ... 6=Dom (stesso indice di ActivityHoursSection). */
const DAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

/**
 * Valore orario di un singolo giorno:
 *  - fasce multiple (`slot_index`) unite con " · " ordinate per slot_index;
 *  - `is_closed` o nessuna fascia valida → "Chiuso";
 *  - `closes_next_day` → l'orario di chiusura è reso così com'è (mattina dopo),
 *    senza marcatore dedicato in v1.
 */
function dayValue(slots: V2ActivityHours[]): string {
    const open = slots
        .filter(s => !s.is_closed && s.opens_at && s.closes_at)
        .sort((a, b) => a.slot_index - b.slot_index)
        .map(s => `${s.opens_at!.slice(0, 5)}–${s.closes_at!.slice(0, 5)}`);
    return open.length > 0 ? open.join(" · ") : "Chiuso";
}

/**
 * `activity_hours` → righe `{ label, value }` per la pagina di chiusura.
 * Giorni consecutivi con orario identico raggruppati in intervalli
 * (es. "Lun–Ven" · "12:00–15:00 · 19:00–23:00"). Un giorno assente dalla
 * tabella è trattato come "Chiuso". Input vuoto → nessuna riga.
 */
export function formatActivityHours(hours: V2ActivityHours[]): MenuPdfInfoRow[] {
    if (hours.length === 0) return [];

    const byDay = new Map<number, V2ActivityHours[]>();
    for (const h of hours) {
        const list = byDay.get(h.day_of_week) ?? [];
        list.push(h);
        byDay.set(h.day_of_week, list);
    }

    const dayValues: string[] = [];
    for (let d = 0; d < 7; d++) {
        dayValues[d] = dayValue(byDay.get(d) ?? []);
    }

    const rows: MenuPdfInfoRow[] = [];
    let start = 0;
    for (let d = 1; d <= 7; d++) {
        if (d === 7 || dayValues[d] !== dayValues[start]) {
            const label =
                start === d - 1
                    ? DAY_LABELS[start]
                    : `${DAY_LABELS[start]}–${DAY_LABELS[d - 1]}`;
            rows.push({ label, value: dayValues[start] });
            start = d;
        }
    }
    return rows;
}
