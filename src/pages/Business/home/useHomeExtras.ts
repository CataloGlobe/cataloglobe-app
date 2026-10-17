import { useEffect, useState } from "react";
import type { UserPermissions } from "@/lib/permissions";
import { canDoOnAnyActivity, isOwnerOrAdmin } from "@/lib/permissions";
import { usePlanFeatures } from "@/lib/planFeatures";
import { listReservationGuests, listGuestVisitMarks } from "@/services/supabase/reservationGuests";
import { listTenantMembers } from "@/services/supabase/team";
import { hasUnreadReply, listMyTickets } from "@/services/supabase/support";
import { isLost, summarizeGuestVisits } from "@/pages/Dashboard/Guests/guestActivity";

/** Le voci di «Da fare» che non vengono da una sede sola (copia «Visual Redesign PR 3»,
 *  `homeTodo`): clienti abituali che non tornano, invito scaduto, risposta dell'assistenza.
 *  Sola lettura; una lettura che fallisce vale «niente», come nella Home già in produzione. */
export type HomeExtras = {
    ready: boolean;
    /** Clienti abituali che non tornano, con le sedi da cui sono passati. */
    lost: { id: string; name: string; sedi: string[] }[];
    /** Email del primo invito scaduto. */
    expiredInvite: string | null;
    /** Oggetto della prima conversazione con una risposta non letta. */
    unreadTicket: string | null;
};

const EMPTY: HomeExtras = { ready: false, lost: [], expiredInvite: null, unreadTicket: null };

export function useHomeExtras(tenantId: string | null | undefined, permissions: UserPermissions | null): HomeExtras {
    const { hasFeature } = usePlanFeatures();
    const reservations = hasFeature("table_reservation");
    const [state, setState] = useState<HomeExtras>(EMPTY);

    useEffect(() => {
        if (!tenantId || !permissions) return;
        let cancelled = false;
        const wide = isOwnerOrAdmin(permissions);
        const seesGuests = reservations && canDoOnAnyActivity(permissions, "guests.read");

        async function loadLost(): Promise<HomeExtras["lost"]> {
            if (!seesGuests) return [];
            const rows = await listReservationGuests(tenantId!, "");
            const marks = await listGuestVisitMarks(
                tenantId!,
                rows.map(g => g.id)
            );
            const today = new Date();
            const activity = summarizeGuestVisits(marks, today);
            return rows
                .filter(g => isLost(activity.get(g.id), today))
                .map(g => ({ id: g.id, name: g.display_name, sedi: activity.get(g.id)?.sedi.map(s => s.id) ?? [] }));
        }

        Promise.all([
            loadLost().catch(() => []),
            wide
                ? listTenantMembers(tenantId)
                      .then(rows => rows.find(m => m.status === "expired")?.email ?? null)
                      .catch(() => null)
                : Promise.resolve(null),
            wide
                ? listMyTickets(tenantId)
                      .then(rows => rows.find(hasUnreadReply)?.subject ?? null)
                      .catch(() => null)
                : Promise.resolve(null)
        ]).then(([lost, expiredInvite, unreadTicket]) => {
            if (!cancelled) setState({ ready: true, lost, expiredInvite, unreadTicket });
        });
        return () => {
            cancelled = true;
        };
    }, [tenantId, permissions, reservations]);

    return state;
}
