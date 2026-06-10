import { useEffect, useMemo, useState } from "react";
import { useTenant } from "@/context/useTenant";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { useToast } from "@/context/Toast/ToastContext";
import { createCheckoutSession, createPortalSession } from "@/services/supabase/billing";
import { getPlanByCode } from "@/services/supabase/plans";
import { calculateGraduatedFromPlan } from "@/utils/pricing";
import { canDoOnTenant } from "@/lib/permissions";
import { usePermissions } from "@/context/PermissionsContext";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { usePageHeader } from "@/context/usePageHeader";
import Text from "@/components/ui/Text/Text";
import { Badge } from "@/components/ui/Badge/Badge";
import { Button } from "@/components/ui/Button/Button";
import { ExternalLink, CreditCard, Shield, Lock, Info, Mail } from "lucide-react";
import type { Plan } from "@/types/plan";
import styles from "./SubscriptionPage.module.scss";

const STATUS_CONFIG: Record<string, { label: string; variant: "success" | "primary" | "warning" | "danger" }> = {
    active:    { label: "Attivo",    variant: "success" },
    trialing:  { label: "In prova",  variant: "primary" },
    past_due:  { label: "Scaduto",   variant: "warning" },
    canceled:  { label: "Cancellato", variant: "danger" },
    suspended: { label: "Sospeso",   variant: "danger" }
};

const CHANGE_PLAN_EMAIL = "support@cataloglobe.com";

function formatEuro(value: number): string {
    return `€${value.toFixed(2).replace(".", ",")}`;
}

export default function SubscriptionPage() {
    const { selectedTenant, loading } = useTenant();
    const { permissions, loading: permissionsLoading } = usePermissions();
    const canReadBilling = permissions ? canDoOnTenant(permissions, "billing.read") : false;
    const canManageBilling = permissions ? canDoOnTenant(permissions, "billing.manage") : false;
    const canCancelBilling = permissions ? canDoOnTenant(permissions, "billing.cancel") : false;
    const { status, trialDaysLeft, hasPaymentMethod } = useSubscriptionGuard();
    const { showToast } = useToast();

    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const [portalLoading, setPortalLoading] = useState(false);
    const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);

    useEffect(() => {
        if (!selectedTenant?.plan) return;
        getPlanByCode(selectedTenant.plan)
            .then(setCurrentPlan)
            .catch(err => {
                console.error("[SubscriptionPage] plan lookup failed:", err);
                setCurrentPlan(null);
            });
    }, [selectedTenant?.plan]);

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
                                {planName}
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
                            {formatEuro(currentPricing.subtotal)}/mese
                        </Text>
                    </div>
                </div>

                <Text variant="body-sm" colorVariant="muted">
                    {paidSeats} {paidSeats === 1 ? "sede attiva" : "sedi attive"} sul piano {planName}
                </Text>

                {canManageBilling && !isTerminal && (
                    <div className={styles.contactRow}>
                        <Text variant="body-sm" colorVariant="muted">
                            Per cambiare piano o numero di sedi, scrivici.
                        </Text>
                        <Button
                            as="a"
                            href={`mailto:${CHANGE_PLAN_EMAIL}?subject=${encodeURIComponent("Cambio piano CataloGlobe")}`}
                            variant="primary"
                            size="sm"
                            leftIcon={<Mail size={14} />}
                        >
                            Modifica piano
                        </Button>
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

                {status === "canceled" && (
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
                )}
            </div>
            )}

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
