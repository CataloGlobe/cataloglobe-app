import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTenant } from "@/context/useTenant";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { useToast } from "@/context/Toast/ToastContext";
import {
    confirmCheckoutSession,
    createCheckoutSession,
    createPortalSession,
    previewSubscriptionChange,
    commitSubscriptionChange,
    getSubscriptionState,
    isSubscriptionStateUnavailable,
    cancelSubscription,
    reactivateSubscription,
    cancelScheduledChange,
    previewScheduledChange,
    updateScheduledChange,
    previewIntervalChange,
    commitIntervalChange,
    IntervalChangeBlockedError
} from "@/services/supabase/billing";
import type {
    ConsumedDiscountThisPeriod,
    IntervalBlockReason,
    SubscriptionChangePreview,
    SubscriptionDiscount,
    SubscriptionState,
    SubscriptionStateUnavailableReason
} from "@/services/supabase/billing";
import { getPlanByCode, listPublicPlans } from "@/services/supabase/plans";
import { getActivityCount } from "@/services/supabase/activities";
import { getTenantBillingInterval } from "@/services/supabase/tenants";
import { COMPANY } from "@/config/company";
import { formatPendingChangeLabel } from "./pendingChangeLabel";
import { SUBSCRIPTION_UNAVAILABLE_MESSAGE, buildSubscriptionSupportMailto } from "./supportMailto";
import { listPlanPrices } from "@/services/supabase/planPrices";
import { calculateGraduatedFromPlan, nextSeatOffer } from "@/utils/pricing";
import { DEFAULT_BILLING_INTERVAL, INTERVAL_ADJECTIVE, intervalUnit, priceCentsFor } from "@/utils/planPricing";
import { canDoOnTenant } from "@/lib/permissions";
import { usePermissions } from "@/context/PermissionsContext";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { StatusStrip, type StatusStripTone } from "@/components/ui/StatusStrip/StatusStrip";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { Card } from "@/components/ui/Card/Card";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { Loader } from "@/components/ui/Loader/Loader";
import { PlanSeatsSelector } from "@/components/ui/PlanSeatsSelector/PlanSeatsSelector";
import { AiUsageSection } from "@/pages/Business/components/AiUsageSection";
import { useBusinessOutletContext } from "@/layouts/MainLayout/outletContext";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { usePageHeader } from "@/context/usePageHeader";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import {
    ExternalLink,
    CreditCard,
    ChevronRight,
    Lock,
    Mail,
    Pencil,
    AlertTriangle,
    XCircle,
    RotateCcw,
    CalendarRange
} from "lucide-react";
import type { BillingInterval, Plan, PlanCode, PlanPrice } from "@/types/plan";
import styles from "./SubscriptionPage.module.scss";

/**
 * La mappa stato → strip (§37.5: una sola uscita per stato). Il tono e la
 * parola del badge dipendono da stato, presenza della subscription e
 * disdetta programmata; la si legge nel componente, qui solo le parole.
 */
const STATUS_BADGE: Record<string, string> = {
    active: "Attivo",
    trialing: "In prova",
    past_due: "Pagamento in ritardo",
    canceled: "Disdetto",
    suspended: "Sospeso"
};

const CHANGE_PLAN_MAILTO = `mailto:${COMPANY.contact.support}?subject=${encodeURIComponent("Cambio piano CataloGlobe")}`;

// Italian grouping: yearly totals cross €1.000 ("€1.109,83"), monthly ones never
// did. `useGrouping: "always"` because ICU's it-IT groups only from 10.000 up
// (minimumGroupingDigits = 2) and would print "€1121,00".
function formatEuro(value: number): string {
    return `€${value.toLocaleString("it-IT", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: "always"
    })}`;
}

function formatCents(cents: number): string {
    return formatEuro(cents / 100);
}

/** Riga testuale sconto: unico pattern per percent_off/amount_off × forever/scadenza. */
function formatDiscountLine(discount: SubscriptionDiscount): string {
    const amountText =
        discount.percentOff != null
            ? `-${discount.percentOff}%`
            : discount.amountOff != null
            ? `-${formatCents(discount.amountOff)}`
            : "";
    const untilText =
        discount.duration === "repeating"
            ? `fino al ${formatDate(discount.end)}`
            : discount.duration === "once"
            ? "applicato al prossimo rinnovo, poi prezzo pieno"
            : "per sempre";
    return `Sconto ${amountText} ${untilText}`;
}

/**
 * Nota informativa per sconto già consumato sul periodo corrente (coupon `once`
 * rimosso da Stripe a fattura finalizzata). Tono passato ("è costato"), non
 * promozionale: nessun prezzo barrato, il prezzo pieno vale già dal prossimo
 * rinnovo. L'importo pagato viene dal totale reale della fattura Stripe.
 */
function formatConsumedDiscountNote(discount: ConsumedDiscountThisPeriod, fullPrice: number): string {
    const amountText =
        discount.percentOff != null
            ? `-${discount.percentOff}%`
            : discount.amountOff != null
            ? `-${formatCents(discount.amountOff)}`
            : "";
    const paidText = formatCents(discount.invoiceTotal);
    const base =
        discount.invoiceTotal === 0
            ? `Il periodo corrente è costato ${paidText}`
            : `Il periodo corrente è costato ${paidText} invece di ${formatEuro(fullPrice)}`;
    return amountText ? `${base} (sconto ${amountText} applicato)` : base;
}

/** Prezzo pieno → prezzo scontato applicando il coupon Stripe (percent_off o amount_off). */
function applyDiscount(fullPrice: number, discount: SubscriptionDiscount): number {
    if (discount.percentOff != null) return fullPrice * (1 - discount.percentOff / 100);
    if (discount.amountOff != null) return Math.max(0, fullPrice - discount.amountOff / 100);
    return fullPrice;
}

/**
 * Passi 4a/4b — perché il cambio di intervallo non è disponibile, per
 * intervallo TARGET. Stesso testo al posto dell'azione (gating pre-conferma) e
 * nel toast se l'edge rifiuta comunque (stato cambiato nel frattempo).
 * `interval_pending` non riguarda queste card: è il rifiuto di un cambio
 * piano/sedi mentre un cambio di intervallo è programmato (vedi
 * PENDING_INTERVAL_MESSAGE).
 */
const INTERVAL_BLOCK_MESSAGE: Record<BillingInterval, Record<IntervalBlockReason, string>> = {
    year: {
        pending_change: "Per passare all'annuale, annulla prima il cambio programmato.",
        cancel_scheduled: "Per passare all'annuale, riattiva prima l'abbonamento.",
        past_due: "Per passare all'annuale, regolarizza prima il pagamento in sospeso.",
        not_active: "Il passaggio all'annuale è disponibile solo con un abbonamento attivo o in prova.",
        discount: "Il passaggio all'annuale non è disponibile finché è attivo uno sconto sull'abbonamento. Se vuoi passare all'annuale, scrivi all'assistenza.",
        interval_pending: "Per passare all'annuale, annulla prima il cambio programmato."
    },
    month: {
        pending_change: "Per tornare al mensile, annulla prima il cambio programmato.",
        cancel_scheduled: "Per tornare al mensile, riattiva prima l'abbonamento.",
        past_due: "Per tornare al mensile, regolarizza prima il pagamento in sospeso.",
        not_active: "Il passaggio al mensile è disponibile solo con un abbonamento attivo o in prova.",
        discount: "Il passaggio al mensile non è disponibile finché è attivo uno sconto sull'abbonamento. Se vuoi tornare al mensile, scrivi all'assistenza.",
        interval_pending: "Per tornare al mensile, annulla prima il cambio programmato."
    }
};

/** Card «Modifica piano» mentre è programmato un cambio verso l'intervallo dato. */
const PENDING_INTERVAL_MESSAGE: Record<BillingInterval, string> = {
    month: "Hai un passaggio al mensile programmato. Per modificare piano o sedi, annulla prima quella richiesta.",
    year: "Hai un passaggio all'annuale programmato. Per modificare piano o sedi, annulla prima quella richiesta."
};

const INTERVAL_ACTION_LABEL: Record<BillingInterval, string> = {
    year: "Passa all'annuale",
    month: "Torna al mensile"
};

/** Traduce i codici d'errore dell'edge di cambio abbonamento in messaggi UI. */
function mapChangeError(err: unknown, activityCount: number, cap: number): string {
    const name = err instanceof Error ? err.name : "";
    switch (name) {
        case "SEATS_BELOW_ACTIVITIES":
            return `Non puoi scendere sotto il numero di sedi della tua attività (${activityCount}).`;
        case "SEATS_OVER_SELF_SERVICE":
            return `Oltre ${cap} sedi serve un piano dedicato: contatta l'assistenza.`;
        case "NO_CHANGE":
            return "Non hai selezionato alcuna modifica.";
        case "NO_SCHEDULED_CHANGE":
            return "Non c'è più un cambio programmato da modificare.";
        case "SEATS_ADDED_DOWNGRADE_NOT_SCHEDULED":
        case "SEATS_ADDED_SCHEDULE_NOT_UPDATED":
            return "Le sedi sono state aggiunte e pagate, ma il passaggio a Base non è stato programmato. Riprova.";
        case "SUBSCRIPTION_NOT_FOUND":
            return "Non riusciamo a leggere i dati del tuo abbonamento. Scrivi all'assistenza per modificare piano, sedi o fatturazione.";
        case "STRIPE_UNAVAILABLE":
            return "Il servizio di fatturazione non è raggiungibile in questo momento. Riprova tra qualche minuto.";
        case "INTERVAL_CHANGE_BLOCKED":
            // Plan/seat drawer already open while an interval change got scheduled elsewhere.
            return err instanceof IntervalChangeBlockedError && err.reason === "interval_pending"
                ? "C'è un cambio di intervallo di fatturazione programmato. Annullalo prima di modificare piano o sedi."
                : "Si è verificato un errore. Riprova.";
        default:
            return "Si è verificato un errore. Riprova.";
    }
}

export default function SubscriptionPage() {
    const { selectedTenant, loading, patchSelectedTenant, refreshTenants } = useTenant();
    const { permissions, loading: permissionsLoading } = usePermissions();
    const canReadBilling = permissions ? canDoOnTenant(permissions, "billing.read") : false;
    const canManageBilling = permissions ? canDoOnTenant(permissions, "billing.manage") : false;
    const canCancelBilling = permissions ? canDoOnTenant(permissions, "billing.cancel") : false;
    const { status, trialDaysLeft, hasSubscriptionRecord, canStartCheckout } = useSubscriptionGuard();
    const { showToast } = useToast();
    const navigate = useNavigate();

    // Stato quota AI (FASE 5): fetch unico in MainLayout, letto via Outlet context.
    // Freschiamo all'apertura della pagina (fonte di verità permanente).
    const outlet = useBusinessOutletContext();
    const aiUsage = outlet?.aiUsage ?? null;
    const refreshAiUsage = outlet?.refreshAiUsage;
    useEffect(() => {
        refreshAiUsage?.();
    }, [refreshAiUsage]);

    // Deep-link dalla pill dell'header (#utilizzo-ai): porta davvero alla sezione
    // invece di fermarsi in cima. Attende che la sezione esista (aiUsage caricato),
    // poi scrolla una sola volta finché l'ancora resta nell'URL.
    const { hash } = useLocation();
    const didScrollToUsageRef = useRef(false);
    useEffect(() => {
        if (hash !== "#utilizzo-ai") {
            didScrollToUsageRef.current = false;
            return;
        }
        if (didScrollToUsageRef.current) return;
        const el = document.getElementById("utilizzo-ai");
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
            didScrollToUsageRef.current = true;
        }
    }, [hash, aiUsage]);

    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const [portalLoading, setPortalLoading] = useState(false);
    const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);
    // Display prices come from `plan_prices` for the tenant's billing interval,
    // never from the deprecated `plans.monthly_price_cents`. The interval is read
    // from `tenants.billing_interval` (not exposed by `user_tenants_view`); a NULL
    // is a legacy tenant that predates the column and only ever knew monthly.
    const [planPrices, setPlanPrices] = useState<PlanPrice[]>([]);
    const [billingInterval, setBillingInterval] = useState<BillingInterval>(DEFAULT_BILLING_INTERVAL);

    // --- Stato flusso "Modifica piano" self-service ---
    const [plans, setPlans] = useState<Plan[]>([]);

    // Deep-link da Businesses (offerta "hai usato tutte le sedi"): apre il
    // drawer di cambio piano direttamente, appena i piani sono caricati.
    // Stesso pattern hash di #utilizzo-ai sopra. `openChange` è definito più
    // in basso nel corpo della funzione (plain function, non un hook): la
    // closure lo legge solo quando l'effect scatta — a quel punto il render
    // è già completo e `openChange` è assegnato.
    const didOpenChangeFromHashRef = useRef(false);
    useEffect(() => {
        if (hash !== "#modifica-piano") {
            didOpenChangeFromHashRef.current = false;
            return;
        }
        if (didOpenChangeFromHashRef.current) return;
        if (plans.length === 0) return;
        didOpenChangeFromHashRef.current = true;
        openChange();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hash, plans]);
    const [activityCount, setActivityCount] = useState(0);
    const [isChangeOpen, setIsChangeOpen] = useState(false);
    // Flusso a 3 step: scegli piano/sedi → quando applicare → conferma.
    const [changeStep, setChangeStep] = useState<"select" | "when" | "confirm">("select");
    // Scelta "quando applicare". Reale solo nel caso "più sedi con cambio
    // programmato in volo"; negli altri casi è il default forzato (informativo).
    const [applyAt, setApplyAt] = useState<"now" | "renewal">("now");
    const [draftPlan, setDraftPlan] = useState<PlanCode>("base");
    const [draftSeats, setDraftSeats] = useState(1);
    const [preview, setPreview] = useState<SubscriptionChangePreview | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [commitLoading, setCommitLoading] = useState(false);
    const [changeError, setChangeError] = useState<string | null>(null);

    // Update ottimistico post-commit: il webhook sincronizza `tenants` in modo
    // asincrono, quindi una rilettura immediata leggerebbe ancora lo stato
    // vecchio. Riflettiamo subito il target noto e NON rileggiamo `tenants`.
    const [optimisticPlan, setOptimisticPlan] = useState<PlanCode | null>(null);
    const [optimisticSeats, setOptimisticSeats] = useState<number | null>(null);
    const [optimisticNextAmountCents, setOptimisticNextAmountCents] = useState<number | null>(null);
    const [scheduledChange, setScheduledChange] = useState<{
        planName: string;
        seats: number;
        nextDate: string | null;
        isDowngradeToBase: boolean;
        /** Interval of the future phase; plan/seat changes keep the current one. */
        interval: BillingInterval;
    } | null>(null);

    // --- Stato abbonamento live (banner persistente + disdetta) ---
    const [subState, setSubState] = useState<SubscriptionState | null>(null);
    // Why the subscription could not be read, or null when it was. Distinct
    // from `subState === null` (not loaded yet): with a reason set the page
    // stops offering actions that would all fail the same way.
    const [subStateUnavailable, setSubStateUnavailable] = useState<SubscriptionStateUnavailableReason | null>(null);
    const [subStateLoading, setSubStateLoading] = useState(true);
    const [isCancelOpen, setIsCancelOpen] = useState(false);
    const [cancelLoading, setCancelLoading] = useState(false);
    const [reactivateLoading, setReactivateLoading] = useState(false);
    const [isCancelScheduleOpen, setIsCancelScheduleOpen] = useState(false);
    const [cancelScheduleLoading, setCancelScheduleLoading] = useState(false);

    // --- Cambio di intervallo (passi 4a/4b): ingresso dedicato, un solo step.
    // `intervalTarget` = intervallo richiesto: "year" (immediato, addebito) o
    // "month" (programmato al rinnovo; immediato a €0 in prova).
    const [isIntervalOpen, setIsIntervalOpen] = useState(false);
    const [intervalTarget, setIntervalTarget] = useState<BillingInterval>("year");
    const [intervalPreview, setIntervalPreview] = useState<SubscriptionChangePreview | null>(null);
    const [intervalPreviewLoading, setIntervalPreviewLoading] = useState(false);
    const [intervalCommitLoading, setIntervalCommitLoading] = useState(false);
    const [intervalError, setIntervalError] = useState<string | null>(null);

    const tenantId = selectedTenant?.id ?? null;
    const reloadSubState = useCallback(async () => {
        if (!tenantId) return;
        setSubStateLoading(true);
        try {
            const result = await getSubscriptionState(tenantId);
            if (isSubscriptionStateUnavailable(result)) {
                setSubState(null);
                setSubStateUnavailable(result.reason);
            } else {
                setSubState(result);
                setSubStateUnavailable(null);
            }
        } catch (err) {
            // The call itself failed (network, edge down): same UX as Stripe unreachable.
            console.error("[SubscriptionPage] subscription state load failed:", err);
            setSubState(null);
            setSubStateUnavailable("stripe_unavailable");
        } finally {
            setSubStateLoading(false);
        }
    }, [tenantId]);

    useEffect(() => {
        if (!selectedTenant?.plan) return;
        getPlanByCode(selectedTenant.plan)
            .then(setCurrentPlan)
            .catch(err => {
                console.error("[SubscriptionPage] plan lookup failed:", err);
                setCurrentPlan(null);
            });
    }, [selectedTenant?.plan]);

    // Interval + price rows: needed by every reader for the "Prezzo attuale" card.
    useEffect(() => {
        if (!tenantId) return;
        getTenantBillingInterval(tenantId)
            .then(interval => setBillingInterval(interval ?? DEFAULT_BILLING_INTERVAL))
            .catch(err => console.error("[SubscriptionPage] billing interval lookup failed:", err));
        listPlanPrices()
            .then(setPlanPrices)
            .catch(err => {
                console.error("[SubscriptionPage] plan prices list failed:", err);
                setPlanPrices([]);
            });
    }, [tenantId]);

    // Conteggio sedi: la cifra «usate di pagate» dello strip serve a ogni
    // lettore (§37.7), non solo a chi può cambiare piano.
    useEffect(() => {
        if (!selectedTenant?.id || !canReadBilling) return;
        getActivityCount(selectedTenant.id)
            .then(setActivityCount)
            .catch(err => console.error("[SubscriptionPage] activity count failed:", err));
    }, [selectedTenant?.id, canReadBilling]);

    // Carica piani + stato live (per il selettore, il floor e le azioni).
    useEffect(() => {
        if (!selectedTenant?.id || !canManageBilling) return;
        listPublicPlans()
            .then(setPlans)
            .catch(err => {
                console.error("[SubscriptionPage] plans list failed:", err);
                setPlans([]);
            });
        reloadSubState();
    }, [selectedTenant?.id, canManageBilling, reloadSubState]);

    usePageHeader({
        title: "Abbonamento",
        subtitle: !canReadBilling ? undefined : "Piano, sedi pagate, credito AI e pagamento."
    });

    const paidSeats = selectedTenant?.paid_seats ?? 0;

    const currentPricing = useMemo(() => {
        if (!currentPlan) return { lines: [], subtotal: 0, fullPrice: 0, discountedPrice: 0 };
        const unitPriceCents = priceCentsFor(planPrices, currentPlan.code, billingInterval);
        return calculateGraduatedFromPlan({ ...currentPlan, unit_price_cents: unitPriceCents }, paidSeats);
    }, [currentPlan, paidSeats, planPrices, billingInterval]);

    // --- Derivati del flusso di cambio (sicuri anche prima del load) ---
    const draftPlanObj = plans.find(p => p.code === draftPlan) ?? null;
    const draftMaxSeats = draftPlanObj?.max_self_service_seats ?? 5;
    const draftDiscount = draftPlanObj?.volume_discount_percent ?? 10;
    const minSeats = Math.max(1, activityCount);
    const selfServiceCap = currentPlan?.max_self_service_seats ?? 5;
    const selfServiceEligible = activityCount <= selfServiceCap;

    // Card prices for the change-plan drawer: the tenant's own interval. The
    // interval itself is not changeable here (no switch is rendered): a yearly
    // subscriber changes plan and seats while staying yearly.
    const draftUnitPriceCentsByPlan = useMemo(() => {
        const out: Partial<Record<PlanCode, number>> = {};
        for (const p of plans) {
            const cents = priceCentsFor(planPrices, p.code, billingInterval);
            if (cents !== null) out[p.code] = cents;
        }
        return out;
    }, [plans, planPrices, billingInterval]);

    const draftBreakdown = useMemo(() => {
        if (!draftPlanObj) return { lines: [], subtotal: 0, fullPrice: 0, discountedPrice: 0 };
        const unitPriceCents = priceCentsFor(planPrices, draftPlanObj.code, billingInterval);
        return calculateGraduatedFromPlan({ ...draftPlanObj, unit_price_cents: unitPriceCents }, draftSeats);
    }, [draftPlanObj, draftSeats, planPrices, billingInterval]);

    if (loading || !selectedTenant || permissionsLoading) {
        return (
            <div className={styles.page}>
                <Skeleton height="96px" radius="var(--radius-surface)" />
                {[0, 1, 2].map(i => (
                    <Card key={i}>
                        <div className={styles.skeletonCard}>
                            <Skeleton height="20px" width="30%" />
                            <Skeleton height="16px" width="70%" />
                            <Skeleton height="38px" width="40%" />
                        </div>
                    </Card>
                ))}
            </div>
        );
    }

    if (!canReadBilling) {
        return (
            <div className={styles.page}>
                <EmptyState
                    variant="page"
                    icon={<Lock />}
                    title="Non hai accesso all'abbonamento"
                    description="Lo gestiscono il proprietario e gli amministratori."
                />
            </div>
        );
    }

    const isTerminal = status === "canceled" || status === "suspended";
    // Subscription on file but unreadable: plan/seats stay (they describe the
    // service actually delivered), amounts and dates become "Non disponibile",
    // and every self-service action is withdrawn — the banner says what to do.
    const subUnavailable = !subStateLoading && subStateUnavailable !== null;
    const supportMailto = buildSubscriptionSupportMailto({
        supportEmail: COMPANY.contact.support,
        tenantId: selectedTenant.id,
        tenantName: selectedTenant.name
    });
    const isFounder = selectedTenant.is_founder === true;
    const planName = currentPlan?.name ?? "—";

    // Valori mostrati: l'override ottimistico (post-upgrade) prevale sul dato
    // letto da `tenants` finché il webhook non ha sincronizzato.
    const displayPlanName = optimisticPlan
        ? (plans.find(p => p.code === optimisticPlan)?.name ?? optimisticPlan)
        : planName;
    const displaySeats = optimisticSeats ?? paidSeats;
    // Recurring amount per billing period (month or year), in euros.
    const displayAmount = optimisticNextAmountCents != null
        ? optimisticNextAmountCents / 100
        : currentPricing.subtotal;
    const unit = intervalUnit(billingInterval);

    // Coupon Stripe attivo (letto live dall'edge "state"). Il prezzo scontato
    // resta puramente informativo: l'addebito reale lo calcola Stripe.
    const activeDiscount = subState?.discount ?? null;
    const discountedAmount = activeDiscount ? applyDiscount(displayAmount, activeDiscount) : null;
    // Sconto `once` già consumato ma relativo al periodo corrente: nota
    // informativa, niente prezzo barrato (il pieno vale già dal prossimo rinnovo).
    const consumedDiscount = activeDiscount ? null : subState?.consumedDiscountThisPeriod ?? null;

    const handleCheckout = async () => {
        setCheckoutLoading(true);
        try {
            // Re-activation keeps the interval the tenant already has. A NULL
            // interval is a legacy tenant that predates the column and never
            // chose anything (monthly was the only interval that ever existed):
            // no choice to betray, so 'month' is the honest reading — logged,
            // not blocked.
            const storedInterval = await getTenantBillingInterval(selectedTenant.id);
            if (storedInterval === null) {
                console.warn(`[SubscriptionPage] tenant ${selectedTenant.id} has no billing_interval on record; checkout as month`);
            }
            const billingInterval = storedInterval ?? "month";
            const url = await createCheckoutSession({
                tenantId: selectedTenant.id,
                planCode: selectedTenant.plan,
                billingInterval,
                quantity: paidSeats > 0 ? paidSeats : 1,
                successUrl: `${window.location.origin}/business/${selectedTenant.id}/subscription?session=success`,
                cancelUrl: `${window.location.origin}/business/${selectedTenant.id}/subscription?session=cancel`
            });
            window.location.href = url;
        } catch (err) {
            // `createCheckoutSession` attaches the edge error code as `name`.
            // `subscription_already_active` is almost always the payment↔webhook
            // race (a live subscription our tenant row does not know about yet),
            // not a user mistake: reassure instead of alarming.
            const code = err instanceof Error ? err.name : "";
            if (code === "subscription_already_active") {
                // Self-repair: adopt the live subscription our row does not know
                // about (paid, tab closed, webhook lost). The edge refuses when
                // there is more than one live subscription — then the message
                // below is the honest fallback.
                try {
                    await confirmCheckoutSession({ tenantId: selectedTenant.id });
                    await refreshTenants();
                    showToast({
                        message: "Avevi già un abbonamento attivo: ora è collegato e non è stato addebitato nulla.",
                        type: "success"
                    });
                    return;
                } catch (adoptErr) {
                    console.error("[SubscriptionPage] subscription adoption failed:", adoptErr);
                }
                showToast({
                    message: "Il tuo abbonamento è già attivo. Se hai appena completato il pagamento, attendi qualche secondo e ricarica la pagina.",
                    type: "warning"
                });
            } else if (code === "subscription_check_failed") {
                showToast({
                    message: "Non siamo riusciti a verificare lo stato del tuo abbonamento. Non ti è stato addebitato nulla: riprova tra qualche istante.",
                    type: "error"
                });
            } else if (code === "invalid_vat_number") {
                // Gate fiscale server-side di stripe-checkout. Qui il profilo è di
                // norma già valido (impostato alla creazione), ma la P.IVA può
                // essere stata modificata dopo: messaggio esplicito, non generico.
                showToast({
                    message: "La Partita IVA dell'azienda non è valida. Correggila nei dati di fatturazione e riprova.",
                    type: "error"
                });
            } else if (code === "missing_einvoice_recipient") {
                showToast({
                    message: "Con la Partita IVA serve un recapito per la fattura elettronica: aggiungi il Codice Destinatario SDI o la PEC nei dati di fatturazione.",
                    type: "error"
                });
            } else if (code === "fiscal_profile_unavailable") {
                showToast({
                    message: "Non siamo riusciti a leggere i dati di fatturazione. Non ti è stato addebitato nulla: riprova tra qualche istante.",
                    type: "error"
                });
            } else {
                showToast({ message: "Errore nell'avvio del checkout. Riprova.", type: "error" });
            }
        } finally {
            setCheckoutLoading(false);
        }
    };

    const handlePortal = async () => {
        setPortalLoading(true);
        try {
            const url = await createPortalSession(
                selectedTenant.id,
                `${window.location.origin}/business/${selectedTenant.id}/subscription`
            );
            window.location.href = url;
        } catch {
            showToast({ message: "Errore nell'apertura del portale. Riprova.", type: "error" });
        } finally {
            setPortalLoading(false);
        }
    };

    // Baseline "corrente" = fonte ottimistica (post-commit) con fallback al
    // valore raw del context. Stessa fonte usata dalla card (displaySeats),
    // così il drawer non pre-compila valori stantii e `hasChange` non segnala
    // cambi fantasma dopo un commit.
    const currentPlanBaseline = (optimisticPlan ?? selectedTenant.plan) as PlanCode;
    const currentSeatsBaseline = optimisticSeats ?? paidSeats;

    // --- Flusso "Modifica piano" (ingresso unico) ---
    // Parte SEMPRE dallo stato live. La distinzione presente/futuro non vive più
    // in due ingressi: diventa lo step "quando applicare" dentro il flusso.
    const openChange = () => {
        setDraftPlan(currentPlanBaseline);
        setDraftSeats(Math.max(1, currentSeatsBaseline, activityCount));
        setChangeStep("select");
        setApplyAt("now");
        setPreview(null);
        setChangeError(null);
        setIsChangeOpen(true);
    };

    const closeChange = () => {
        if (commitLoading) return;
        setIsChangeOpen(false);
    };

    const handleDraftPlan = (code: PlanCode) => {
        setDraftPlan(code);
        const cap = plans.find(p => p.code === code)?.max_self_service_seats ?? 5;
        setDraftSeats(s => Math.min(Math.max(s, minSeats), cap));
    };

    const hasChange = draftPlan !== currentPlanBaseline || draftSeats !== currentSeatsBaseline;
    const isDowngradeToBase = draftPlan === "base" && currentPlanBaseline === "pro";

    // --- Descrittore del cambio (draft vs live + presenza pending) ---
    // Decide quale step "quando applicare" mostrare e il routing preview/commit.
    // La classificazione AUTORITATIVA resta lato edge: qui serve solo a scegliere
    // la UI e, nell'unico caso a scelta vera, quale path edge esistente invocare.
    const planRank = (p: PlanCode): number => (p === "pro" ? 1 : 0);
    const tierDir = planRank(draftPlan) - planRank(currentPlanBaseline); // >0 up, <0 down, 0 same
    const seatDir = draftSeats - currentSeatsBaseline; // >0 up, <0 down, 0 same
    const hasPending = !!subState?.pendingChange;
    const pendingPlanCode = (subState?.pendingChange?.targetPlan ?? draftPlan) as PlanCode;
    const pendingPlanName = plans.find(p => p.code === pendingPlanCode)?.name ?? pendingPlanCode;
    // Scelta VERA solo qui: aggiungo sedi (vs live), tier non in upgrade, e c'è già
    // un cambio programmato → "subito" (B2/combined pagante) vs "dal rinnovo"
    // (updateScheduledChange €0, sedi sulla fase futura del pending).
    const isSeatChoice = hasPending && seatDir > 0 && tierDir <= 0;
    // Tipo per la copy dello step "when".
    const whenKind: "choice" | "tier-up" | "seats-up" | "mixed" | "downgrade" = isSeatChoice
        ? "choice"
        : tierDir > 0
        ? "tier-up"
        : tierDir < 0 && seatDir > 0
        ? "mixed"
        : seatDir > 0
        ? "seats-up"
        : "downgrade";

    // select → when. Calcola il default "quando applicare" dal tipo di cambio.
    const handleToWhen = () => {
        setChangeError(null);
        // Default intelligente: value-up (tier-up / più sedi) → subito; value-down
        // (downgrade / meno sedi) → al rinnovo. Misto → subito (le sedi valgono ora).
        setApplyAt(whenKind === "downgrade" ? "renewal" : "now");
        setChangeStep("when");
    };

    // when → confirm. Preview sul path giusto in base alla scelta.
    const handleToConfirm = async () => {
        setPreviewLoading(true);
        setChangeError(null);
        try {
            const result =
                isSeatChoice && applyAt === "renewal"
                    ? await previewScheduledChange(selectedTenant.id, { plan: pendingPlanCode, seats: draftSeats })
                    : await previewSubscriptionChange(selectedTenant.id, { plan: draftPlan, seats: draftSeats });
            setPreview(result);
            setChangeStep("confirm");
        } catch (err) {
            setChangeError(mapChangeError(err, activityCount, draftMaxSeats));
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleCommit = async () => {
        setCommitLoading(true);
        setChangeError(null);
        try {
            // Scelta "dal rinnovo" sul caso più-sedi-con-pending: aggiunge le sedi
            // alla fase FUTURA del cambio programmato (piano del pending preservato),
            // €0 oggi. Riusa updateScheduledChange (nessun edge nuovo).
            if (isSeatChoice && applyAt === "renewal") {
                await updateScheduledChange(selectedTenant.id, {
                    plan: pendingPlanCode,
                    seats: draftSeats
                });
                setScheduledChange({
                    planName: pendingPlanName,
                    seats: draftSeats,
                    nextDate:
                        preview?.nextDate ??
                        subState?.pendingChange?.effectiveDate ??
                        selectedTenant.current_period_end ??
                        null,
                    isDowngradeToBase: pendingPlanCode === "base" && currentPlanBaseline === "pro",
                    interval: billingInterval
                });
                showToast({
                    message: "Cambio programmato aggiornato: le sedi partiranno dal rinnovo.",
                    type: "success"
                });
                setIsChangeOpen(false);
                reloadSubState();
                return;
            }

            const commitResult = await commitSubscriptionChange(selectedTenant.id, { plan: draftPlan, seats: draftSeats });
            if (preview && preview.effective === "now") {
                // Upgrade immediato: rifletti subito il nuovo stato. NIENTE refetch
                // di `tenants`: il webhook sincronizza in modo asincrono e una
                // rilettura ora leggerebbe ancora i valori vecchi, annullando
                // l'update ottimistico. Alla prossima navigazione la pagina
                // rileggerà la verità (ormai sincronizzata), che coincide.
                setOptimisticPlan(draftPlan);
                setOptimisticSeats(draftSeats);
                setOptimisticNextAmountCents(preview.nextAmount);
                setScheduledChange(null);
                // Patch the tenant in memory with the authoritative commit result
                // (Stripe already applied it). Survives SPA remounts — where the
                // mount-scoped optimistic state above would be lost — and keeps the
                // baseline/header (and other pages reading `selectedTenant`) correct
                // ahead of the async webhook, without a DB refetch race.
                patchSelectedTenant({ plan: commitResult.plan, paid_seats: commitResult.seats });
                showToast({ message: "Piano aggiornato.", type: "success" });
            } else if (commitResult.classification === "combined") {
                // Combined: sedi addebitate e applicate subito lato Stripe, ma il
                // downgrade di piano resta programmato al rinnovo. `effective` qui
                // è sempre l'ISO di fine periodo (mai "now"), quindi il ramo sopra
                // non lo intercetta. Patch solo `paid_seats` — il `plan` visualizzato
                // deve restare quello corrente finché il rinnovo non lo applica; il
                // cambio futuro resta comunicato dal banner sotto.
                patchSelectedTenant({ paid_seats: commitResult.seats });
                setScheduledChange({
                    planName: plans.find(p => p.code === draftPlan)?.name ?? draftPlan,
                    seats: draftSeats,
                    nextDate: preview?.nextDate ?? selectedTenant.current_period_end ?? null,
                    isDowngradeToBase,
                    interval: billingInterval
                });
                showToast({ message: "Sedi aggiunte. Il cambio piano avrà effetto al prossimo rinnovo.", type: "success" });
            } else {
                // Downgrade/programmato: piano e sedi correnti restano invariati
                // fino al rinnovo; mostra solo l'indicatore del cambio programmato.
                setScheduledChange({
                    planName: plans.find(p => p.code === draftPlan)?.name ?? draftPlan,
                    seats: draftSeats,
                    nextDate: preview?.nextDate ?? selectedTenant.current_period_end ?? null,
                    isDowngradeToBase,
                    interval: billingInterval
                });
                showToast({ message: "Cambio programmato: avrà effetto al prossimo rinnovo.", type: "success" });
            }
            setIsChangeOpen(false);
            // Riconcilia col vero stato Stripe (così il banner persiste dopo reload).
            reloadSubState();
        } catch (err) {
            const name = err instanceof Error ? err.name : "";
            if (name === "PAYMENT_FAILED") {
                showToast({
                    message: "Addebito non riuscito. Aggiorna il metodo di pagamento e riprova.",
                    type: "error"
                });
                setChangeError("L'addebito è stato rifiutato. Aggiorna il metodo di pagamento dal portale di fatturazione.");
            } else if (
                name === "SEATS_ADDED_DOWNGRADE_NOT_SCHEDULED" ||
                name === "SEATS_ADDED_SCHEDULE_NOT_UPDATED"
            ) {
                showToast({
                    message: "Sedi aggiunte e pagate, ma il passaggio a Base non è stato programmato. Riprova.",
                    type: "error"
                });
                setChangeError("Le sedi sono state aggiunte e pagate, ma il passaggio a Base non è stato programmato. Riprova.");
            } else {
                setChangeError(mapChangeError(err, activityCount, draftMaxSeats));
            }
        } finally {
            setCommitLoading(false);
        }
    };

    // --- Disdetta / riattiva ---
    const handleCancel = async () => {
        setCancelLoading(true);
        try {
            const next = await cancelSubscription(selectedTenant.id);
            setSubState(next);
            setScheduledChange(null);
            setIsCancelOpen(false);
            showToast({
                message: status === "trialing"
                    ? "Prova disdetta: resterà attiva fino alla fine della prova, poi non ti verrà addebitato nulla."
                    : "Abbonamento disdetto: resterà attivo fino a fine periodo.",
                type: "success"
            });
        } catch (err) {
            const name = err instanceof Error ? err.name : "";
            showToast({
                message: name === "forbidden"
                    ? "Non hai i permessi per disdire l'abbonamento."
                    : "Impossibile disdire l'abbonamento. Riprova.",
                type: "error"
            });
        } finally {
            setCancelLoading(false);
        }
    };

    const handleReactivate = async () => {
        setReactivateLoading(true);
        try {
            const next = await reactivateSubscription(selectedTenant.id);
            setSubState(next);
            showToast({ message: "Disdetta annullata: l'abbonamento continuerà.", type: "success" });
        } catch (err) {
            const name = err instanceof Error ? err.name : "";
            showToast({
                message: name === "forbidden"
                    ? "Non hai i permessi per riattivare l'abbonamento."
                    : "Impossibile riattivare l'abbonamento. Riprova.",
                type: "error"
            });
        } finally {
            setReactivateLoading(false);
        }
    };

    // --- Annulla cambio programmato (rilascia lo schedule; NON disdice) ---
    const handleCancelScheduledChange = async () => {
        setCancelScheduleLoading(true);
        try {
            const next = await cancelScheduledChange(selectedTenant.id);
            setSubState(next);
            // Azzera anche l'ottimistico locale: il banner sparisce subito anche
            // se la riconciliazione di subState dovesse arrivare con lag.
            setScheduledChange(null);
            setIsCancelScheduleOpen(false);
            showToast({ message: "Cambio programmato annullato.", type: "success" });
        } catch (err) {
            const name = err instanceof Error ? err.name : "";
            showToast({
                message: name === "forbidden"
                    ? "Non hai i permessi per annullare il cambio programmato."
                    : "Impossibile annullare il cambio programmato. Riprova.",
                type: "error"
            });
        } finally {
            setCancelScheduleLoading(false);
        }
    };

    // --- Passaggio all'annuale ---
    // Gate letto dallo stato live (subState + status tenant): l'azione non compare
    // quando il cambio sarebbe rifiutato, e dice perché. L'edge ripete gli
    // stessi controlli (fonte autoritativa); qui si evita di aprire una conferma
    // destinata a fallire.
    const oppositeInterval: BillingInterval = billingInterval === "month" ? "year" : "month";
    const intervalBlockReason: IntervalBlockReason | null = (() => {
        if (subState?.pendingChange || scheduledChange) return "pending_change";
        if (subState?.cancelAtPeriodEnd) return "cancel_scheduled";
        if (status === "past_due") return "past_due";
        if (status !== "active" && status !== "trialing") return "not_active";
        if (subState?.discount) return "discount";
        return null;
    })();

    const intervalBlockedToast = (target: BillingInterval, reason: IntervalBlockReason | null) => {
        showToast({
            message: `Il passaggio ${target === "year" ? "all'annuale" : "al mensile"} non è più disponibile: ${
                reason ? INTERVAL_BLOCK_MESSAGE[target][reason] : "riprova più tardi."
            }`,
            type: "error"
        });
    };

    const openIntervalChange = async (target: BillingInterval) => {
        setIntervalTarget(target);
        setIntervalPreview(null);
        setIntervalError(null);
        setIsIntervalOpen(true);
        setIntervalPreviewLoading(true);
        try {
            const result = await previewIntervalChange(selectedTenant.id, {
                plan: currentPlanBaseline,
                seats: currentSeatsBaseline,
                interval: target
            });
            setIntervalPreview(result);
        } catch (err) {
            if (err instanceof IntervalChangeBlockedError) {
                setIsIntervalOpen(false);
                intervalBlockedToast(target, err.reason);
                reloadSubState();
                return;
            }
            setIntervalError(mapChangeError(err, activityCount, draftMaxSeats));
        } finally {
            setIntervalPreviewLoading(false);
        }
    };

    const closeIntervalChange = () => {
        if (intervalCommitLoading) return;
        setIsIntervalOpen(false);
    };

    const handleIntervalCommit = async () => {
        if (!intervalPreview) return;
        setIntervalCommitLoading(true);
        setIntervalError(null);
        try {
            const result = await commitIntervalChange(selectedTenant.id, {
                plan: currentPlanBaseline,
                seats: currentSeatsBaseline,
                interval: intervalTarget
            });
            const nextDate = result.currentPeriodEnd ?? intervalPreview.nextDate;
            if (result.scheduledChange) {
                // year → month on an active subscription: nothing changes until
                // the paid year ends. Only the "Prossimo cambio" line moves.
                setScheduledChange({
                    planName: displayPlanName,
                    seats: currentSeatsBaseline,
                    nextDate,
                    isDowngradeToBase: false,
                    interval: "month"
                });
                showToast({
                    message: `Passaggio al mensile programmato. Fino al ${formatDate(nextDate)} non cambia nulla.`,
                    type: "success"
                });
            } else {
                // Immediate swap (month → year, or either direction while
                // trialing). Optimistic: the webhook rewrites
                // tenants.billing_interval and current_period_end
                // asynchronously; reflect the authoritative commit result now
                // so the card shows the new price and renewal date without a
                // refetch race.
                setBillingInterval(result.interval ?? intervalTarget);
                setOptimisticNextAmountCents(intervalPreview.nextAmount);
                if (result.currentPeriodEnd && status !== "trialing") {
                    patchSelectedTenant({ current_period_end: result.currentPeriodEnd });
                }
                const done = intervalTarget === "year" ? "Passaggio all'annuale completato." : "Passaggio al mensile completato.";
                showToast({
                    message: status === "trialing"
                        ? `${done} Primo addebito il ${formatDate(nextDate)}.`
                        : `${done} Prossimo rinnovo il ${formatDate(nextDate)}.`,
                    type: "success"
                });
            }
            setIsIntervalOpen(false);
            reloadSubState();
        } catch (err) {
            if (err instanceof IntervalChangeBlockedError) {
                setIsIntervalOpen(false);
                intervalBlockedToast(intervalTarget, err.reason);
                reloadSubState();
                return;
            }
            const name = err instanceof Error ? err.name : "";
            if (name === "PAYMENT_FAILED") {
                showToast({
                    message: "Addebito non riuscito. Aggiorna il metodo di pagamento e riprova.",
                    type: "error"
                });
                setIntervalError("L'addebito è stato rifiutato. Aggiorna il metodo di pagamento dal portale di fatturazione.");
            } else {
                setIntervalError(mapChangeError(err, activityCount, draftMaxSeats));
            }
        } finally {
            setIntervalCommitLoading(false);
        }
    };

    // Banner "cambio programmato" persistente: priorità al vero stato Stripe
    // (subState), fallback all'ottimistico post-commit nella finestra transitoria.
    const pendingBanner = subState?.pendingChange
        ? {
            planName: plans.find(p => p.code === subState.pendingChange!.targetPlan)?.name
                ?? subState.pendingChange!.targetPlan
                ?? "—",
            seats: subState.pendingChange!.targetSeats ?? 0,
            date: subState.pendingChange!.effectiveDate,
            isBase: subState.pendingChange!.targetPlan === "base" && selectedTenant.plan === "pro",
            interval: subState.pendingChange!.targetInterval ?? null
        }
        : scheduledChange
        ? {
            planName: scheduledChange.planName,
            seats: scheduledChange.seats,
            date: scheduledChange.nextDate,
            isBase: scheduledChange.isDowngradeToBase,
            interval: scheduledChange.interval
        }
        : null;
    // A pending change towards another interval (passo 4b): the edge refuses
    // plan/seat changes meanwhile (a phase rewrite would drop it), so the
    // "Modifica piano" entry says so instead of opening a drawer bound to fail.
    const pendingIntervalChange: BillingInterval | null =
        pendingBanner?.interval && pendingBanner.interval !== billingInterval ? pendingBanner.interval : null;
    const cancelAtPeriodEnd = subState?.cancelAtPeriodEnd ?? false;
    const periodEndDate = subState?.currentPeriodEnd ?? selectedTenant.current_period_end ?? null;

    const targetPlanName = plans.find(p => p.code === draftPlan)?.name ?? draftPlan;
    // Box combinato (B2): il piano futuro è quello del pending preservato (es.
    // Base), NON `draftPlan` (l'utente resta su Pro e aggiunge sedi). Fonte
    // corretta = `preview.plan`, calcolato dall'edge.
    const combinedPlanName = preview
        ? (plans.find(p => p.code === preview.plan)?.name ?? preview.plan)
        : targetPlanName;
    const previewIsDowngrade = preview ? preview.effective !== "now" : false;
    // Trial wording. The "when" step runs before any preview exists, so it reads
    // the live state loaded with the page; the confirm step reads the preview
    // built in the same request as its amounts, so copy and figures never
    // disagree at the exact moment the trial ends. Amounts are untouched: in
    // trial `chargeToday` is the first invoice (issued at trial end), not a
    // charge of today, and the copy places it in time accordingly.
    const whenTrialEnds = subState?.trialEndsAt ?? null;
    const previewTrialEnds = preview?.trialEndsAt ?? null;
    // Trial figure: shown only when it comes from Stripe's own preview of the
    // first invoice; otherwise the date alone.
    const previewTrialFirstInvoice = preview?.trialFirstInvoiceCents ?? null;

    // --- La mappa stato → strip (§37.5, passo 2 del registro) ---------------
    const seatsWord = displaySeats === 1 ? "sede pagata" : "sedi pagate";
    const stripTitle = `${displayPlanName} · ${displaySeats} ${seatsWord}${isFounder ? " · Founder" : ""}`;
    const renewalLabel = status === "trialing" ? "Fine prova" : "Prossimo rinnovo";
    const renewalValue = status === "trialing" ? formatDate(selectedTenant.trial_until) : formatDate(periodEndDate);
    const trialDays =
        status === "trialing" && trialDaysLeft !== null
            ? ` (${trialDaysLeft} giorn${trialDaysLeft === 1 ? "o" : "i"})`
            : "";
    // Importo scomposto (§37.7): «5 × € 59 · sconto volume −10%».
    const volumeDiscounted = currentPricing.lines.some(l => l.discounted);
    const amountLabel =
        displaySeats === 1
            ? `1 sede a ${formatEuro(currentPricing.fullPrice)}`
            : `${displaySeats} × ${formatEuro(currentPricing.fullPrice)}${
                  volumeDiscounted && currentPlan ? ` · sconto volume −${currentPlan.volume_discount_percent}%` : ""
              }`;
    const allSeatsUsed = activityCount >= displaySeats && displaySeats > 0;
    const stripFigures = [
        { value: `${activityCount} di ${displaySeats}`, label: allSeatsUsed ? "sedi pagate · tutte usate" : "sedi pagate" },
        subUnavailable
            ? { value: "Non disponibile", label: "importo" }
            : { value: `${formatEuro(displayAmount)}${unit}`, label: amountLabel },
        subUnavailable ? { value: "Non disponibile", label: renewalLabel } : { value: renewalValue, label: renewalLabel }
    ];

    const periodWord = billingInterval === "year" ? "all'anno" : "al mese";
    const seatOffer = currentPlan
        ? nextSeatOffer(
              { ...currentPlan, unit_price_cents: priceCentsFor(planPrices, currentPlan.code, billingInterval) },
              displaySeats,
              activityCount
          )
        : null;

    const couponLine = activeDiscount && discountedAmount != null
        ? ` ${formatDiscountLine(activeDiscount)}: paghi ${formatEuro(discountedAmount)}${unit}.`
        : consumedDiscount
        ? ` ${formatConsumedDiscountNote(consumedDiscount, displayAmount)}`
        : "";
    const pendingIntervalLine = pendingIntervalChange ? ` ${PENDING_INTERVAL_MESSAGE[pendingIntervalChange]}` : "";

    const changePlanAction = selfServiceEligible ? (
        <Button
            variant="primary"
            size="sm"
            onClick={() => openChange()}
            disabled={plans.length === 0 || pendingIntervalChange !== null}
            leftIcon={<Pencil size={14} />}
        >
            Modifica piano
        </Button>
    ) : (
        <Button as="a" href={CHANGE_PLAN_MAILTO} variant="primary" size="sm" leftIcon={<Mail size={14} />}>
            Scrivi all&apos;assistenza
        </Button>
    );
    const checkoutAction = (label: string) => (
        <Button
            variant="primary"
            size="sm"
            onClick={handleCheckout}
            loading={checkoutLoading}
            leftIcon={<CreditCard size={14} />}
        >
            {label}
        </Button>
    );
    const portalAction = (label: string) => (
        <Button
            variant="primary"
            size="sm"
            onClick={handlePortal}
            loading={portalLoading}
            leftIcon={<ExternalLink size={14} />}
        >
            {label}
        </Button>
    );

    const strip: { tone: StatusStripTone; badge: string; description: string; action: ReactNode } = (() => {
        if (subUnavailable && subStateUnavailable) {
            // Lo stato del tenant è vero (viene dal DB); è Stripe che non si
            // legge: il badge lo dice, il tono e la riga dicono il resto.
            return {
                tone: "warning",
                badge: STATUS_BADGE[status ?? ""] ?? "Non leggibile",
                description: SUBSCRIPTION_UNAVAILABLE_MESSAGE[subStateUnavailable],
                action:
                    subStateUnavailable === "subscription_missing" ? (
                        <Button as="a" href={supportMailto} variant="secondary" size="sm" leftIcon={<Mail size={14} />}>
                            Scrivi all&apos;assistenza
                        </Button>
                    ) : (
                        <Button variant="secondary" size="sm" onClick={reloadSubState} leftIcon={<RotateCcw size={14} />}>
                            Ricarica
                        </Button>
                    )
            };
        }
        if (status === "canceled") {
            return {
                tone: "danger",
                badge: STATUS_BADGE.canceled,
                description: `L'abbonamento è terminato il ${formatDate(periodEndDate)}. Menù e pagine pubbliche sono offline.`,
                action: canManageBilling && canStartCheckout ? checkoutAction("Riattiva abbonamento") : null
            };
        }
        if (status === "suspended") {
            return hasSubscriptionRecord
                ? {
                      tone: "danger",
                      badge: STATUS_BADGE.suspended,
                      description: "L'abbonamento è sospeso: pagamento non riuscito o messo in pausa. Si riprende dal portale.",
                      action: canManageBilling ? portalAction("Riprendi su Stripe") : null
                  }
                : {
                      tone: "danger",
                      badge: "Da attivare",
                      description: "Questa azienda non ha ancora un abbonamento: menù e pagine pubbliche sono offline.",
                      action: canManageBilling ? checkoutAction("Attiva ora") : null
                  };
        }
        if (status === "past_due") {
            return {
                tone: "warning",
                badge: STATUS_BADGE.past_due,
                description: "L'ultimo addebito non è riuscito. Aggiorna il metodo di pagamento per non perdere l'accesso.",
                action: canManageBilling ? portalAction("Aggiorna il metodo di pagamento") : null
            };
        }
        if (cancelAtPeriodEnd) {
            return {
                tone: "warning",
                badge: "In disdetta",
                description:
                    status === "trialing"
                        ? `La prova resta attiva fino al ${formatDate(periodEndDate)}, poi non ti verrà addebitato nulla.`
                        : `Resta attivo fino al ${formatDate(periodEndDate)}, poi non si rinnova e non ti verrà addebitato nulla.`,
                action: canCancelBilling ? (
                    <Button variant="primary" size="sm" onClick={handleReactivate} loading={reactivateLoading} leftIcon={<RotateCcw size={14} />}>
                        Riattiva
                    </Button>
                ) : null
            };
        }
        if (status === "trialing") {
            const end = `${formatDate(selectedTenant.trial_until)}${trialDays}`;
            return hasSubscriptionRecord
                ? {
                      tone: "info",
                      badge: STATUS_BADGE.trialing,
                      description: `La prova finisce il ${end}. Il primo addebito di ${formatEuro(displayAmount)} sarà quel giorno.${couponLine}${pendingIntervalLine}`,
                      action: canManageBilling ? changePlanAction : null
                  }
                : {
                      tone: "info",
                      badge: STATUS_BADGE.trialing,
                      description: `La prova finisce il ${end}. Senza un metodo di pagamento l'azienda si ferma quel giorno.`,
                      action: canManageBilling ? checkoutAction("Attiva ora") : null
                  };
        }
        // active (o stato ignoto: si comporta da attivo, il badge lo dice)
        return {
            tone: "success",
            badge: STATUS_BADGE[status ?? ""] ?? (status ?? "—"),
            description: `Si rinnova il ${formatDate(periodEndDate)}.${couponLine}${pendingIntervalLine}`,
            action: canManageBilling && !subUnavailable ? changePlanAction : null
        };
    })();

    return (
        <div className={styles.page}>
            {canManageBilling && !canCancelBilling && (
                <InlineBanner variant="info">
                    Solo il proprietario può disdire l&apos;abbonamento. Tu puoi cambiare piano, sedi pagate e metodo di
                    pagamento.
                </InlineBanner>
            )}

            <StatusStrip
                tone={strip.tone}
                badge={strip.badge}
                title={stripTitle}
                description={strip.description}
                figures={stripFigures}
                action={strip.action ?? undefined}
            />

            {status === "canceled" && (
                <Text as="p" variant="caption" colorVariant="muted" className={styles.exitNote}>
                    Non vuoi rinnovare?{" "}
                    <button type="button" className={styles.exitLink} onClick={() => navigate("/workspace")}>
                        Gestisci o elimina l&apos;azienda dal Workspace.
                    </button>
                </Text>
            )}

            {/* --- La prossima sede (§37.6, §37.7) --- */}
            {seatOffer && !isTerminal && !subUnavailable && (
                <Card title="La prossima sede">
                    <div className={styles.nextSeat}>
                        {seatOffer.kind === "free" ? (
                            <>
                                <Text as="p" variant="body-sm">
                                    Hai ancora {seatOffer.freeSeats} {seatOffer.freeSeats === 1 ? "sede pagata libera" : "sedi pagate libere"}: aprirne una non costa niente.
                                </Text>
                                <div className={styles.nextSeatAction}>
                                    <Button variant="secondary" size="sm" onClick={() => navigate(`/business/${selectedTenant.id}/locations`)}>
                                        Vai alle sedi
                                    </Button>
                                </div>
                            </>
                        ) : seatOffer.kind === "upgrade" ? (
                            <>
                                <Text as="p" variant="body-sm">
                                    Il piano {displayPlanName} copre {displaySeats} {displaySeats === 1 ? "sede" : "sedi"} su {displaySeats}. Per
                                    aprire la {displaySeats + 1}ª servono
                                </Text>
                                <Text as="p" variant="title-md" weight={700}>
                                    {formatCents(seatOffer.extraPriceCents)} {periodWord} in più
                                </Text>
                                <Text as="p" variant="caption" colorVariant="muted">
                                    {formatCents(seatOffer.listPriceCents)} con lo sconto volume del {seatOffer.volumeDiscountPercent}%,{" "}
                                    {status === "trialing"
                                        ? `senza addebito fino al ${formatDate(selectedTenant.trial_until)}.`
                                        : `addebitati subito in proporzione ai giorni che restano fino al ${formatDate(periodEndDate)}.`}
                                </Text>
                                {canManageBilling && (
                                    <div className={styles.nextSeatAction}>
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            onClick={() => openChange()}
                                            disabled={plans.length === 0 || pendingIntervalChange !== null}
                                        >
                                            Aggiungi una sede
                                        </Button>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <Text as="p" variant="body-sm">
                                    Il piano copre {seatOffer.cap} sedi, il massimo in autonomia. Per la {seatOffer.cap + 1}ª serve un piano dedicato.
                                </Text>
                                <div className={styles.nextSeatAction}>
                                    <Button as="a" href={CHANGE_PLAN_MAILTO} variant="secondary" size="sm" leftIcon={<Mail size={14} />}>
                                        Scrivi all&apos;assistenza
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>
                </Card>
            )}

            {/* --- Utilizzo AI (FASE 5) --- */}
            <AiUsageSection usage={aiUsage} planName={displayPlanName} seats={displaySeats} />

            {/* --- Gestione (§44.8: ListRow con chevron, una riga per uscita) --- */}
            {canManageBilling && (pendingBanner || hasSubscriptionRecord) && (
                <Card title="Gestione" flush>
                    {!subStateLoading && pendingBanner && (
                        <ListRow
                            leading={<CalendarRange size={20} aria-hidden />}
                            title={`Cambio programmato: ${formatPendingChangeLabel({
                                planName: pendingBanner.planName,
                                seats: pendingBanner.seats,
                                interval: pendingBanner.interval,
                                dateLabel: formatDate(pendingBanner.date)
                            })}`}
                            subtitle={pendingBanner.isBase ? "Ordini e prenotazioni da QR verranno disattivati al rinnovo." : undefined}
                            trailing={
                                <Button variant="secondary" size="sm" onClick={() => setIsCancelScheduleOpen(true)} leftIcon={<XCircle size={14} />}>
                                    Annulla cambio
                                </Button>
                            }
                        />
                    )}

                    {hasSubscriptionRecord && (
                        <ListRow
                            leading={<ExternalLink size={20} aria-hidden />}
                            title="Portale di fatturazione"
                            subtitle="Metodo di pagamento, fatture e ricevute su Stripe."
                            onClick={() => void handlePortal()}
                            trailing={portalLoading ? <Loader size="sm" /> : <ChevronRight size={16} aria-hidden />}
                        />
                    )}

                    {hasSubscriptionRecord && !isTerminal && !subUnavailable && (() => {
                        const alreadyPending = !subStateLoading && pendingIntervalChange === oppositeInterval;
                        const blocked = !subStateLoading && intervalBlockReason !== null;
                        const subtitle = alreadyPending
                            ? "Lo trovi qui sopra, in «Cambio programmato»."
                            : blocked
                            ? INTERVAL_BLOCK_MESSAGE[oppositeInterval][intervalBlockReason]
                            : oppositeInterval === "year"
                            ? "Stesso piano e stesse sedi, fatturazione una volta all'anno."
                            : "Stesso piano e stesse sedi, fatturazione ogni mese dalla scadenza dell'anno in corso.";
                        const enabled = !subStateLoading && !alreadyPending && !blocked;
                        return (
                            <ListRow
                                leading={<CalendarRange size={20} aria-hidden />}
                                title={INTERVAL_ACTION_LABEL[oppositeInterval]}
                                subtitle={subtitle}
                                wrapSubtitle
                                muted={!enabled}
                                onClick={enabled ? () => void openIntervalChange(oppositeInterval) : undefined}
                                trailing={enabled ? <ChevronRight size={16} aria-hidden /> : undefined}
                            />
                        );
                    })()}

                    {canCancelBilling && hasSubscriptionRecord && !isTerminal && !subUnavailable && (
                        <ListRow
                            leading={<XCircle size={20} aria-hidden />}
                            title="Disdici abbonamento"
                            subtitle={
                                cancelAtPeriodEnd
                                    ? `Disdetta programmata per il ${formatDate(periodEndDate)}: la riattivi qui sopra.`
                                    : status === "trialing"
                                    ? `Ha effetto alla fine della prova, il ${formatDate(periodEndDate)}. Non ti verrà addebitato nulla.`
                                    : "Ha effetto a fine periodo: nessun rimborso, tutto resta attivo fino ad allora."
                            }
                            wrapSubtitle
                            muted={cancelAtPeriodEnd}
                            onClick={cancelAtPeriodEnd ? undefined : () => setIsCancelOpen(true)}
                            trailing={cancelAtPeriodEnd ? undefined : <ChevronRight size={16} aria-hidden />}
                        />
                    )}
                </Card>
            )}

            {/* --- Drawer "Modifica piano" self-service --- */}
            <SystemDrawer open={isChangeOpen} onClose={closeChange} width={560}>
                <DrawerLayout
                    header={
                        <Text variant="title-sm" weight={600}>
                            {changeStep === "confirm"
                                ? "Conferma il cambio"
                                : changeStep === "when"
                                ? "Quando applicare"
                                : "Modifica piano e sedi"}
                        </Text>
                    }
                    footer={
                        changeStep === "select" ? (
                            <>
                                <Button variant="secondary" onClick={closeChange}>
                                    Annulla
                                </Button>
                                <Button
                                    variant="primary"
                                    onClick={handleToWhen}
                                    disabled={!hasChange}
                                >
                                    Continua
                                </Button>
                            </>
                        ) : changeStep === "when" ? (
                            <>
                                <Button variant="secondary" onClick={() => setChangeStep("select")}>
                                    Indietro
                                </Button>
                                <Button variant="primary" onClick={handleToConfirm} loading={previewLoading}>
                                    Continua
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button
                                    variant="secondary"
                                    onClick={() => setChangeStep("when")}
                                    disabled={commitLoading}
                                >
                                    Indietro
                                </Button>
                                <Button
                                    variant="primary"
                                    onClick={handleCommit}
                                    loading={commitLoading}
                                >
                                    {preview?.classification === "combined"
                                        ? (previewTrialEnds ? "Aggiungi le sedi e programma il cambio" : "Paga le sedi e programma il cambio")
                                        : previewIsDowngrade
                                        ? "Programma il cambio"
                                        : previewTrialEnds
                                        ? "Conferma"
                                        : "Conferma e paga"}
                                </Button>
                            </>
                        )
                    }
                >
                    {changeStep === "select" ? (
                        <div className={styles.changeBody}>
                            <PlanSeatsSelector
                                plans={plans}
                                planCode={draftPlan}
                                onPlanChange={handleDraftPlan}
                                unitPriceCentsByPlan={draftUnitPriceCentsByPlan}
                                planPrices={planPrices}
                                billingInterval={billingInterval}
                                seats={draftSeats}
                                onSeatsChange={setDraftSeats}
                                breakdown={draftBreakdown}
                                discountPercent={draftDiscount}
                                overLimit={false}
                                maxSeats={draftMaxSeats}
                                minSeats={minSeats}
                                stepperMax={draftMaxSeats}
                                disabled={previewLoading}
                                footerHint={
                                    draftSeats >= draftMaxSeats ? (
                                        <Text variant="body-sm" colorVariant="muted">
                                            Hai più di {draftMaxSeats} sedi?{" "}
                                            <a href={CHANGE_PLAN_MAILTO}>Scrivici</a> per un&apos;offerta dedicata.
                                        </Text>
                                    ) : null
                                }
                            />

                            {isDowngradeToBase && (
                                <div className={styles.changeWarning}>
                                    <AlertTriangle size={16} />
                                    <Text variant="body-sm" weight={500}>
                                        Passando a Base, ordini e prenotazioni da QR verranno disattivati al rinnovo.
                                    </Text>
                                </div>
                            )}

                            {changeError && (
                                <Text variant="body-sm" className={styles.changeError}>
                                    {changeError}
                                </Text>
                            )}
                        </div>
                    ) : changeStep === "when" ? (
                        <div className={styles.changeBody}>
                            {whenKind === "choice" ? (
                                <>
                                    <Text variant="body-sm" colorVariant="muted">
                                        Hai un cambio già programmato. Quando vuoi che le sedi in più siano attive?
                                    </Text>
                                    <div className={styles.whenOptions}>
                                        <button
                                            type="button"
                                            className={`${styles.whenOption} ${applyAt === "now" ? styles.whenOptionSelected : ""}`}
                                            onClick={() => setApplyAt("now")}
                                        >
                                            <Text variant="body" weight={600}>Attive subito</Text>
                                            <Text variant="body-sm" colorVariant="muted">
                                                {whenTrialEnds
                                                    ? `Le sedi in più valgono da ora. Sei in prova: nessun addebito fino al ${formatDate(whenTrialEnds)}.`
                                                    : "Le sedi in più valgono da ora: paghi il prorata per i giorni rimanenti del periodo."}
                                            </Text>
                                        </button>
                                        <button
                                            type="button"
                                            className={`${styles.whenOption} ${applyAt === "renewal" ? styles.whenOptionSelected : ""}`}
                                            onClick={() => setApplyAt("renewal")}
                                        >
                                            <Text variant="body" weight={600}>Dal rinnovo</Text>
                                            <Text variant="body-sm" colorVariant="muted">
                                                Nessun addebito oggi. Le sedi partono dal {formatDate(periodEndDate)},
                                                sul piano {pendingPlanName} già programmato.
                                            </Text>
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className={styles.whenInfo}>
                                    {whenKind === "tier-up" && (
                                        <Text variant="body-sm">
                                            L&apos;upgrade si applica <strong>subito</strong>: avrai le nuove
                                            funzioni da ora
                                            {whenTrialEnds
                                                ? `. Sei in prova: nessun addebito fino al ${formatDate(whenTrialEnds)}.`
                                                : " e paghi il prorata per i giorni rimanenti del periodo."}
                                        </Text>
                                    )}
                                    {whenKind === "seats-up" && (
                                        <Text variant="body-sm">
                                            Le sedi in più si attivano <strong>subito</strong>
                                            {whenTrialEnds
                                                ? `. Sei in prova: nessun addebito fino al ${formatDate(whenTrialEnds)}.`
                                                : ": paghi il prorata per i giorni rimanenti del periodo."}
                                        </Text>
                                    )}
                                    {whenKind === "mixed" && (
                                        <Text variant="body-sm">
                                            Le sedi in più valgono <strong>subito</strong>{" "}
                                            {whenTrialEnds ? "(sei in prova: nessun addebito)" : "(paghi il prorata)"}; il
                                            passaggio a {targetPlanName} avviene{" "}
                                            <strong>{whenTrialEnds ? "alla fine della prova" : "al rinnovo"}</strong>{" "}
                                            ({formatDate(periodEndDate)}).
                                        </Text>
                                    )}
                                    {whenKind === "downgrade" && (
                                        <Text variant="body-sm">
                                            La modifica si applica <strong>al rinnovo</strong>{" "}
                                            ({formatDate(periodEndDate)}): nessun addebito oggi, mantieni tutto
                                            fino ad allora.
                                        </Text>
                                    )}
                                    {isDowngradeToBase && (whenKind === "downgrade" || whenKind === "mixed") && (
                                        <div className={styles.changeWarning}>
                                            <AlertTriangle size={16} />
                                            <Text variant="body-sm" weight={500}>
                                                Passando a Base, ordini e prenotazioni da QR verranno disattivati
                                                al rinnovo.
                                            </Text>
                                        </div>
                                    )}
                                </div>
                            )}

                            {changeError && (
                                <Text variant="body-sm" className={styles.changeError}>
                                    {changeError}
                                </Text>
                            )}
                        </div>
                    ) : (
                        <div className={styles.changeBody}>
                            {preview && (
                                <div className={styles.confirmBox}>
                                    {preview.classification === "combined" ? (
                                        <>
                                            <div className={styles.confirmRow}>
                                                <Text variant="body" weight={600}>Oggi paghi</Text>
                                                <Text variant="title-sm" weight={700}>
                                                    {previewTrialEnds ? formatCents(0) : formatCents(preview.chargeToday)}
                                                </Text>
                                            </div>
                                            <Text variant="body-sm" colorVariant="muted">
                                                {previewTrialEnds
                                                    ? `Sei in prova gratuita: le sedi aggiunte sono attive subito e non ti viene addebitato nulla fino al ${formatDate(previewTrialEnds)}.`
                                                    : seatDir === 1
                                                    ? "La sede aggiunta è attiva subito, riproporzionata a tariffa Pro fino al rinnovo."
                                                    : `Le ${seatDir} sedi aggiunte sono attive subito, riproporzionate a tariffa Pro fino al rinnovo.`}
                                            </Text>
                                            <div className={styles.confirmDivider} />
                                            <Text variant="body-sm" colorVariant="muted">
                                                Il piano passerà a {combinedPlanName} il {formatDate(preview.nextDate)};{" "}
                                                {previewTrialEnds
                                                    ? previewTrialFirstInvoice != null
                                                        ? `il primo addebito, quel giorno, sarà di ${formatCents(previewTrialFirstInvoice)}${unit}.`
                                                        : "il primo addebito sarà quel giorno."
                                                    : `da quella data pagherai ${formatCents(preview.nextAmount)}${unit}.`}
                                            </Text>
                                            <div className={styles.changeWarning}>
                                                <AlertTriangle size={16} />
                                                <Text variant="body-sm" weight={500}>
                                                    Ordini e prenotazioni da QR verranno disattivati al rinnovo.
                                                </Text>
                                            </div>
                                        </>
                                    ) : preview.effective === "now" ? (
                                        <>
                                            <div className={styles.confirmRow}>
                                                <Text variant="body" weight={600}>Oggi paghi</Text>
                                                <Text variant="title-sm" weight={700}>
                                                    {previewTrialEnds ? formatCents(0) : formatCents(preview.chargeToday)}
                                                </Text>
                                            </div>
                                            <Text variant="body-sm" colorVariant="muted">
                                                {previewTrialEnds
                                                    ? `Sei in prova gratuita: le novità sono attive subito e non ti viene addebitato nulla fino al ${formatDate(previewTrialEnds)}.`
                                                    : "Importo riproporzionato per i giorni rimanenti del periodo in corso."}
                                            </Text>
                                            <div className={styles.confirmDivider} />
                                            <div className={styles.confirmRow}>
                                                <Text variant="body-sm" colorVariant="muted">
                                                    {previewTrialEnds
                                                        ? `Primo addebito, il ${formatDate(previewTrialEnds)}`
                                                        : `Dal ${formatDate(preview.nextDate)}`}
                                                </Text>
                                                {previewTrialEnds ? (
                                                    previewTrialFirstInvoice != null && (
                                                        <Text variant="body" weight={600}>
                                                            {formatCents(previewTrialFirstInvoice)}{unit}
                                                        </Text>
                                                    )
                                                ) : (
                                                    <Text variant="body" weight={600}>
                                                        {formatCents(preview.nextAmount)}{unit}
                                                    </Text>
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className={styles.confirmRow}>
                                                <Text variant="body" weight={600}>Oggi paghi</Text>
                                                <Text variant="title-sm" weight={700}>€0,00</Text>
                                            </div>
                                            <Text variant="body-sm" colorVariant="muted">
                                                Il tuo piano passerà a {combinedPlanName} il {formatDate(preview.nextDate)}.
                                                Da quella data pagherai {formatCents(preview.nextAmount)}{unit}.
                                            </Text>
                                            {isDowngradeToBase && (
                                                <div className={styles.changeWarning}>
                                                    <AlertTriangle size={16} />
                                                    <Text variant="body-sm" weight={500}>
                                                        Ordini e prenotazioni da QR verranno disattivati al rinnovo.
                                                    </Text>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            {changeError && (
                                <Text variant="body-sm" className={styles.changeError}>
                                    {changeError}
                                </Text>
                            )}
                        </div>
                    )}
                </DrawerLayout>
            </SystemDrawer>

            {/* --- Drawer cambio di intervallo (passi 4a/4b) --- */}
            <SystemDrawer open={isIntervalOpen} onClose={closeIntervalChange} width={480}>
                <DrawerLayout
                    header={
                        <Text variant="title-sm" weight={600}>{INTERVAL_ACTION_LABEL[intervalTarget]}</Text>
                    }
                    footer={
                        <>
                            <Button variant="secondary" onClick={closeIntervalChange} disabled={intervalCommitLoading}>
                                Annulla
                            </Button>
                            <Button
                                variant="primary"
                                onClick={handleIntervalCommit}
                                loading={intervalCommitLoading}
                                disabled={!intervalPreview || intervalPreviewLoading}
                            >
                                {intervalPreview && !intervalPreview.trialEndsAt && intervalTarget === "year"
                                    ? `Conferma e paga ${formatCents(intervalPreview.chargeToday)}`
                                    : "Conferma"}
                            </Button>
                        </>
                    }
                >
                    <div className={styles.changeBody}>
                        {intervalPreviewLoading && (
                            <div className={styles.confirmBox}>
                                <Skeleton height="1.6em" width="70%" radius="4px" />
                                <Skeleton height="1.2em" width="90%" radius="4px" />
                                <Skeleton height="1.2em" width="80%" radius="4px" />
                            </div>
                        )}
                        {intervalPreview && (
                            <div className={styles.confirmBox}>
                                {intervalPreview.trialEndsAt ? (
                                    <>
                                        <div className={styles.confirmRow}>
                                            <Text variant="title-sm" weight={700}>Nessun addebito ora.</Text>
                                        </div>
                                        <div className={styles.confirmDivider} />
                                        <Text variant="body-sm" colorVariant="muted">
                                            {displayPlanName} · {displaySeats} {displaySeats === 1 ? "sede" : "sedi"}:{" "}
                                            {formatCents(intervalPreview.nextAmount)} {intervalTarget === "year" ? "all'anno" : "al mese"}.
                                        </Text>
                                        <Text variant="body-sm" colorVariant="muted">
                                            Il primo addebito {intervalTarget === "year" ? "annuale" : "mensile"} parte alla fine della prova, il{" "}
                                            {formatDate(intervalPreview.nextDate ?? intervalPreview.trialEndsAt)}.
                                        </Text>
                                    </>
                                ) : intervalTarget === "month" ? (
                                    <>
                                        <div className={styles.confirmRow}>
                                            <Text variant="title-sm" weight={700}>
                                                Fino alla scadenza dell&apos;anno in corso non cambia nulla: stesso piano, stesse sedi, nessun rimborso e nessun addebito.
                                            </Text>
                                        </div>
                                        <div className={styles.confirmDivider} />
                                        <Text variant="body-sm" colorVariant="muted">
                                            Il passaggio al mensile avviene il{" "}
                                            <strong>{formatDate(intervalPreview.nextDate)}</strong>, alla scadenza dell&apos;anno in corso.
                                        </Text>
                                        <Text variant="body-sm" colorVariant="muted">
                                            Da quella data: {displayPlanName} · {displaySeats} {displaySeats === 1 ? "sede" : "sedi"},{" "}
                                            <strong>{formatCents(intervalPreview.nextAmount)} al mese</strong>.
                                        </Text>
                                        <div className={styles.confirmDivider} />
                                        <Text variant="body-sm" colorVariant="muted">
                                            Puoi annullare la richiesta in qualsiasi momento prima del{" "}
                                            {formatDate(intervalPreview.nextDate)}, da questa pagina.
                                        </Text>
                                    </>
                                ) : (
                                    <>
                                        <div className={styles.confirmRow}>
                                            <Text variant="body" weight={600}>Addebito immediato</Text>
                                            <Text variant="title-sm" weight={700}>
                                                {formatCents(intervalPreview.chargeToday)}
                                            </Text>
                                        </div>
                                        <div className={styles.confirmDivider} />
                                        <Text variant="body-sm" colorVariant="muted">
                                            {displayPlanName} · {displaySeats} {displaySeats === 1 ? "sede" : "sedi"}:{" "}
                                            {formatCents(intervalPreview.nextAmount)} all&apos;anno.
                                        </Text>
                                        <Text variant="body-sm" colorVariant="muted">
                                            Il ciclo di fatturazione riparte oggi. Prossimo rinnovo:{" "}
                                            {formatDate(intervalPreview.nextDate)}.
                                        </Text>
                                        <Text variant="body-sm" colorVariant="muted">
                                            Non consumato del mese in corso già scalato:{" "}
                                            −{formatCents(Math.max(0, -(intervalPreview.prorationCreditCents ?? 0)))}.
                                        </Text>
                                        <div className={styles.confirmDivider} />
                                        <Text variant="body-sm" colorVariant="muted">
                                            L&apos;addebito avviene ora sul metodo di pagamento salvato.
                                        </Text>
                                    </>
                                )}
                            </div>
                        )}
                        {intervalError && (
                            <Text variant="body-sm" className={styles.changeError}>
                                {intervalError}
                            </Text>
                        )}
                    </div>
                </DrawerLayout>
            </SystemDrawer>

            {/* --- Drawer conferma disdetta --- */}
            <SystemDrawer open={isCancelOpen} onClose={() => { if (!cancelLoading) setIsCancelOpen(false); }} width={480}>
                <DrawerLayout
                    header={
                        <Text variant="title-sm" weight={600}>Disdici abbonamento</Text>
                    }
                    footer={
                        <>
                            <Button variant="secondary" onClick={() => setIsCancelOpen(false)} disabled={cancelLoading}>
                                Annulla
                            </Button>
                            <Button variant="danger" onClick={handleCancel} loading={cancelLoading}>
                                Disdici abbonamento
                            </Button>
                        </>
                    }
                >
                    <div className={styles.changeBody}>
                        <Text variant="body">
                            {status === "trialing" ? (
                                <>
                                    La prova resterà attiva fino al <strong>{formatDate(periodEndDate)}</strong>,
                                    poi verrà disdetta. <strong>Non ti verrà addebitato nulla</strong>: la prova è gratuita.
                                </>
                            ) : (
                                <>
                                    L&apos;abbonamento resterà attivo fino al <strong>{formatDate(periodEndDate)}</strong>,
                                    poi verrà disdetto. <strong>Nessun rimborso</strong> per il periodo già pagato.
                                </>
                            )}
                        </Text>
                        <div className={styles.changeWarning}>
                            <AlertTriangle size={16} />
                            <Text variant="body-sm" weight={500}>
                                Fino a quella data ordini, prenotazioni e cataloghi restano pienamente attivi.{" "}
                                {status === "trialing"
                                    ? "Potrai annullare la disdetta in qualsiasi momento prima di quella data."
                                    : "Potrai annullare la disdetta in qualsiasi momento prima del rinnovo."}
                            </Text>
                        </div>
                    </div>
                </DrawerLayout>
            </SystemDrawer>

            {/* --- Drawer conferma annullo cambio programmato --- */}
            <SystemDrawer
                open={isCancelScheduleOpen}
                onClose={() => { if (!cancelScheduleLoading) setIsCancelScheduleOpen(false); }}
                width={480}
            >
                <DrawerLayout
                    header={
                        <Text variant="title-sm" weight={600}>Annulla cambio programmato</Text>
                    }
                    footer={
                        <>
                            <Button
                                variant="secondary"
                                onClick={() => setIsCancelScheduleOpen(false)}
                                disabled={cancelScheduleLoading}
                            >
                                Mantieni il cambio
                            </Button>
                            <Button variant="primary" onClick={handleCancelScheduledChange} loading={cancelScheduleLoading}>
                                Annulla cambio programmato
                            </Button>
                        </>
                    }
                >
                    <div className={styles.changeBody}>
                        <Text variant="body">
                            Vuoi annullare il cambio programmato? Il tuo piano resterà{" "}
                            <strong>{displayPlanName} · {displaySeats} {displaySeats === 1 ? "sede" : "sedi"}</strong>{" "}
                            con fatturazione {INTERVAL_ADJECTIVE[billingInterval]} e l&apos;abbonamento continuerà a rinnovarsi normalmente.
                        </Text>
                    </div>
                </DrawerLayout>
            </SystemDrawer>
        </div>
    );
}

function formatDate(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("it-IT", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}
