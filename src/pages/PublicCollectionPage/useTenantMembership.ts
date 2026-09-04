import { useEffect, useState } from "react";
import { supabase } from "@/services/supabase/client";
import { fetchMyTenantIds } from "@/services/supabase/permissions";

/**
 * "L'utente corrente ha una relazione reale con QUESTO tenant?" — unica
 * verifica condivisa da tutti gli elementi riservati della pagina pubblica
 * (banner `?simulate=`, barra di controllo formato, `?preview=`).
 *
 * Ritorna:
 *  - `null`  → non ancora noto (nessun tenant, sessione/RPC in corso).
 *              I consumer lo trattano come "non membro" (fail-closed).
 *  - `false` → anonimo, o autenticato ma senza relazione con questo tenant:
 *              esperienza identica a un visitatore qualunque.
 *  - `true`  → owner o membership attiva, qualunque ruolo.
 *
 * "Sessione presente" da sola NON basta (gap cross-tenant): il controllo
 * server-side omologo vive in `resolve-public-catalog` (isTenantMember).
 * Il frontend qui decide solo cosa MOSTRARE, mai cosa è autorizzato.
 */
export function useTenantMembership(tenantId: string | null): boolean | null {
    const [isMember, setIsMember] = useState<boolean | null>(null);

    useEffect(() => {
        if (!tenantId) {
            setIsMember(null);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const {
                    data: { session }
                } = await supabase.auth.getSession();
                if (cancelled) return;
                if (!session) {
                    setIsMember(false);
                    return;
                }
                const ids = await fetchMyTenantIds();
                if (cancelled) return;
                setIsMember(ids.includes(tenantId));
            } catch (err) {
                // Fail-closed: un errore di rete/RPC equivale a "non membro".
                // Nessun toast: la pagina pubblica non deve segnalare nulla
                // a un visitatore che non sa nemmeno dell'esistenza della barra.
                console.debug("[useTenantMembership] membership check failed:", err);
                if (!cancelled) setIsMember(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [tenantId]);

    return isMember;
}
