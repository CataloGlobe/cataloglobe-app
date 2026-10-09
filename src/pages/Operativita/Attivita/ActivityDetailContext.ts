import { useOutletContext } from "react-router-dom";
import type { V2Activity } from "@/types/activity";
import type { V2ActivityHours } from "@/types/activity-hours";
import type { ActivityDraft } from "./useActivityDraft";
import type { SchedaPart } from "./scheda/schedaCopy";

/** Le pagine della sede con un'etichetta (titolo del browser, picker in
 *  compatto). «Cosa vedono i clienti» sta fuori dalla Scheda, ma il titolo lo
 *  prende da qui. */
export const ACTIVITY_SECTIONS = [
    "anagrafica",
    "come-lavorate",
    "orari",
    "ordini-al-tavolo",
    "prenotazioni-online",
    "sala",
    "pubblicazione",
    "cosa-vedono"
] as const;
export type ActivitySection = (typeof ACTIVITY_SECTIONS)[number];

export const ACTIVITY_SECTION_LABELS: Record<ActivitySection, string> = {
    anagrafica: "Scheda",
    "come-lavorate": "Scheda",
    orari: "Orari",
    "ordini-al-tavolo": "Ordini al tavolo",
    "prenotazioni-online": "Prenotazioni",
    sala: "Sala",
    pubblicazione: "Pubblicazione",
    "cosa-vedono": "Cosa vedono i clienti"
};

/**
 * Cosa il parent (`ActivityDetailPage`) dà alle rotte: la sede, i dati letti
 * una volta per tutte (orari, ragione sociale), i permessi e il draft unico.
 */
export interface ActivityDetailOutletContext {
    activity: V2Activity;
    businessId: string;
    tenantId: string;
    /** Ricarica la sede dopo un'azione immediata. */
    reload: () => Promise<void>;
    hours: V2ActivityHours[];
    isHoursLoading: boolean;
    loadHours: () => Promise<void>;
    /** `undefined` = in caricamento, `null` = assente. */
    legalName: string | null | undefined;
    canManage: boolean;
    canManageHours: boolean;
    canDelete: boolean;
    draft: ActivityDraft;
    /** Va a un'altra sezione della stessa sede; sulla Scheda, `part` apre
     *  quella parte a fuoco (`?parte=`, Officina 3). */
    goToSection: (section: ActivitySection, hash?: string, part?: SchedaPart) => void;
}

export function useActivityDetail(): ActivityDetailOutletContext {
    return useOutletContext<ActivityDetailOutletContext>();
}
