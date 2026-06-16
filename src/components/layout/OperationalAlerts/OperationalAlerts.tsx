/**
 * OperationalAlerts — dispatcher GLOBALE tenant-scoped delle notifiche
 * operative "richiesta cliente" (cameriere / conto). Step A dell'epic
 * "dispatcher notifiche globale".
 *
 * Vive nel `MainLayout` (sotto `/business/:businessId`), quindi resta montato
 * attraverso i cambi di pagina interni al business e si rimonta solo al
 * cambio business (effetto keyed su `tenantId`).
 *
 * Cosa fa:
 *   - Apre UNA subscription realtime su `customer_sessions` filtrata
 *     `tenant_id=eq.<tenant corrente>` (INSERT + UPDATE).
 *   - Tiene una mappa in memoria `session_id → { waiter, bill }`. SEEDATA al
 *     mount via `listSessionRequestStates` così le richieste già attive
 *     vengono apprese SENZA notificare (no falsi positivi al mount / cambio
 *     business).
 *   - Rileva la transizione assente/NULL → valorizzato (o timestamp nuovo) su
 *     `waiter_called_at` / `bill_requested_at` e, se l'admin NON è nella
 *     sezione operativa (`/business/:businessId/orders`), dispatcha:
 *       • toast qualificato ("Tavolo {label} · …") con azione "Vai";
 *       • suono via `useNotificationChime` (debounce 3s interno).
 *     Se l'admin è già nella sezione → no-op (le pill in-page bastano).
 *
 * NON scrive in `notifications` (eventi transitori: niente storico, niente
 * intasamento del centro notifiche navbar).
 *
 * Render: null. È solo un punto di aggancio per gli effetti.
 */

import { useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/services/supabase/client";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { useNotificationChime } from "@/hooks/useNotificationChime";
import {
    listSessionRequestStates,
    type SessionRequestState
} from "@/services/supabase/customerSessions";
import { getTable } from "@/services/supabase/tables";

type RequestKind = "waiter" | "bill";

interface KnownState {
    waiter: string | null;
    bill: string | null;
}

/** Subset delle colonne di `customer_sessions` che leggiamo dal payload realtime. */
interface SessionRow {
    id: string;
    current_table_id: string | null;
    waiter_called_at: string | null;
    bill_requested_at: string | null;
}

export function OperationalAlerts(): null {
    const tenantId = useTenantId();
    const { businessId } = useParams<{ businessId: string }>();
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { triggerChime } = useNotificationChime();

    // Valori volatili letti dentro l'handler realtime: via ref così l'effetto
    // di subscribe dipende solo da `tenantId` (no resubscribe ad ogni
    // navigazione o re-render).
    const pathnameRef = useRef(pathname);
    pathnameRef.current = pathname;
    const businessIdRef = useRef(businessId);
    businessIdRef.current = businessId;
    const navigateRef = useRef(navigate);
    navigateRef.current = navigate;
    const showToastRef = useRef(showToast);
    showToastRef.current = showToast;
    const triggerChimeRef = useRef(triggerChime);
    triggerChimeRef.current = triggerChime;

    useEffect(() => {
        if (!tenantId) return;

        let cancelled = false;
        let channel: RealtimeChannel | null = null;
        // Mappa locale all'effetto: si azzera al cambio tenant (effetto re-run).
        const known = new Map<string, KnownState>();

        function dispatchAlert(kind: RequestKind, tableId: string | null): void {
            const bid = businessIdRef.current;
            const path = pathnameRef.current;

            // Context-aware: se sei già nella sezione operativa, l'indicatore
            // in-page (pill sulla card) basta → niente toast/suono.
            if (bid && path.startsWith(`/business/${bid}/orders`)) return;

            void (async () => {
                let label: string | null = null;
                if (tableId && tenantId) {
                    try {
                        const table = await getTable(tableId, tenantId);
                        label = table.label;
                    } catch {
                        // Tavolo non risolvibile (cancellato / RLS): fallback al
                        // toast senza numero. Mai bloccante.
                        label = null;
                    }
                }
                if (cancelled) return;

                const tablePart = label ? `Tavolo ${label} · ` : "";
                const message =
                    kind === "waiter"
                        ? `${tablePart}Cameriere chiamato`
                        : `${tablePart}Conto richiesto`;

                showToastRef.current({
                    message,
                    type: kind === "waiter" ? "warning" : "info",
                    actionLabel: "Vai",
                    onAction: () => {
                        if (bid) navigateRef.current(`/business/${bid}/orders`);
                    }
                });
                triggerChimeRef.current();
            })();
        }

        function handleRow(row: SessionRow | undefined): void {
            if (!row || !row.id) return; // DELETE consegna `new` vuoto

            const prev = known.get(row.id);
            const prevWaiter = prev ? prev.waiter : null;
            const prevBill = prev ? prev.bill : null;
            const newWaiter = row.waiter_called_at ?? null;
            const newBill = row.bill_requested_at ?? null;

            // Aggiorna sempre lo stato noto PRIMA di valutare (dedup raffiche).
            known.set(row.id, { waiter: newWaiter, bill: newBill });

            // Notifica solo su transizione → valorizzato / timestamp nuovo.
            if (newWaiter && newWaiter !== prevWaiter) {
                dispatchAlert("waiter", row.current_table_id);
            }
            if (newBill && newBill !== prevBill) {
                dispatchAlert("bill", row.current_table_id);
            }
        }

        async function init(): Promise<void> {
            // SEED: apprende le richieste già attive senza notificare. Seed →
            // poi subscribe: un evento nella finestra di gap al più produce un
            // alert mancato (mai un falso positivo).
            try {
                const seed: SessionRequestState[] =
                    await listSessionRequestStates(tenantId as string);
                if (cancelled) return;
                for (const s of seed) {
                    known.set(s.id, {
                        waiter: s.waiter_called_at,
                        bill: s.bill_requested_at
                    });
                }
            } catch {
                // Seed fallito: si parte a mappa vuota. Degradazione accettabile
                // (possibili falsi positivi sulle sessioni già attive), mai un
                // crash del layout.
            }
            if (cancelled) return;

            channel = supabase
                .channel(`operational-alerts-${tenantId}-${Date.now()}`)
                .on(
                    "postgres_changes",
                    {
                        event: "INSERT",
                        schema: "public",
                        table: "customer_sessions",
                        filter: `tenant_id=eq.${tenantId}`
                    },
                    payload => handleRow(payload.new as SessionRow | undefined)
                )
                .on(
                    "postgres_changes",
                    {
                        event: "UPDATE",
                        schema: "public",
                        table: "customer_sessions",
                        filter: `tenant_id=eq.${tenantId}`
                    },
                    payload => handleRow(payload.new as SessionRow | undefined)
                )
                .subscribe();
        }

        void init();

        return () => {
            cancelled = true;
            if (channel) {
                void supabase.removeChannel(channel);
                channel = null;
            }
        };
    }, [tenantId]);

    return null;
}
