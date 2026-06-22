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
 *     `waiter_called_at` / `bill_requested_at` e, a meno che NON sia in primo
 *     piano la tab "Tavoli" di /orders (l'unica che mostra già le pill),
 *     dispatcha:
 *       • toast qualificato ("{label} · …") con azione "Vai";
 *       • suono via `useNotificationChime` (debounce 3s interno).
 *     Sulla tab "Tavoli" → no-op (la pill in-page basta). In Comande/Storico
 *     e fuori da /orders → alert pieno.
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
import type { V2Order } from "@/types/orders";

type RequestKind = "waiter" | "bill";

/**
 * Finestra di aggregazione trailing per i nuovi ordini: il primo INSERT
 * avvia il timer, gli arrivi successivi entro la finestra incrementano il
 * conteggio, allo scadere parte UN solo alert (suono + eventuale toast
 * aggregato). Allineata al debounce 3s del chime → una raffica = un bip.
 */
const ORDER_AGGREGATE_MS = 3000;

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
    const { pathname, search } = useLocation();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { triggerChime } = useNotificationChime();

    // Valori volatili letti dentro l'handler realtime: via ref così l'effetto
    // di subscribe dipende solo da `tenantId` (no resubscribe ad ogni
    // navigazione o re-render).
    const pathnameRef = useRef(pathname);
    pathnameRef.current = pathname;
    // Query string corrente: la tab attiva di /orders è sincronizzata qui da
    // Orders.tsx come `?tab=`. Letta via ref per lo stesso motivo di pathname
    // (no stale closure nell'handler realtime).
    const searchRef = useRef(search);
    searchRef.current = search;
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

        // ── Aggregazione nuovi ordini (trailing 3s) ──
        // Stato locale all'effetto: si azzera al cambio tenant.
        let orderCount = 0;
        let orderTimer: number | null = null;
        const orderSeen = new Set<string>(); // dedup per-id nella finestra

        function dispatchAlert(kind: RequestKind, tableId: string | null): void {
            const bid = businessIdRef.current;
            const path = pathnameRef.current;

            // Context-aware: sopprimi SOLO quando è in primo piano la vista che
            // mostra già le pill, cioè la tab "Tavoli" di /orders. In Comande/
            // Storico e fuori da /orders l'alert passa.
            // Default tab senza `?tab=` = "comande" (vedi Orders.tsx), quindi
            // l'assenza del param NON sopprime.
            const onOrders = !!bid && path.startsWith(`/business/${bid}/orders`);
            const tab = new URLSearchParams(searchRef.current).get("tab") ?? "comande";
            if (onOrders && tab === "tavoli") return;

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

                const tablePart = label ? `${label} · ` : "";
                const message =
                    kind === "waiter"
                        ? `${tablePart}Cameriere chiamato`
                        : `${tablePart}Conto richiesto`;

                showToastRef.current({
                    message,
                    type: kind === "waiter" ? "warning" : "info",
                    actionLabel: "Vai",
                    onAction: () => {
                        if (bid) navigateRef.current(`/business/${bid}/orders?tab=tavoli`);
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

        // Flush della finestra ordini. ⚠️ Asimmetria VOLUTA (≠ waiter/bill):
        //   - SUONO sempre (anche sulla tab Comande): gli ordini non si perdono.
        //   - TOAST solo se NON sei sulla tab Comande di /orders (lì il kanban
        //     già li mostra). Default tab = "comande" → param assente sopprime.
        // Condizioni valutate QUI, al flush, leggendo i ref freschi — NON
        // catturate all'arrivo del primo ordine.
        function flushOrders(): void {
            const count = orderCount;
            orderCount = 0;
            orderTimer = null;
            orderSeen.clear();
            if (cancelled || count <= 0) return;

            // Suono SEMPRE (tono "order", distinto da waiter/bill).
            triggerChimeRef.current("order");

            const bid = businessIdRef.current;
            const path = pathnameRef.current;
            const onOrders = !!bid && path.startsWith(`/business/${bid}/orders`);
            const tab = new URLSearchParams(searchRef.current).get("tab") ?? "comande";
            // Toast soppresso solo sulla tab Comande (indicatore già presente).
            if (onOrders && tab === "comande") return;

            const message = count === 1 ? "Nuovo ordine" : `${count} nuovi ordini`;
            showToastRef.current({
                message,
                type: "info",
                actionLabel: "Vai",
                onAction: () => {
                    if (bid) navigateRef.current(`/business/${bid}/orders?tab=comande`);
                }
            });
        }

        function handleOrderInsert(row: V2Order | undefined): void {
            // Solo arrivi genuini di nuovi ordini (submitted, non rettifiche) —
            // stesso criterio di useActiveOrdersRealtime.handleInsert.
            if (!row || row.status !== "submitted" || row.is_rectification) return;
            if (orderSeen.has(row.id)) return; // dedup per-id nella finestra
            orderSeen.add(row.id);
            orderCount += 1;
            // Primo ordine della finestra → avvia il timer trailing.
            if (orderTimer === null) {
                orderTimer = window.setTimeout(flushOrders, ORDER_AGGREGATE_MS);
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
                .on(
                    "postgres_changes",
                    {
                        event: "INSERT",
                        schema: "public",
                        table: "orders",
                        filter: `tenant_id=eq.${tenantId}`
                    },
                    payload => handleOrderInsert(payload.new as V2Order | undefined)
                )
                .subscribe();
        }

        void init();

        return () => {
            cancelled = true;
            if (orderTimer !== null) {
                window.clearTimeout(orderTimer);
                orderTimer = null;
            }
            if (channel) {
                void supabase.removeChannel(channel);
                channel = null;
            }
        };
    }, [tenantId]);

    return null;
}
