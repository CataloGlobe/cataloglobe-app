import { useCallback, useEffect, useMemo, useState } from "react";
import { useTenant } from "@/context/useTenant";
import { useTenantId } from "@/context/useTenantId";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { useToast } from "@/context/Toast/ToastContext";
import { createCheckoutSession, createPortalSession, updateSeats } from "@/services/supabase/billing";
import { getActivityCount } from "@/services/supabase/activities";
import { getPlanByCode } from "@/services/supabase/plans";
import { calculateGraduatedFromPlan } from "@/utils/pricing";
import { canDoOnTenant } from "@/lib/permissions";
import { usePermissions } from "@/context/PermissionsContext";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { usePageHeader } from "@/context/usePageHeader";
import Text from "@/components/ui/Text/Text";
import { Badge } from "@/components/ui/Badge/Badge";
import { Button } from "@/components/ui/Button/Button";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { SeatsInput } from "@/components/ui/SeatsInput/SeatsInput";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";

import { ExternalLink, CreditCard, Shield, MapPin, Settings2, Lock, Info, Sparkles, Mail } from "lucide-react";
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
const FALLBACK_MAX_SEATS = 5;

function formatEuro(value: number): string {
    return `€${value.toFixed(2).replace(".", ",")}`;
}

export default function SubscriptionPage() {
    const tenantId = useTenantId();
    const { selectedTenant, loading, refreshTenants } = useTenant();
    const { permissions, loading: permissionsLoading } = usePermissions();
    const canReadBilling = permissions ? canDoOnTenant(permissions, "billing.read") : false;
    const canManageBilling = permissions ? canDoOnTenant(permissions, "billing.manage") : false;
    const canCancelBilling = permissions ? canDoOnTenant(permissions, "billing.cancel") : false;
    const { status, trialDaysLeft, hasPaymentMethod } = useSubscriptionGuard();
    const { showToast } = useToast();

    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const [portalLoading, setPortalLoading] = useState(false);
    const [activityCount, setActivityCount] = useState(0);
    const [seatsDrawerOpen, setSeatsDrawerOpen] = useState(false);
    const [seatsDrawerStep, setSeatsDrawerStep] = useState<"edit" | "confirm">("edit");
    const [newSeats, setNewSeats] = useState(1);
    const [updatingSeats, setUpdatingSeats] = useState(false);
    const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);

    const loadActivityCount = useCallback(async () => {
        if (!tenantId) return;
        try {
            setActivityCount(await getActivityCount(tenantId));
        } catch { /* non-blocking */ }
    }, [tenantId]);

    useEffect(() => { loadActivityCount(); }, [loadActivityCount]);

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
    const maxSeats = currentPlan?.max_self_service_seats ?? FALLBACK_MAX_SEATS;

    const currentPricing = useMemo(() => {
        if (!currentPlan) return { lines: [], subtotal: 0, fullPrice: 0, discountedPrice: 0 };
        return calculateGraduatedFromPlan(currentPlan, paidSeats);
    }, [currentPlan, paidSeats]);

    const newPricing = useMemo(() => {
        if (!currentPlan) return { lines: [], subtotal: 0, fullPrice: 0, discountedPrice: 0 };
        return calculateGraduatedFromPlan(currentPlan, newSeats);
    }, [currentPlan, newSeats]);

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
    const usagePercent = paidSeats > 0 ? Math.min(100, Math.round((activityCount / paidSeats) * 100)) : 0;
    const overLimit = newSeats > maxSeats;
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

    const handleOpenSeatsDrawer = () => {
        setNewSeats(paidSeats);
        setSeatsDrawerStep("edit");
        setSeatsDrawerOpen(true);
    };

    const handleRequestUpdateSeats = (e: React.FormEvent) => {
        e.preventDefault();
        if (newSeats === paidSeats || newSeats < 1 || overLimit) return;
        if (newSeats < activityCount) {
            showToast({
                message: `Non puoi ridurre a ${newSeats} sed${newSeats === 1 ? "e" : "i"}: ne hai ${activityCount} attive. Elimina prima alcune sedi.`,
                type: "error",
                duration: 4000
            });
            return;
        }
        setSeatsDrawerStep("confirm");
    };

    const handleConfirmUpdateSeats = async () => {
        setUpdatingSeats(true);
        try {
            await updateSeats(selectedTenant.id, newSeats);
            showToast({ message: "Numero sedi aggiornato. La modifica sarà visibile a breve.", type: "success" });
            setSeatsDrawerOpen(false);
            setSeatsDrawerStep("edit");
            setTimeout(() => refreshTenants(), 2000);
        } catch {
            showToast({ message: "Errore nell'aggiornamento. Riprova.", type: "error" });
        } finally {
            setUpdatingSeats(false);
        }
    };

    const seatsDiff = newPricing.subtotal - currentPricing.subtotal;
    const diffLabel = seatsDiff > 0
        ? `+${formatEuro(seatsDiff)}/mese`
        : seatsDiff < 0
            ? `−${formatEuro(Math.abs(seatsDiff))}/mese`
            : "Nessuna variazione di prezzo";

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

            {/* --- Plan summary --- */}
            <div className={styles.section}>
                <div className={styles.sectionHeader}>
                    <CreditCard size={18} />
                    <Text variant="title-sm" weight={600}>
                        Riepilogo piano
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
            </div>

            {/* --- Change plan contact (no self-service) --- */}
            {canManageBilling && !isTerminal && (
                <div className={styles.contactRow}>
                    <Text variant="body-sm" colorVariant="muted">
                        Vuoi cambiare piano? Contattaci e troveremo la soluzione migliore.
                    </Text>
                    <Button
                        as="a"
                        href={`mailto:${CHANGE_PLAN_EMAIL}?subject=${encodeURIComponent("Cambio piano CataloGlobe")}`}
                        variant="secondary"
                        size="sm"
                        leftIcon={<Mail size={14} />}
                    >
                        Scrivici
                    </Button>
                </div>
            )}

            {/* --- Founder banner (only when not founder) --- */}
            {!isFounder && !isTerminal && (
                <div className={styles.founderBanner}>
                    <span className={styles.founderIcon} aria-hidden>
                        <Sparkles size={18} />
                    </span>
                    <div className={styles.founderContent}>
                        <span className={styles.founderTitle}>Sei tra i primi 20 clienti?</span>
                        <span className={styles.founderBody}>
                            Abbiamo condizioni speciali per chi sceglie CataloGlobe in fase early. Contattaci per scoprirle.
                        </span>
                    </div>
                </div>
            )}

            {/* --- Seat usage --- */}
            <div className={styles.section}>
                <div className={styles.sectionHeader}>
                    <MapPin size={18} />
                    <Text variant="title-sm" weight={600}>
                        Utilizzo sedi
                    </Text>
                </div>

                <div className={styles.seatsInfo}>
                    <div className={styles.seatsNumbers}>
                        <Text variant="body" weight={500}>
                            {activityCount} / {paidSeats} sed{paidSeats === 1 ? "e" : "i"} utilizzat{activityCount === 1 ? "a" : "e"}
                        </Text>
                        <Text variant="caption" colorVariant="muted">
                            Sedi pagate sul piano {planName}: {paidSeats}
                        </Text>
                    </div>

                    <div className={styles.usageBarTrack}>
                        <div
                            className={`${styles.usageBarFill}${usagePercent >= 100 ? ` ${styles.usageBarFull}` : ""}`}
                            style={{ width: `${usagePercent}%` }}
                        />
                    </div>

                    {activityCount >= paidSeats && paidSeats > 0 && (
                        <InlineBanner variant="warning">
                            {canManageBilling && !isTerminal
                                ? "Hai raggiunto il limite. Modifica il numero di sedi per espandere il piano."
                                : "Hai raggiunto il limite. Solo il proprietario può modificare il numero di sedi."}
                        </InlineBanner>
                    )}

                    {canManageBilling && !isTerminal && (
                        <Button
                            variant="secondary"
                            onClick={handleOpenSeatsDrawer}
                            leftIcon={<Settings2 size={16} />}
                        >
                            Modifica numero sedi
                        </Button>
                    )}
                </div>
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

            {/* --- Modify seats drawer (2-step, manage billing, only when not terminal) --- */}
            {canManageBilling && !isTerminal && (
            <SystemDrawer
                open={seatsDrawerOpen}
                onClose={() => { setSeatsDrawerOpen(false); setSeatsDrawerStep("edit"); }}
                width={420}
            >
                {seatsDrawerStep === "edit" ? (
                    <DrawerLayout
                        header={
                            <Text variant="title-sm" weight={700}>
                                Modifica numero sedi
                            </Text>
                        }
                        footer={
                            <>
                                <Button variant="secondary" onClick={() => setSeatsDrawerOpen(false)} disabled={updatingSeats}>
                                    Annulla
                                </Button>
                                <Button
                                    variant="primary"
                                    type="submit"
                                    form="update-seats-form"
                                    disabled={newSeats === paidSeats || newSeats < 1 || newSeats < activityCount || overLimit}
                                >
                                    Aggiorna sedi
                                </Button>
                            </>
                        }
                    >
                        <form
                            id="update-seats-form"
                            onSubmit={handleRequestUpdateSeats}
                            style={{ display: "flex", flexDirection: "column", gap: "20px" }}
                        >
                            <Text variant="body-sm" colorVariant="muted">
                                Attualmente hai <strong>{activityCount}</strong> sed{activityCount === 1 ? "e" : "i"} attiv{activityCount === 1 ? "a" : "e"} e <strong>{paidSeats}</strong> pagat{paidSeats === 1 ? "a" : "e"} sul piano {planName}.
                            </Text>

                            <SeatsInput
                                label="Nuovo numero di sedi"
                                value={newSeats}
                                onChange={setNewSeats}
                                min={Math.max(1, activityCount)}
                                max={maxSeats}
                            />

                            {newSeats < activityCount ? (
                                <div className={styles.drawerError}>
                                    Non puoi ridurre a {newSeats} — hai {activityCount} sedi attive.
                                </div>
                            ) : (
                                <div className={styles.drawerBreakdown}>
                                    {newPricing.lines.map(line => (
                                        <div key={line.seat} className={styles.drawerBreakdownRow}>
                                            <span>
                                                {line.seat === 1 ? "1ª sede" : `${line.seat}ª sede`}
                                                {line.discounted && currentPlan && (
                                                    <span style={{ marginLeft: 6, color: "#047857", fontSize: 11, fontWeight: 600 }}>
                                                        −{currentPlan.volume_discount_percent}%
                                                    </span>
                                                )}
                                            </span>
                                            <span>{formatEuro(line.unitPrice)}</span>
                                        </div>
                                    ))}
                                    <div className={styles.drawerBreakdownRow} style={{ borderTop: "1px solid var(--border, #e5e7eb)", paddingTop: 6, marginTop: 4, fontWeight: 700, color: "var(--text, #0f172a)" }}>
                                        <span>Totale mensile</span>
                                        <span>{formatEuro(newPricing.subtotal)}</span>
                                    </div>
                                    {newSeats !== paidSeats && (
                                        <span className={`${styles.drawerBreakdownDiff} ${seatsDiff > 0 ? styles.drawerBreakdownDiffPositive : styles.drawerBreakdownDiffNegative}`}>
                                            {diffLabel}
                                        </span>
                                    )}
                                </div>
                            )}
                        </form>
                    </DrawerLayout>
                ) : (
                    <DrawerLayout
                        header={
                            <Text variant="title-sm" weight={700}>
                                Conferma modifica piano
                            </Text>
                        }
                        footer={
                            <>
                                <Button variant="secondary" onClick={() => setSeatsDrawerStep("edit")} disabled={updatingSeats}>
                                    Annulla
                                </Button>
                                <Button variant="primary" onClick={handleConfirmUpdateSeats} loading={updatingSeats}>
                                    Conferma modifica
                                </Button>
                            </>
                        }
                    >
                        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                            <Text variant="body">
                                Stai aggiornando il tuo piano da <strong>{paidSeats}</strong> a <strong>{newSeats}</strong> sed{newSeats === 1 ? "e" : "i"}.
                                Il nuovo costo sarà <strong>{formatEuro(newPricing.subtotal)}/mese</strong>.
                            </Text>
                            <Text variant="body-sm" colorVariant="muted">
                                {newSeats > paidSeats
                                    ? "La differenza verrà addebitata proporzionalmente al periodo rimanente."
                                    : "Il credito verrà applicato al prossimo ciclo di fatturazione."
                                }
                            </Text>
                        </div>
                    </DrawerLayout>
                )}
            </SystemDrawer>
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
