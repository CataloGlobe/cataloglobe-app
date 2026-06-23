import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTenant } from "@/context/useTenant";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { useToast } from "@/context/Toast/ToastContext";
import {
    createCheckoutSession,
    createPortalSession,
    previewSubscriptionChange,
    commitSubscriptionChange,
    getSubscriptionState,
    cancelSubscription,
    reactivateSubscription
} from "@/services/supabase/billing";
import type { SubscriptionChangePreview, SubscriptionState } from "@/services/supabase/billing";
import { getPlanByCode, listPublicPlans } from "@/services/supabase/plans";
import { getActivityCount } from "@/services/supabase/activities";
import { calculateGraduatedFromPlan } from "@/utils/pricing";
import { canDoOnTenant } from "@/lib/permissions";
import { usePermissions } from "@/context/PermissionsContext";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { PlanSeatsSelector } from "@/components/ui/PlanSeatsSelector/PlanSeatsSelector";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { usePageHeader } from "@/context/usePageHeader";
import Text from "@/components/ui/Text/Text";
import { Badge } from "@/components/ui/Badge/Badge";
import { Button } from "@/components/ui/Button/Button";
import { ExternalLink, CreditCard, Shield, Lock, Info, Mail, Pencil, AlertTriangle, XCircle, RotateCcw } from "lucide-react";
import type { Plan, PlanCode } from "@/types/plan";
import styles from "./SubscriptionPage.module.scss";

const STATUS_CONFIG: Record<string, { label: string; variant: "success" | "primary" | "warning" | "danger" }> = {
    active:    { label: "Attivo",    variant: "success" },
    trialing:  { label: "In prova",  variant: "primary" },
    past_due:  { label: "Scaduto",   variant: "warning" },
    canceled:  { label: "Cancellato", variant: "danger" },
    suspended: { label: "Sospeso",   variant: "danger" }
};

const CHANGE_PLAN_EMAIL = "support@cataloglobe.com";
const CHANGE_PLAN_MAILTO = `mailto:${CHANGE_PLAN_EMAIL}?subject=${encodeURIComponent("Cambio piano CataloGlobe")}`;

function formatEuro(value: number): string {
    return `€${value.toFixed(2).replace(".", ",")}`;
}

function formatCents(cents: number): string {
    return formatEuro(cents / 100);
}

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
        case "SEATS_ADDED_DOWNGRADE_NOT_SCHEDULED":
            return "Le sedi sono state aggiunte e pagate, ma il passaggio a Base non è stato programmato. Riprova.";
        default:
            return "Si è verificato un errore. Riprova.";
    }
}

export default function SubscriptionPage() {
    const { selectedTenant, loading } = useTenant();
    const { permissions, loading: permissionsLoading } = usePermissions();
    const canReadBilling = permissions ? canDoOnTenant(permissions, "billing.read") : false;
    const canManageBilling = permissions ? canDoOnTenant(permissions, "billing.manage") : false;
    const canCancelBilling = permissions ? canDoOnTenant(permissions, "billing.cancel") : false;
    const { status, trialDaysLeft, hasPaymentMethod } = useSubscriptionGuard();
    const { showToast } = useToast();
    const navigate = useNavigate();

    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const [portalLoading, setPortalLoading] = useState(false);
    const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);

    // --- Stato flusso "Modifica piano" self-service ---
    const [plans, setPlans] = useState<Plan[]>([]);
    const [activityCount, setActivityCount] = useState(0);
    const [isChangeOpen, setIsChangeOpen] = useState(false);
    const [changeStep, setChangeStep] = useState<"select" | "confirm">("select");
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
    const [optimisticMonthlyCents, setOptimisticMonthlyCents] = useState<number | null>(null);
    const [scheduledChange, setScheduledChange] = useState<{
        planName: string;
        seats: number;
        nextDate: string | null;
        isDowngradeToBase: boolean;
    } | null>(null);

    // --- Stato abbonamento live (banner persistente + disdetta) ---
    const [subState, setSubState] = useState<SubscriptionState | null>(null);
    const [isCancelOpen, setIsCancelOpen] = useState(false);
    const [cancelLoading, setCancelLoading] = useState(false);
    const [reactivateLoading, setReactivateLoading] = useState(false);

    const tenantId = selectedTenant?.id ?? null;
    const reloadSubState = useCallback(async () => {
        if (!tenantId) return;
        try {
            setSubState(await getSubscriptionState(tenantId));
        } catch (err) {
            console.error("[SubscriptionPage] subscription state load failed:", err);
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

    // Carica piani + conteggio sedi (per le card del selettore e il floor).
    useEffect(() => {
        if (!selectedTenant?.id || !canManageBilling) return;
        listPublicPlans()
            .then(setPlans)
            .catch(err => {
                console.error("[SubscriptionPage] plans list failed:", err);
                setPlans([]);
            });
        getActivityCount(selectedTenant.id)
            .then(setActivityCount)
            .catch(err => console.error("[SubscriptionPage] activity count failed:", err));
        reloadSubState();
    }, [selectedTenant?.id, canManageBilling, reloadSubState]);

    usePageHeader({
        title: "Abbonamento",
        subtitle: !canReadBilling
            ? undefined
            : "Gestisci il piano e il metodo di pagamento della tua attività.",
        sticky: true,
    });

    const paidSeats = selectedTenant?.paid_seats ?? 0;

    const currentPricing = useMemo(() => {
        if (!currentPlan) return { lines: [], subtotal: 0, fullPrice: 0, discountedPrice: 0 };
        return calculateGraduatedFromPlan(currentPlan, paidSeats);
    }, [currentPlan, paidSeats]);

    // --- Derivati del flusso di cambio (sicuri anche prima del load) ---
    const draftPlanObj = plans.find(p => p.code === draftPlan) ?? null;
    const draftMaxSeats = draftPlanObj?.max_self_service_seats ?? 5;
    const draftDiscount = draftPlanObj?.volume_discount_percent ?? 10;
    const minSeats = Math.max(1, activityCount);
    const selfServiceCap = currentPlan?.max_self_service_seats ?? 5;
    const selfServiceEligible = activityCount <= selfServiceCap;

    const draftBreakdown = useMemo(() => {
        if (!draftPlanObj) return { lines: [], subtotal: 0, fullPrice: 0, discountedPrice: 0 };
        return calculateGraduatedFromPlan(draftPlanObj, draftSeats);
    }, [draftPlanObj, draftSeats]);

    if (loading || !selectedTenant) return null;

    if (!permissionsLoading && permissions && !canReadBilling) {
        return (
            <div className={styles.page}>
                <div className={styles.restrictedCard}>
                    <EmptyState
                        icon={<Lock size={40} strokeWidth={1.5} />}
                        title="Non hai accesso all'abbonamento"
                        description="La gestione dell'abbonamento è riservata al proprietario. Contatta il proprietario se hai bisogno di accedere a queste informazioni."
                    />
                </div>
            </div>
        );
    }

    const statusInfo = STATUS_CONFIG[status ?? ""] ?? { label: status, variant: "secondary" as const };
    const isTerminal = status === "canceled" || status === "suspended";
    const isFounder = selectedTenant.is_founder === true;
    const planName = currentPlan?.name ?? "—";

    // Valori mostrati: l'override ottimistico (post-upgrade) prevale sul dato
    // letto da `tenants` finché il webhook non ha sincronizzato.
    const displayPlanName = optimisticPlan
        ? (plans.find(p => p.code === optimisticPlan)?.name ?? optimisticPlan)
        : planName;
    const displaySeats = optimisticSeats ?? paidSeats;
    const displayMonthly = optimisticMonthlyCents != null
        ? optimisticMonthlyCents / 100
        : currentPricing.subtotal;

    const renewalDateText = (() => {
        if (status === "trialing") {
            if (trialDaysLeft !== null) {
                return `${formatDate(selectedTenant.trial_until)} (${trialDaysLeft} giorn${trialDaysLeft === 1 ? "o" : "i"})`;
            }
            return "Periodo di prova attivo";
        }
        return formatDate(selectedTenant.current_period_end ?? null);
    })();

    const handleCheckout = async () => {
        setCheckoutLoading(true);
        try {
            const url = await createCheckoutSession({
                tenantId: selectedTenant.id,
                planCode: selectedTenant.plan,
                quantity: paidSeats > 0 ? paidSeats : 1,
                successUrl: `${window.location.origin}/business/${selectedTenant.id}/subscription?session=success`,
                cancelUrl: `${window.location.origin}/business/${selectedTenant.id}/subscription?session=cancel`
            });
            window.location.href = url;
        } catch {
            showToast({ message: "Errore nell'avvio del checkout. Riprova.", type: "error" });
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

    // --- Flusso "Modifica piano" ---
    const openChange = () => {
        setDraftPlan(currentPlanBaseline);
        setDraftSeats(Math.max(1, currentSeatsBaseline, activityCount));
        setChangeStep("select");
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

    const handleContinue = async () => {
        setPreviewLoading(true);
        setChangeError(null);
        try {
            const result = await previewSubscriptionChange(selectedTenant.id, {
                plan: draftPlan,
                seats: draftSeats
            });
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
            await commitSubscriptionChange(selectedTenant.id, { plan: draftPlan, seats: draftSeats });
            if (preview && preview.effective === "now") {
                // Upgrade immediato: rifletti subito il nuovo stato. NIENTE refetch
                // di `tenants`: il webhook sincronizza in modo asincrono e una
                // rilettura ora leggerebbe ancora i valori vecchi, annullando
                // l'update ottimistico. Alla prossima navigazione la pagina
                // rileggerà la verità (ormai sincronizzata), che coincide.
                setOptimisticPlan(draftPlan);
                setOptimisticSeats(draftSeats);
                setOptimisticMonthlyCents(preview.nextAmount);
                setScheduledChange(null);
                showToast({ message: "Piano aggiornato.", type: "success" });
            } else {
                // Downgrade/programmato: piano e sedi correnti restano invariati
                // fino al rinnovo; mostra solo l'indicatore del cambio programmato.
                setScheduledChange({
                    planName: plans.find(p => p.code === draftPlan)?.name ?? draftPlan,
                    seats: draftSeats,
                    nextDate: preview?.nextDate ?? selectedTenant.current_period_end ?? null,
                    isDowngradeToBase
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
            } else if (name === "SEATS_ADDED_DOWNGRADE_NOT_SCHEDULED") {
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
            showToast({ message: "Abbonamento disdetto: resterà attivo fino a fine periodo.", type: "success" });
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

    // Banner "cambio programmato" persistente: priorità al vero stato Stripe
    // (subState), fallback all'ottimistico post-commit nella finestra transitoria.
    const pendingBanner = subState?.pendingChange
        ? {
            planName: plans.find(p => p.code === subState.pendingChange!.targetPlan)?.name
                ?? subState.pendingChange!.targetPlan
                ?? "—",
            seats: subState.pendingChange!.targetSeats ?? 0,
            date: subState.pendingChange!.effectiveDate,
            isBase: subState.pendingChange!.targetPlan === "base" && selectedTenant.plan === "pro"
        }
        : scheduledChange
        ? {
            planName: scheduledChange.planName,
            seats: scheduledChange.seats,
            date: scheduledChange.nextDate,
            isBase: scheduledChange.isDowngradeToBase
        }
        : null;
    const cancelAtPeriodEnd = subState?.cancelAtPeriodEnd ?? false;
    const periodEndDate = subState?.currentPeriodEnd ?? selectedTenant.current_period_end ?? null;

    const targetPlanName = plans.find(p => p.code === draftPlan)?.name ?? draftPlan;
    const previewIsDowngrade = preview ? preview.effective !== "now" : false;

    return (
        <div className={styles.page}>
            {canManageBilling && !canCancelBilling && (
                <div
                    style={{
                        display: "flex",
                        gap: "10px",
                        alignItems: "flex-start",
                        background: "var(--info-bg, #eff6ff)",
                        border: "1px solid var(--info-border, #bfdbfe)",
                        borderRadius: "8px",
                        padding: "10px 14px",
                        color: "var(--info-text, #1e40af)"
                    }}
                >
                    <Info size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
                    <Text variant="body-sm" weight={500}>
                        Solo il proprietario può cancellare l&apos;abbonamento. Hai accesso a gestione (metodo pagamento, posti) ma non a cancellazione.
                    </Text>
                </div>
            )}

            {/* --- Piano --- */}
            <div className={styles.section}>
                <div className={styles.sectionHeader}>
                    <CreditCard size={18} />
                    <Text variant="title-sm" weight={600}>
                        Il tuo piano
                    </Text>
                </div>

                <div className={styles.summaryGrid}>
                    <div className={styles.summaryItem}>
                        <Text variant="caption" colorVariant="muted">
                            Piano
                        </Text>
                        <span className={styles.planLabelRow}>
                            <Text variant="title-sm" weight={700}>
                                {displayPlanName}
                            </Text>
                            {isFounder && <Badge variant="primary">Founder</Badge>}
                        </span>
                    </div>

                    <div className={styles.summaryItem}>
                        <Text variant="caption" colorVariant="muted">
                            Stato
                        </Text>
                        <div className={styles.statusRow}>
                            <Badge variant={statusInfo.variant}>
                                {statusInfo.label}
                            </Badge>
                        </div>
                    </div>

                    <div className={styles.summaryItem}>
                        <Text variant="caption" colorVariant="muted">
                            {status === "trialing" ? "Fine prova" : "Prossimo rinnovo"}
                        </Text>
                        <Text variant="title-sm" weight={700}>
                            {renewalDateText}
                        </Text>
                    </div>

                    <div className={styles.summaryItem}>
                        <Text variant="caption" colorVariant="muted">
                            Prezzo attuale
                        </Text>
                        <Text variant="title-sm" weight={700}>
                            {formatEuro(displayMonthly)}/mese
                        </Text>
                    </div>
                </div>

                <Text variant="body-sm" colorVariant="muted">
                    {displaySeats} {displaySeats === 1 ? "sede attiva" : "sedi attive"} sul piano {displayPlanName}
                </Text>

                {cancelAtPeriodEnd ? (
                    <div className={styles.cancelNote}>
                        <AlertTriangle size={16} />
                        <Text variant="body-sm" weight={500}>
                            Abbonamento attivo fino al {formatDate(periodEndDate)}, poi disdetto.
                        </Text>
                        {canCancelBilling && (
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleReactivate}
                                loading={reactivateLoading}
                                leftIcon={<RotateCcw size={14} />}
                            >
                                Riattiva
                            </Button>
                        )}
                    </div>
                ) : pendingBanner && (
                    <div className={styles.scheduledNote}>
                        <Info size={16} />
                        <Text variant="body-sm" weight={500}>
                            Cambio programmato: passerai a {pendingBanner.planName} · {pendingBanner.seats}{" "}
                            {pendingBanner.seats === 1 ? "sede" : "sedi"} il {formatDate(pendingBanner.date)}.
                            {pendingBanner.isBase && " Ordini e prenotazioni da QR verranno disattivati."}
                        </Text>
                    </div>
                )}

                {canManageBilling && !isTerminal && (
                    <div className={styles.contactRow}>
                        {selfServiceEligible ? (
                            <>
                                <Text variant="body-sm" colorVariant="muted">
                                    Cambia piano o numero di sedi in autonomia.
                                </Text>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={openChange}
                                    disabled={plans.length === 0}
                                    leftIcon={<Pencil size={14} />}
                                >
                                    Modifica piano
                                </Button>
                            </>
                        ) : (
                            <>
                                <Text variant="body-sm" colorVariant="muted">
                                    Per la tua configurazione multi-sede, scrivici per modificare il piano.
                                </Text>
                                <Button
                                    as="a"
                                    href={CHANGE_PLAN_MAILTO}
                                    variant="primary"
                                    size="sm"
                                    leftIcon={<Mail size={14} />}
                                >
                                    Contatta assistenza
                                </Button>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* --- Actions (manage + cancel) --- */}
            {canManageBilling && (
            <div className={styles.section}>
                <div className={styles.sectionHeader}>
                    <Shield size={18} />
                    <Text variant="title-sm" weight={600}>
                        Gestione abbonamento
                    </Text>
                </div>

                {status === "trialing" && !hasPaymentMethod && (
                    <div className={styles.actionCard}>
                        <div>
                            <Text variant="body" weight={500}>
                                Attiva il tuo abbonamento
                            </Text>
                            <Text variant="body-sm" colorVariant="muted">
                                Inserisci un metodo di pagamento per continuare. Non verrai addebitato fino alla fine dell&apos;eventuale periodo di prova.
                            </Text>
                        </div>
                        <Button
                            variant="primary"
                            onClick={handleCheckout}
                            disabled={checkoutLoading}
                            leftIcon={<CreditCard size={16} />}
                        >
                            {checkoutLoading ? "Reindirizzamento..." : "Attiva abbonamento"}
                        </Button>
                    </div>
                )}

                {hasPaymentMethod && (
                    <div className={styles.actionCard}>
                        <div>
                            <Text variant="body" weight={500}>
                                Portale di fatturazione
                            </Text>
                            <Text variant="body-sm" colorVariant="muted">
                                Modifica il metodo di pagamento, visualizza le fatture o cancella l&apos;abbonamento.
                            </Text>
                        </div>
                        <Button
                            variant="secondary"
                            onClick={handlePortal}
                            disabled={portalLoading}
                            leftIcon={<ExternalLink size={16} />}
                        >
                            {portalLoading ? "Apertura..." : "Gestisci su Stripe"}
                        </Button>
                    </div>
                )}

                {canCancelBilling && hasPaymentMethod && !isTerminal && !cancelAtPeriodEnd && (
                    <div className={styles.actionCard}>
                        <div>
                            <Text variant="body" weight={500}>
                                Disdici abbonamento
                            </Text>
                            <Text variant="body-sm" colorVariant="muted">
                                La disdetta ha effetto a fine periodo. Nessun rimborso; tutto resta attivo fino ad allora.
                            </Text>
                        </div>
                        <Button
                            variant="secondary"
                            onClick={() => setIsCancelOpen(true)}
                            leftIcon={<XCircle size={16} />}
                        >
                            Disdici
                        </Button>
                    </div>
                )}

                {status === "canceled" && (
                    <>
                        <div className={styles.actionCard}>
                            <div>
                                <Text variant="body" weight={500}>
                                    Riattiva abbonamento
                                </Text>
                                <Text variant="body-sm" colorVariant="muted">
                                    Il tuo abbonamento è stato cancellato. Riattivalo per riprendere a modificare i contenuti.
                                </Text>
                            </div>
                            <Button
                                variant="primary"
                                onClick={hasPaymentMethod ? handlePortal : handleCheckout}
                                disabled={checkoutLoading || portalLoading}
                                leftIcon={<CreditCard size={16} />}
                            >
                                {(checkoutLoading || portalLoading) ? "Reindirizzamento..." : "Riattiva abbonamento"}
                            </Button>
                        </div>
                        {isTerminal && (
                            <button
                                type="button"
                                className={styles.workspaceExitLink}
                                onClick={() => navigate("/workspace")}
                            >
                                Non vuoi rinnovare? Gestisci o elimina l&apos;azienda dal Workspace.
                            </button>
                        )}
                    </>
                )}
            </div>
            )}

            {/* --- Drawer "Modifica piano" self-service --- */}
            <SystemDrawer open={isChangeOpen} onClose={closeChange} width={560}>
                <DrawerLayout
                    header={
                        <Text variant="title-sm" weight={600}>
                            {changeStep === "select" ? "Modifica piano e sedi" : "Conferma il cambio"}
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
                                    onClick={handleContinue}
                                    disabled={!hasChange}
                                    loading={previewLoading}
                                >
                                    Continua
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button
                                    variant="secondary"
                                    onClick={() => setChangeStep("select")}
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
                                        ? "Paga le sedi e programma il cambio"
                                        : previewIsDowngrade
                                        ? "Programma il cambio"
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
                    ) : (
                        <div className={styles.changeBody}>
                            {preview && (
                                <div className={styles.confirmBox}>
                                    {preview.classification === "combined" ? (
                                        <>
                                            <div className={styles.confirmRow}>
                                                <Text variant="body" weight={600}>Oggi paghi</Text>
                                                <Text variant="title-sm" weight={700}>
                                                    {formatCents(preview.chargeToday)}
                                                </Text>
                                            </div>
                                            <Text variant="body-sm" colorVariant="muted">
                                                Le {preview.seats} sedi aggiunte sono attive subito, riproporzionate
                                                a tariffa Pro fino al rinnovo.
                                            </Text>
                                            <div className={styles.confirmDivider} />
                                            <Text variant="body-sm" colorVariant="muted">
                                                Il piano passerà a {targetPlanName} il {formatDate(preview.nextDate)};
                                                da quella data pagherai {formatCents(preview.nextAmount)}/mese.
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
                                                    {formatCents(preview.chargeToday)}
                                                </Text>
                                            </div>
                                            <Text variant="body-sm" colorVariant="muted">
                                                Importo riproporzionato per i giorni rimanenti del periodo in corso.
                                            </Text>
                                            <div className={styles.confirmDivider} />
                                            <div className={styles.confirmRow}>
                                                <Text variant="body-sm" colorVariant="muted">
                                                    Dal {formatDate(preview.nextDate)}
                                                </Text>
                                                <Text variant="body" weight={600}>
                                                    {formatCents(preview.nextAmount)}/mese
                                                </Text>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className={styles.confirmRow}>
                                                <Text variant="body" weight={600}>Oggi paghi</Text>
                                                <Text variant="title-sm" weight={700}>€0,00</Text>
                                            </div>
                                            <Text variant="body-sm" colorVariant="muted">
                                                Il tuo piano passerà a {targetPlanName} il {formatDate(preview.nextDate)}.
                                                Da quella data pagherai {formatCents(preview.nextAmount)}/mese.
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
                            L&apos;abbonamento resterà attivo fino al <strong>{formatDate(periodEndDate)}</strong>,
                            poi verrà disdetto. <strong>Nessun rimborso</strong> per il periodo già pagato.
                        </Text>
                        <div className={styles.changeWarning}>
                            <AlertTriangle size={16} />
                            <Text variant="body-sm" weight={500}>
                                Fino a quella data ordini, prenotazioni e cataloghi restano pienamente attivi.
                                Potrai annullare la disdetta in qualsiasi momento prima del rinnovo.
                            </Text>
                        </div>
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
