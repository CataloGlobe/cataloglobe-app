import { canDoOnActivity, type UserPermissions } from "@/lib/permissions";
import type { PlanFeature } from "@/lib/planFeatures";

/**
 * I modi della pagina Servizio di una sede (§18.2, lotto B-a). Puro: niente
 * router, niente DB. La pagina, la sidebar e l'atterraggio leggono questo
 * elenco, così «dove si arriva» e «cosa si vede» non divergono.
 *
 * Un modo è:
 * - `usable` — permesso su questa sede e piano che lo comprende;
 * - `locked` — permesso sì, piano no: si vede col lucchetto, non ci si
 *   atterra mai e non si apre;
 * - `hidden` — senza permesso non si mostra.
 *
 * L'Elenco (le tavolate, lotto B-b) è il primo: col piano Pro si atterra lì.
 * La Sala è l'ultimo e non ha lucchetto: col piano Base si atterra lì.
 */
export type ServizioMode = "elenco" | "mappa" | "sala";

export interface ServizioModeEntry {
    mode: ServizioMode;
    label: string;
    /** Permessi chiesti su questa sede, tutti. */
    permissions: readonly string[];
    requiresFeature?: PlanFeature;
}

export const SERVIZIO_MODES: readonly ServizioModeEntry[] = [
    // La sala del momento (In sala adesso · In arrivo · Concluse): era la
    // scheda Servizio di Prenotazioni, con i suoi gate. Legge prenotazioni e
    // tavolate; senza prenotazioni nel piano ha il lucchetto.
    {
        mode: "elenco",
        label: "Elenco",
        permissions: ["reservations.read", "seatings.read"],
        requiresFeature: "table_reservation"
    },
    // La sala per zona, col pannello del conto: era Comande → Tavoli. Legge
    // tavoli e ordini; senza ordini al tavolo nel piano ha il lucchetto.
    { mode: "mappa", label: "Mappa", permissions: ["tables.read", "orders.read"], requiresFeature: "table_ordering" },
    // La configurazione della sala (tavoli, zone, QR): era la tab Sala della
    // Scheda (SV3); con la Scheda C+++ torna qui (Officina 3, versione 5).
    // I vecchi `?modo=gestisci` portano qui.
    { mode: "sala", label: "Sala", permissions: ["tables.read"] }
];

/**
 * Chi vede la voce Servizio: chi ha i permessi di almeno un modo, anche se il
 * piano lo chiude col lucchetto. Con la Sala basta leggere i tavoli.
 */
export function canSeeServizio(permissions: UserPermissions, activityId: string): boolean {
    return SERVIZIO_MODES.some(entry => entry.permissions.every(p => canDoOnActivity(permissions, p, activityId)));
}

export type ModeAccess = "usable" | "locked" | "hidden";

export function modeAccess(
    entry: ServizioModeEntry,
    permissions: UserPermissions,
    hasFeature: (feature: PlanFeature) => boolean,
    activityId: string
): ModeAccess {
    if (!entry.permissions.every(p => canDoOnActivity(permissions, p, activityId))) return "hidden";
    if (entry.requiresFeature && !hasFeature(entry.requiresFeature)) return "locked";
    return "usable";
}

export function isServizioMode(value: string | null | undefined): value is ServizioMode {
    return SERVIZIO_MODES.some(m => m.mode === value);
}

/** I vecchi nomi dei modi: «Gestisci la sala» è la Sala. */
export function normalizeServizioMode(value: string | null): string | null {
    return value === "gestisci" ? "sala" : value;
}

/**
 * Il modo da mostrare: quello chiesto (`?modo=`) se si può usare, altrimenti
 * il primo usabile nell'ordine dei modi. `null` = nessun modo usabile, la
 * pagina dice che non c'è accesso.
 */
export function resolveServizioMode(
    requested: string | null | undefined,
    permissions: UserPermissions,
    hasFeature: (feature: PlanFeature) => boolean,
    activityId: string
): ServizioMode | null {
    const usable = SERVIZIO_MODES.filter(m => modeAccess(m, permissions, hasFeature, activityId) === "usable");
    return usable.find(m => m.mode === requested)?.mode ?? usable[0]?.mode ?? null;
}
