/**
 * `schedules.days_of_week` come va scritto: null (ogni giorno) oppure i
 * giorni scelti, mai un array vuoto. Per il resolver `[]` vuol dire «mai»
 * (`isTimeRuleActiveNow` in _shared/scheduleCompetition.ts): una regola
 * salvata così non si accende in nessun giorno.
 */
export function daysOfWeekForDb(days: number[] | null | undefined): number[] | null {
    return days && days.length > 0 ? days : null;
}
