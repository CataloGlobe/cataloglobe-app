import { useCallback, useEffect, useState } from "react";
import { Bell, Receipt } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCustomerSession } from "@/context/CustomerSession/CustomerSessionContext";
import { callWaiter, requestBill } from "@/services/supabase/customerSessions";
import { getOrdersForSession } from "@/services/supabase/orders";
import styles from "./AssistanceActions.module.scss";

const COOLDOWN_S = 60;

type Props = {
    /** Stato "Chiedi il conto" — single source of truth in CollectionView (synced via realtime). */
    billRequestedAt: string | null;
    onBillRequestedAtChange: (next: string | null) => void;
    /** Stato "Chiama cameriere" — single source of truth in CollectionView (synced via realtime). */
    waiterCalledAt: string | null;
    onWaiterCalledAtChange: (next: string | null) => void;
    /** Bump esterno (submit ordine riuscito) → ricalcola il gating "ordini in corso". */
    ordersRefreshKey?: number;
};

export default function AssistanceActions({
    billRequestedAt,
    onBillRequestedAtChange,
    waiterCalledAt,
    onWaiterCalledAtChange,
    ordersRefreshKey,
}: Props) {
    const { t } = useTranslation("public");
    const { session } = useCustomerSession();

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

    // ── Gating conto: ha ordini in lavorazione? Fetch al mount (apertura
    // sheet, indipendente dalla tab attiva) + refetch su bump esterno
    // (submit ordine riuscito). ─────────────────────────────────────────
    const [hasInProgressOrders, setHasInProgressOrders] = useState(false);
    useEffect(() => {
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
    }, [session?.jwt, ordersRefreshKey]);

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
            setWaiterError(err instanceof Error ? err.message : t("assistance.waiter_error"));
        } finally {
            setIsCallingWaiter(false);
        }
    }, [session?.jwt, isCallingWaiter, cooldownLeft, onWaiterCalledAtChange, t]);

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

    const inCooldown = cooldownLeft > 0;

    return (
        <div className={styles.footer}>
            {waiterError && <span className={styles.error}>{waiterError}</span>}
            {billError && <span className={styles.error}>{billError}</span>}
            <div className={styles.actions}>
                <button
                    type="button"
                    className={styles.waiterBtn}
                    disabled={inCooldown || isCallingWaiter}
                    onClick={handleCallWaiter}
                    aria-busy={isCallingWaiter}
                >
                    <Bell size={16} strokeWidth={1.9} />
                    <span>
                        {isCallingWaiter
                            ? t("assistance.waiter_cta_loading")
                            : inCooldown
                                ? t("assistance.waiter_cta_cooldown", { count: cooldownLeft })
                                : t("assistance.waiter_title")}
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
