import { useCallback, useEffect, useState } from "react";
import { Bell, Receipt } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCustomerSession } from "@/context/CustomerSession/useCustomerSession";
import { callWaiter, requestBill } from "@/services/supabase/customerSessions";
import { getOrdersForSession } from "@/services/supabase/orders";
import { msToNextWaiterPhase, waiterPhase, type WaiterPhase } from "./waiterPhase";
import styles from "./AssistanceActions.module.scss";

type Props = {
    /** Stato "Chiedi il conto" — single source of truth in CollectionView (synced via realtime). */
    billRequestedAt: string | null;
    onBillRequestedAtChange: (next: string | null) => void;
    /** Stato "Chiama cameriere" — single source of truth in CollectionView (synced via realtime). */
    waiterCalledAt: string | null;
    onWaiterCalledAtChange: (next: string | null) => void;
    /** Bump esterno (submit ordine riuscito) → ricalcola il gating "ordini in corso". */
    ordersRefreshKey?: number;
    /**
     * Ordini in corso già noti col realtime (redesign): se c'è, il gating del conto segue
     * i cambi di stato a foglio aperto e la lettura qui sotto non parte.
     */
    hasInProgressOrders?: boolean;
    /** «tiles»: due riquadri nel corpo del foglio (redesign, mockup v38); di default il piede fisso. */
    layout?: "bar" | "tiles";
};

export default function AssistanceActions({
    billRequestedAt,
    onBillRequestedAtChange,
    waiterCalledAt,
    onWaiterCalledAtChange,
    ordersRefreshKey,
    hasInProgressOrders: liveInProgress,
    layout = "bar"
}: Props) {
    const { t } = useTranslation("public");
    const { session } = useCustomerSession();

    // ── Fase della chiamata: si ricalcola solo quando cambia (1 min, 10 min) ──
    const [phase, setPhase] = useState<WaiterPhase>(() => waiterPhase(waiterCalledAt, Date.now()));
    useEffect(() => {
        let id: ReturnType<typeof setTimeout> | undefined;
        const update = () => {
            const now = Date.now();
            setPhase(waiterPhase(waiterCalledAt, now));
            const next = msToNextWaiterPhase(waiterCalledAt, now);
            if (next !== null) id = setTimeout(update, next + 50);
        };
        update();
        return () => clearTimeout(id);
    }, [waiterCalledAt]);

    // ── Gating conto: ha ordini in lavorazione? Fetch al mount (apertura
    // sheet, indipendente dalla tab attiva) + refetch su bump esterno
    // (submit ordine riuscito). ─────────────────────────────────────────
    const [fetchedInProgress, setHasInProgressOrders] = useState(false);
    const hasLive = liveInProgress !== undefined;
    useEffect(() => {
        if (hasLive) return;
        if (!session?.jwt) {
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
    }, [session?.jwt, ordersRefreshKey, hasLive]);
    const hasInProgressOrders = liveInProgress ?? fetchedInProgress;

    // ── Handlers ──────────────────────────────────────────────────────────
    const [isCallingWaiter, setIsCallingWaiter] = useState(false);
    const [waiterError, setWaiterError] = useState<string | null>(null);
    const [isRequestingBill, setIsRequestingBill] = useState(false);
    const [billError, setBillError] = useState<string | null>(null);

    const handleCallWaiter = useCallback(async () => {
        if (!session?.jwt || isCallingWaiter || phase === "called") return;
        setIsCallingWaiter(true);
        setWaiterError(null);
        try {
            const result = await callWaiter(session.jwt);
            onWaiterCalledAtChange(result.waiter_called_at);
        } catch (err) {
            setWaiterError(err instanceof Error ? err.message : t("assistance.waiter_error"));
        } finally {
            setIsCallingWaiter(false);
        }
    }, [session?.jwt, isCallingWaiter, phase, onWaiterCalledAtChange, t]);

    const handleRequestBill = useCallback(async () => {
        if (!session?.jwt || isRequestingBill || !!billRequestedAt || hasInProgressOrders) return;
        setIsRequestingBill(true);
        setBillError(null);
        try {
            const result = await requestBill(session.jwt);
            onBillRequestedAtChange(result.bill_requested_at);
        } catch (err) {
            setBillError(err instanceof Error ? err.message : t("assistance.bill_error"));
        } finally {
            setIsRequestingBill(false);
        }
    }, [session?.jwt, isRequestingBill, billRequestedAt, hasInProgressOrders, onBillRequestedAtChange, t]);

    if (!session?.jwt) return null;

    const waiterLabel = isCallingWaiter
        ? t("assistance.waiter_cta_loading")
        : phase === "idle"
            ? t("assistance.waiter_title")
            : layout === "bar" && phase === "recall"
                ? t("assistance.waiter_recall")
                : t("assistance.waiter_called");
    // Riga sotto solo nei riquadri: il piede fisso non ha spazio.
    const waiterHint = layout === "tiles" && !isCallingWaiter && phase !== "idle"
        ? t(phase === "called" ? "assistance.waiter_called_hint" : "assistance.waiter_recall_hint")
        : null;

    return (
        <div className={styles.footer} data-layout={layout}>
            {waiterError && <span className={styles.error}>{waiterError}</span>}
            {billError && <span className={styles.error}>{billError}</span>}
            <div className={styles.actions}>
                <button
                    type="button"
                    className={styles.waiterBtn}
                    data-phase={phase}
                    disabled={phase === "called" || isCallingWaiter}
                    onClick={handleCallWaiter}
                    aria-busy={isCallingWaiter}
                >
                    <Bell size={16} strokeWidth={1.9} />
                    <span className={styles.label} aria-live="polite">
                        {waiterLabel}
                        {waiterHint && <span className={styles.hint}>{waiterHint}</span>}
                    </span>
                </button>
                <button
                    type="button"
                    className={styles.billBtn}
                    disabled={!!billRequestedAt || hasInProgressOrders || isRequestingBill}
                    onClick={handleRequestBill}
                    aria-busy={isRequestingBill}
                >
                    <Receipt size={16} strokeWidth={1.9} />
                    <span>
                        {isRequestingBill
                            ? t("assistance.bill_cta_loading")
                            : billRequestedAt
                                ? t("assistance.bill_cta_requested")
                                : t("assistance.bill_title")}
                    </span>
                </button>
            </div>
        </div>
    );
}
