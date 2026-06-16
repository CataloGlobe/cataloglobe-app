import { useCallback, useEffect, useState } from "react";
import { ConciergeBell, Receipt } from "lucide-react";
import PublicSheet from "../PublicSheet/PublicSheet";
import { callWaiter, requestBill } from "@/services/supabase/customerSessions";
import { getOrdersForSession } from "@/services/supabase/orders";
import styles from "./AssistanceSheet.module.scss";

const COOLDOWN_S = 60;

type Props = {
    isOpen: boolean;
    onClose: () => void;
    /** Dati minimi della sessione tavolo. NULL quando nessuna sessione attiva. */
    session: { jwt: string; tableLabel: string; tableZone?: string | null } | null;
    /** Stato "Chiedi il conto" — single source of truth in CollectionView (synced via realtime). */
    billRequestedAt: string | null;
    onBillRequestedAtChange: (next: string | null) => void;
    /** Stato "Chiama cameriere" — single source of truth in CollectionView (synced via realtime). */
    waiterCalledAt: string | null;
    onWaiterCalledAtChange: (next: string | null) => void;
};

export default function AssistanceSheet({
    isOpen,
    onClose,
    session,
    billRequestedAt,
    onBillRequestedAtChange,
    waiterCalledAt,
    onWaiterCalledAtChange,
}: Props) {

    // ── Waiter cooldown countdown ─────────────────────────────────────────
    const [cooldownLeft, setCooldownLeft] = useState(0);
    useEffect(() => {
        if (!waiterCalledAt) {
            setCooldownLeft(0);
            return;
        }
        const compute = () => {
            const elapsed = (Date.now() - new Date(waiterCalledAt).getTime()) / 1000;
            return Math.max(0, Math.ceil(COOLDOWN_S - elapsed));
        };
        setCooldownLeft(compute());
        const id = setInterval(() => {
            const rem = compute();
            setCooldownLeft(rem);
            if (rem === 0) clearInterval(id);
        }, 1000);
        return () => clearInterval(id);
    }, [waiterCalledAt]);

    // ── Gating conto: ha ordini in lavorazione? ───────────────────────────
    const [hasInProgressOrders, setHasInProgressOrders] = useState(false);
    useEffect(() => {
        if (!isOpen || !session?.jwt) {
            setHasInProgressOrders(false);
            return;
        }
        let cancelled = false;
        getOrdersForSession(session.jwt)
            .then(result => {
                if (!cancelled) {
                    setHasInProgressOrders(
                        result.orders.some(
                            o => o.status === "submitted" || o.status === "acknowledged"
                        )
                    );
                }
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [isOpen, session?.jwt]);

    // ── Handlers ──────────────────────────────────────────────────────────
    const [isCallingWaiter, setIsCallingWaiter] = useState(false);
    const [waiterError, setWaiterError] = useState<string | null>(null);
    const [isRequestingBill, setIsRequestingBill] = useState(false);
    const [billError, setBillError] = useState<string | null>(null);

    const handleCallWaiter = useCallback(async () => {
        if (!session?.jwt || isCallingWaiter || cooldownLeft > 0) return;
        setIsCallingWaiter(true);
        setWaiterError(null);
        try {
            const result = await callWaiter(session.jwt);
            onWaiterCalledAtChange(result.waiter_called_at);
        } catch (err) {
            setWaiterError(err instanceof Error ? err.message : "Errore durante la chiamata al cameriere");
        } finally {
            setIsCallingWaiter(false);
        }
    }, [session?.jwt, isCallingWaiter, cooldownLeft, onWaiterCalledAtChange]);

    const handleRequestBill = useCallback(async () => {
        if (!session?.jwt || isRequestingBill || !!billRequestedAt || hasInProgressOrders) return;
        setIsRequestingBill(true);
        setBillError(null);
        try {
            const result = await requestBill(session.jwt);
            onBillRequestedAtChange(result.bill_requested_at);
        } catch (err) {
            setBillError(err instanceof Error ? err.message : "Errore durante la richiesta del conto");
        } finally {
            setIsRequestingBill(false);
        }
    }, [session?.jwt, isRequestingBill, billRequestedAt, hasInProgressOrders, onBillRequestedAtChange]);

    const inCooldown = cooldownLeft > 0;

    const tableTitle = session
        ? session.tableZone
            ? `${session.tableZone} · ${session.tableLabel}`
            : session.tableLabel
        : "";

    return (
        <PublicSheet
            isOpen={isOpen}
            onClose={onClose}
            ariaLabel="Assistenza al tavolo"
            headerContent={
                <div className={styles.header}>
                    <span className={styles.headerTitle}>Assistenza</span>
                    {tableTitle && (
                        <span className={styles.headerSub}>{tableTitle}</span>
                    )}
                </div>
            }
        >
            <div className={styles.content}>

                {/* Azione 1 — Chiama il cameriere (accento tema, ripetibile con cooldown 60s) */}
                <div className={styles.card}>
                    <div className={styles.cardIcon} data-variant="theme">
                        <ConciergeBell size={22} strokeWidth={1.7} />
                    </div>
                    <div className={styles.cardBody}>
                        <span className={styles.cardTitle}>Chiama il cameriere</span>
                        <span className={styles.cardDesc}>
                            {inCooldown
                                ? `Cameriere avvisato — richiamabile tra ${cooldownLeft}s`
                                : "Lo staff raggiungerà il tuo tavolo a breve"}
                        </span>
                        {waiterError && (
                            <span className={styles.cardError}>{waiterError}</span>
                        )}
                    </div>
                    <button
                        type="button"
                        className={styles.cardBtn}
                        data-variant="theme"
                        disabled={inCooldown || isCallingWaiter}
                        onClick={handleCallWaiter}
                        aria-busy={isCallingWaiter}
                    >
                        {isCallingWaiter ? "Chiamando…" : inCooldown ? `${cooldownLeft}s` : "Chiama"}
                    </button>
                </div>

                {/* Azione 2 — Chiedi il conto (accento tema, gated come in OrderingSheet) */}
                <div className={styles.card}>
                    <div className={styles.cardIcon} data-variant="theme">
                        <Receipt size={22} strokeWidth={1.7} />
                    </div>
                    <div className={styles.cardBody}>
                        <span className={styles.cardTitle}>Chiedi il conto</span>
                        <span className={styles.cardDesc}>
                            {billRequestedAt
                                ? "Richiesta inviata — lo staff porterà il conto"
                                : hasInProgressOrders
                                    ? "Hai ordini in preparazione — potrai chiedere il conto quando saranno pronti"
                                    : "Lo staff porterà il conto al tuo tavolo"}
                        </span>
                        {billError && (
                            <span className={styles.cardError}>{billError}</span>
                        )}
                    </div>
                    <button
                        type="button"
                        className={styles.cardBtn}
                        data-variant="theme"
                        disabled={!!billRequestedAt || hasInProgressOrders || isRequestingBill}
                        onClick={handleRequestBill}
                        aria-busy={isRequestingBill}
                    >
                        {isRequestingBill
                            ? "Invio…"
                            : billRequestedAt
                                ? "Richiesto"
                                : "Chiedi"}
                    </button>
                </div>

            </div>
        </PublicSheet>
    );
}
