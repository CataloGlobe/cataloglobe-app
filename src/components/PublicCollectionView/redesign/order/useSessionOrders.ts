import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cancelOrderCustomer, getOrdersForSession, subscribeToSessionOrders } from "@/services/supabase/orders";
import type { SessionOrderSummary } from "@/types/orders";

const isExpired = (message: string) => message.toLowerCase().includes("scaduta");

/**
 * Gli ordini già inviati dal tavolo, finché «Il tuo ordine» o la sua conferma
 * sono nel foglio (`active`): lettura all'apertura e dopo ogni invio, stato dal
 * vivo (stessi servizi e stessi casi della vecchia tab Ordini), «Annulla ordine».
 * Una sola lettura e un solo canale per le due pagine.
 */
export function useSessionOrders(jwt: string | null, refreshKey: number, onSessionExpired: () => void, active = true) {
    const { t } = useTranslation("public");
    const [orders, setOrders] = useState<SessionOrderSummary[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [cancellingId, setCancellingId] = useState<string | null>(null);
    // Il chiamante passa una funzione nuova a ogni render: la lettura non deve ripartire per questo.
    const expiredRef = useRef(onSessionExpired);
    // Gli ordini noti, per il realtime (un updater di setState non lancia letture).
    const ordersRef = useRef<SessionOrderSummary[] | null>(null);
    // Solo l'ultima lettura partita scrive: una lenta non copre una più nuova.
    const loadSeq = useRef(0);
    useEffect(() => {
        expiredRef.current = onSessionExpired;
        ordersRef.current = orders;
    });

    const load = useCallback(async () => {
        const seq = ++loadSeq.current;
        // Foglio chiuso: niente letture. Gli ordini restano (la pagina che esce non torna a «sto leggendo»), si rileggono alla riapertura.
        if (!active) return;
        if (!jwt) {
            setOrders([]);
            return;
        }
        try {
            const data = await getOrdersForSession(jwt);
            if (seq !== loadSeq.current) return;
            setOrders([...data.orders].sort((a, b) => b.created_at.localeCompare(a.created_at)));
            setError(null);
        } catch (err) {
            if (seq !== loadSeq.current) return;
            if (err instanceof Error && isExpired(err.message)) {
                expiredRef.current();
                return;
            }
            setError(t("ordering.error_loading"));
            setOrders(prev => prev ?? []);
        }
    }, [jwt, active, t]);

    useEffect(() => {
        void load();
    }, [load, refreshKey]);

    useEffect(() => {
        if (!jwt || !active) return;
        const channel = subscribeToSessionOrders(jwt, {
            onUpdate: updated =>
                setOrders(prev =>
                    prev?.map(order =>
                        order.id === updated.id
                            ? {
                                  ...order,
                                  status: updated.status,
                                  total_amount: updated.total_amount,
                                  notes: updated.notes,
                                  order_group_id: updated.order_group_id
                              }
                            : order
                    ) ?? prev
                ),
            // Le righe non arrivano col realtime: un ordine nuovo si rilegge.
            onInsert: inserted => {
                if (!ordersRef.current?.some(order => order.id === inserted.id)) void load();
            },
            onError: err => {
                const message = err.message.toLowerCase();
                if (message.includes("token") || message.includes("jwt") || message.includes("auth")) expiredRef.current();
            }
        });
        return () => {
            channel?.unsubscribe();
        };
    }, [jwt, active, load]);

    const cancel = useCallback(
        async (orderId: string): Promise<boolean> => {
            if (!jwt) return false;
            setCancellingId(orderId);
            try {
                await cancelOrderCustomer(jwt, orderId);
                await load();
                return true;
            } catch (err) {
                const message = err instanceof Error ? err.message : "";
                if (isExpired(message)) {
                    expiredRef.current();
                    return false;
                }
                if (message === "INVALID_STATE_TRANSITION") {
                    // Prima la rilettura (che spegne gli errori), poi il perché.
                    await load();
                    setError(t("ordering.error_cancel_invalid"));
                    return false;
                }
                setError(t("ordering.error_cancel"));
                return false;
            } finally {
                setCancellingId(null);
            }
        },
        [jwt, load, t]
    );

    return { orders, error, cancellingId, cancel };
}

export type SessionOrdersState = ReturnType<typeof useSessionOrders>;
