import { useEffect, useMemo, useState } from "react";
import { listCrmVenues } from "@/services/supabase/crm";
import { listCrmAgentDraftsOpenOrSince } from "@/services/supabase/crmAgentTrial";
import type { CrmAgentDraftRow, CrmVenueListItem } from "@/types/crm";
import { romeTodayStart } from "@/utils/crm/agentsOverview";
import { navSignals, venueWaits, type NavSignal, type VenueWait } from "@/utils/crm/crmHome";

export interface CrmNavData {
    venues: CrmVenueListItem[];
    /** Cosa aspetta voi su ogni locale (Cerca: «Aspettano risposta» e l'attesa a destra). */
    waits: Map<string, VenueWait>;
    home: NavSignal;
    lead: NavSignal;
}

const EMPTY: NavSignal = { count: 0, ring: null };

/**
 * I dati della barra del CRM (contatori e Cerca ⌘K): una lettura dei locali e
 * delle bozze aperte, rifatta a ogni cambio di pagina (niente polling).
 * Ogni lettura sta da sola: se una tabella manca, il suo contatore si spegne
 * e il resto funziona.
 */
export function useCrmNavData(pathname: string): CrmNavData {
    const [venues, setVenues] = useState<CrmVenueListItem[]>([]);
    const [drafts, setDrafts] = useState<CrmAgentDraftRow[]>([]);

    useEffect(() => {
        let cancelled = false;
        void listCrmVenues()
            .then(rows => {
                if (!cancelled) setVenues(rows);
            })
            .catch(() => {
                if (!cancelled) setVenues([]);
            });
        void listCrmAgentDraftsOpenOrSince(romeTodayStart(new Date()))
            .then(rows => {
                if (!cancelled) setDrafts(rows);
            })
            .catch(() => {
                if (!cancelled) setDrafts([]);
            });
        return () => {
            cancelled = true;
        };
    }, [pathname]);

    return useMemo(() => {
        if (venues.length === 0 && drafts.length === 0) return { venues, waits: new Map(), home: EMPTY, lead: EMPTY };
        const now = new Date();
        return { venues, waits: venueWaits({ drafts, venues, now }), ...navSignals({ drafts, venues, now }) };
    }, [venues, drafts]);
}
