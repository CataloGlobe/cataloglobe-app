import { useCallback, useEffect, useRef, useState } from "react";
import { respondReservation } from "@/services/supabase/reservations";
import type { ReservationStatus } from "@/types/reservation";

export type DeferredAction = "confirm" | "decline" | "cancel";

const ACTION_TO_STATUS: Record<DeferredAction, ReservationStatus> = {
    confirm: "confirmed",
    decline: "declined",
    cancel:  "cancelled"
};

interface PendingCommit {
    reservationId: string;
    action: DeferredAction;
    timerId: number;
}

interface UseDeferredCommitOptions {
    /** Notification on commit success (caller usually reloads list). */
    onCommitSuccess: () => Promise<void> | void;
    /** Notification on commit failure (caller shows toast). */
    onCommitError: (reservationId: string, message: string) => void;
    /** Undo window in ms. Default 5000. */
    delayMs?: number;
}

/**
 * Deferred-commit queue for reservation actions (confirm / decline / cancel).
 *
 * On `schedule(id, action)`:
 *   1. Sets an optimistic `overrides` entry so the UI immediately reflects
 *      the target status.
 *   2. Starts a timer; when it fires, calls `respondReservation` for real.
 *
 * `cancel(id)` aborts the pending commit (no edge function call, no email).
 *
 * Only ONE pending action per reservation id is allowed. Scheduling a second
 * action on a different id while one is in flight: the existing one is
 * flushed (committed immediately) before the new one is enqueued.
 *
 * On component unmount, every still-pending commit is flushed (fire-and-
 * forget) so actions are never lost.
 */
export function useDeferredCommit({
    onCommitSuccess,
    onCommitError,
    delayMs = 5000
}: UseDeferredCommitOptions) {
    const [overrides, setOverrides] = useState<Map<string, ReservationStatus>>(
        () => new Map()
    );
    const pendingRef = useRef<Map<string, PendingCommit>>(new Map());

    // Mount guard. Set to false from the unmount cleanup so any in-flight
    // commit that resolves after the component left the tree skips the
    // setState + caller callbacks (no React "set state on unmounted" warning,
    // no ghost refetch via onSuccess → loadData).
    const isMountedRef = useRef(true);

    // Keep latest callbacks in refs so commitNow always reads fresh handlers
    // (otherwise it'd use stale closures).
    const onSuccessRef = useRef(onCommitSuccess);
    const onErrorRef = useRef(onCommitError);
    useEffect(() => {
        onSuccessRef.current = onCommitSuccess;
        onErrorRef.current = onCommitError;
    });

    const removeOverride = useCallback((id: string) => {
        setOverrides(prev => {
            if (!prev.has(id)) return prev;
            const next = new Map(prev);
            next.delete(id);
            return next;
        });
    }, []);

    const commitNow = useCallback(
        async (id: string) => {
            const pending = pendingRef.current.get(id);
            if (!pending) return;
            window.clearTimeout(pending.timerId);
            pendingRef.current.delete(id);
            try {
                await respondReservation(id, pending.action);
                // If the component unmounted while the request was in
                // flight, drop setState + onSuccess (would refetch a page
                // that no longer exists).
                if (!isMountedRef.current) return;
                removeOverride(id);
                await onSuccessRef.current();
            } catch (err) {
                const e = err as Error & {
                    code?: string;
                    details?: { current_status?: string };
                };
                let message: string;
                if (e.code === "INVALID_TRANSITION") {
                    const cur = e.details?.current_status;
                    message =
                        cur && cur !== "unknown"
                            ? `Stato cambiato (ora: ${cur}). Aggiorna la lista.`
                            : "Stato cambiato nel frattempo. Aggiorna la lista.";
                } else if (e.code === "RESERVATION_NOT_FOUND") {
                    message = "Prenotazione non trovata o permessi insufficienti.";
                } else if (e.code === "UNAUTHORIZED") {
                    message = "Sessione scaduta. Accedi di nuovo.";
                } else {
                    message = e.message || "Errore durante l'operazione.";
                }
                // Same unmount guard for the error path: no toast on a
                // page that left the tree.
                if (!isMountedRef.current) {
                    console.error(
                        "[useDeferredCommit] commit failed after unmount:",
                        err
                    );
                    return;
                }
                removeOverride(id);
                onErrorRef.current(id, message);
            }
        },
        [removeOverride]
    );

    const schedule = useCallback(
        (id: string, action: DeferredAction) => {
            // Flush any other pending action before queueing a new one (one
            // at a time). Same-id replays simply replace.
            for (const otherId of Array.from(pendingRef.current.keys())) {
                if (otherId !== id) {
                    void commitNow(otherId);
                }
            }
            const existing = pendingRef.current.get(id);
            if (existing) {
                window.clearTimeout(existing.timerId);
                pendingRef.current.delete(id);
            }

            const optimistic = ACTION_TO_STATUS[action];
            setOverrides(prev => {
                const next = new Map(prev);
                next.set(id, optimistic);
                return next;
            });

            const timerId = window.setTimeout(() => {
                void commitNow(id);
            }, delayMs);

            pendingRef.current.set(id, { reservationId: id, action, timerId });
        },
        [commitNow, delayMs]
    );

    const cancel = useCallback(
        (id: string) => {
            const p = pendingRef.current.get(id);
            if (!p) return;
            window.clearTimeout(p.timerId);
            pendingRef.current.delete(id);
            removeOverride(id);
        },
        [removeOverride]
    );

    // Flush all pending commits on unmount: the user already issued the
    // confirm/decline/cancel action; navigating away must not lose the
    // DB write. Fire-and-forget the edge function call ONLY — no setState,
    // no onSuccess/onError callbacks (the component left the tree, the
    // caller's `loadData` would now refetch on a page that no longer
    // exists). Errors during the unmount flush are swallowed and logged.
    useEffect(() => {
        return () => {
            isMountedRef.current = false;
            const pending = pendingRef.current;
            for (const [, p] of pending) {
                window.clearTimeout(p.timerId);
                void respondReservation(p.reservationId, p.action).catch(
                    err => {
                        console.error(
                            "[useDeferredCommit] unmount-flush commit failed:",
                            err
                        );
                    }
                );
            }
            pending.clear();
        };
    }, []);

    return { overrides, schedule, cancel };
}
