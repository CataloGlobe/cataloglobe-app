import type { OrderingStateReason, V2CustomerSession } from "@/types/orders";

type Maintenance = { reason: OrderingStateReason; message: string } | null;

type Deps = {
    setBillRequestedAt: (value: string | null) => void;
    setWaiterCalledAt: (value: string | null) => void;
    setDiscoveredMaintenance: (update: (prev: Maintenance) => Maintenance) => void;
    serviceEndedMessage: () => string;
    now?: () => number;
    warn?: (...args: unknown[]) => void;
};

/**
 * Callback della subscription realtime customer_sessions di CollectionView.
 * Separati dal componente per poterli provare senza render.
 *
 * onError è volutamente NON distruttivo: channel-error/timeout è transitorio
 * (blip di rete, riconnessione WS, anche con messaggi «token»/«jwt»), quindi
 * mai toccare sessionStorage né lo stato sessione, altrimenti un blip slogga
 * il cliente a metà ordine. L'invalidazione resta ai path autoritativi:
 * onUpdate con expires_at <= now (maintenance "table_closed") e il 401
 * SESSION_EXPIRED al submit.
 */
export function createCustomerSessionRealtimeHandlers(deps: Deps) {
    const now = deps.now ?? Date.now;
    const warn = deps.warn ?? console.warn;
    return {
        onUpdate: (updatedSession: V2CustomerSession) => {
            deps.setBillRequestedAt(updatedSession.bill_requested_at ?? null);
            deps.setWaiterCalledAt(updatedSession.waiter_called_at ?? null);
            const expiresAt = updatedSession.expires_at;
            if (expiresAt && new Date(expiresAt).getTime() <= now()) {
                // Idempotente: setta solo se nessun maintenance gia attivo.
                deps.setDiscoveredMaintenance(prev => prev ?? {
                    reason: "table_closed",
                    message: deps.serviceEndedMessage()
                });
            }
        },
        onError: (err: Error) => {
            warn(
                "[CollectionView] customer_sessions realtime channel error (transient, session preserved):",
                err.message
            );
        }
    };
}
