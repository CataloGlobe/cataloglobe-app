/**
 * Incidenti nel CRM (D40, b2 scelta da Alex il 2026-10-05): la banda dello
 * stato in cima e l'anteprima dell'aggiornamento come lo vedranno i clienti.
 * /status non si tocca (resta il link «Vedi /status»), quindi i testi del
 * banner e delle pillole sono una copia: ⚠️ SYNC con `BANNER_TEXT` e
 * `STATUS_PILL_LABEL` in `src/pages/Status/StatusPage.tsx`.
 */
import type {
    CheckStatus,
    IncidentStatus,
    IncidentUpdateEntry,
    OverallStatus,
    StatusIncident
} from "@/services/status/statusPage";

export const STATUS_BANNER_TITLE: Record<OverallStatus, string> = {
    operational: "Tutti i sistemi operativi",
    partial: "Problemi parziali",
    outage: "Disservizio in corso",
    unknown: "Stato non determinabile"
};

export const STATUS_SERVICE_LABEL: Record<CheckStatus | "unknown", string> = {
    up: "Operativo",
    degraded: "Degradato",
    down: "Non disponibile",
    unknown: "Sconosciuto"
};

/**
 * L'incidente come comparirà su /status dopo l'aggiornamento in bozza: il
 * messaggio in coda agli aggiornamenti e, se scelto, il nuovo stato. Con il
 * messaggio vuoto resta com'è.
 */
export function previewIncidentUpdate(
    incident: StatusIncident,
    message: string,
    nextStatus: IncidentStatus | "",
    now: Date = new Date()
): StatusIncident {
    const text = message.trim();
    if (!text) return incident;
    const entry: IncidentUpdateEntry = { timestamp: now.toISOString(), message: text };
    if (nextStatus) entry.status = nextStatus;
    return {
        ...incident,
        status: nextStatus || incident.status,
        updates: [...incident.updates, entry]
    };
}
