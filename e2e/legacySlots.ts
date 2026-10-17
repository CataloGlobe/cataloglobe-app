import type { Row } from "./restStub";

/**
 * Le fasce di `schedule_slots` dalle colonne di oggi di `schedules`, come il
 * ponte del database (`schedule_slots_from_legacy`, mig 20261014090000): il
 * trigger le scrive a ogni salvataggio, quindi uno stub con regole a fascia
 * deve averle, altrimenti il giudice le legge come «sempre». «Sempre» senza
 * fasce; «Fascia» senza ore tutto il giorno nei giorni scelti (senza giorni,
 * nessuna fascia); fine 23:59 = 1440; fine non dopo l'inizio = mai.
 */
export function legacySlots(schedules: readonly Row[]): Row[] {
  const minutes = (hhmm: unknown): number | null => {
    if (typeof hhmm !== "string") return null;
    const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
    return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m;
  };
  return schedules.flatMap((s) => {
    if (s.time_mode !== "window") return [];
    const days = (s.days_of_week as number[] | null | undefined) ?? null;
    const slot = (d: number[] | null, start: number, end: number): Row[] => [
      {
        id: `${String(s.id)}:0`,
        schedule_id: s.id,
        days_of_week: d,
        start_minute: start,
        end_minute: end,
        sort_order: 0,
      },
    ];
    const from = minutes(s.time_from);
    let to = minutes(s.time_to);
    if (!s.time_from || !s.time_to)
      return days === null ? [] : slot(days, 0, 1440);
    if (from === null || to === null) return slot([], 0, 1440);
    if (to === 1439 && from < 1439) to = 1440;
    if (to <= from) return slot([], 0, 1440);
    return slot(days, from, to);
  });
}
