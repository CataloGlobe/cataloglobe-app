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
 * L'Elenco (le tavolate) arriva col lotto B-b.
 */
export type ServizioMode = "gestisci";

export interface ServizioModeEntry {
    mode: ServizioMode;
    label: string;
    /** Permessi chiesti su questa sede, tutti. */
    permissions: readonly string[];
    requiresFeature?: PlanFeature;
}

export const SERVIZIO_MODES: readonly ServizioModeEntry[] = [
    // La configurazione della sala: libera da ogni piano, i tavoli servono
    // anche a chi non ordina né prenota online.
    { mode: "gestisci", label: "Gestisci la sala", permissions: ["tables.read"] }
];

/** Chi vede la voce Servizio: chi legge i tavoli o le tavolate della sede (D1). */
export const SERVIZIO_READ_PERMISSIONS: readonly string[] = ["tables.read", "seatings.read"];

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
