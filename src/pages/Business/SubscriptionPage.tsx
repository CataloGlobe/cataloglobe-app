import { useCallback, useEffect, useState } from "react";
import { useTenant } from "@/context/useTenant";
import { useTenantId } from "@/context/useTenantId";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { useToast } from "@/context/Toast/ToastContext";
import { createCheckoutSession, createPortalSession, updateSeats } from "@/services/supabase/billing";
import { getActivityCount } from "@/services/supabase/activities";
import { calculatePrice, formatPrice, MAX_SEATS } from "@/utils/pricing";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Text from "@/components/ui/Text/Text";
import { Badge } from "@/components/ui/Badge/Badge";
import { Button } from "@/components/ui/Button/Button";
import { NumberInput } from "@/components/ui/Input/NumberInput";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { ExternalLink, CreditCard, Shield, MapPin, Settings2 } from "lucide-react";
import styles from "./SubscriptionPage.module.scss";

const STATUS_CONFIG: Record<string, { label: string; variant: "success" | "primary" | "warning" | "danger" }> = {
    active:    { label: "Attivo",    variant: "success" },
    trialing:  { label: "In prova",  variant: "primary" },
    past_due:  { label: "Scaduto",   variant: "warning" },
    canceled:  { label: "Cancellato", variant: "danger" },
    suspended: { label: "Sospeso",   variant: "danger" }
};

export default function SubscriptionPage() {
    const tenantId = useTenantId();
    const { selectedTenant, loading, userRole, refreshTenants } = useTenant();
    const { status, trialDaysLeft, hasPaymentMethod } = useSubscriptionGuard();
    const { showToast } = useToast();

    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const [portalLoading, setPortalLoading] = useState(false);
    const [activityCount, setActivityCount] = useState(0);
    const [seatsDrawerOpen, setSeatsDrawerOpen] = useState(false);
    const [newSeats, setNewSeats] = useState(1);
    const [updatingSeats, setUpdatingSeats] = useState(false);

    const loadActivityCount = useCallback(async () => {
        if (!tenantId) return;
        try {
            setActivityCount(await getActivityCount(tenantId));
        } catch { /* non-blocking */ }
    }, [tenantId]);

    useEffect(() => { loadActivityCount(); }, [loadActivityCount]);

    if (loading || !selectedTenant) return null;

    if (userRole !== "owner") {
        return (
            <div className={styles.page}>
                <PageHeader
                    title="Abbonamento"
                    subtitle="Solo il proprietario può gestire l'abbonamento."
                />
            </div>
        );
    }

    const statusInfo = STATUS_CONFIG[status ?? ""] ?? { label: status, variant: "secondary" as const };
    const paidSeats = selectedTenant.paid_seats;
    const usagePercent = paidSeats > 0 ? Math.min(100, Math.round((activityCount / paidSeats) * 100)) : 0;
    const currentPricing = calculatePrice(paidSeats);
    const overLimit = newSeats > MAX_SEATS;

    const handleCheckout = async () => {
        setCheckoutLoading(true);
        try {
            const url = await createCheckoutSession(
                selectedTenant.id,
                `${window.location.origin}/business/${selectedTenant.id}/subscription?session=success`,
                `${window.location.origin}/business/${selectedTenant.id}/subscription?session=cancel`
            );
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
        setSeatsDrawerOpen(true);
    };

    const handleUpdateSeats = async (e: React.FormEvent) => {
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
        setUpdatingSeats(true);
        try {
            await updateSeats(selectedTenant.id, newSeats);
            showToast({ message: "Numero sedi aggiornato. La modifica sarà visibile a breve.", type: "success" });
            setSeatsDrawerOpen(false);
            // Refresh tenant data after a short delay to let webhook propagate
            setTimeout(() => refreshTenants(), 2000);
        } catch {
            showToast({ message: "Errore nell'aggiornamento. Riprova.", type: "error" });
        } finally {
            setUpdatingSeats(false);
        }
    };

    const formatDate = (iso: string | null) => {
        if (!iso) return "—";
        return new Date(iso).toLocaleDateString("it-IT", {
            day: "numeric",
            month: "long",
            year: "numeric"
        });
    };

    const newPricing = calculatePrice(newSeats);

    return (
        <div className={styles.page}>
            <PageHeader
                title="Abbonamento"
                subtitle="Gestisci il piano e il metodo di pagamento della tua attività."
            />

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
                        <Text variant="title-sm" weight={700}>
                            Pro
                        </Text>
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
                            {status === "trialing"
                                ? (trialDaysLeft !== null
                                    ? `${formatDate(selectedTenant.trial_until)} (${trialDaysLeft} giorn${trialDaysLeft === 1 ? "o" : "i"})`
                                    : "Periodo di prova attivo")
                                : "—"
                            }
                        </Text>
                    </div>

                    <div className={styles.summaryItem}>
                        <Text variant="caption" colorVariant="muted">
                            Prezzo attuale
                        </Text>
                        <Text variant="title-sm" weight={700}>
                            &euro;{currentPricing.total}/mese
                        </Text>
                    </div>
                </div>
            </div>

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
                            Sedi incluse nel piano: {paidSeats}
                        </Text>
                    </div>

                    <div className={styles.usageBarTrack}>
                        <div
                            className={`${styles.usageBarFill}${usagePercent >= 100 ? ` ${styles.usageBarFull}` : ""}`}
                            style={{ width: `${usagePercent}%` }}
                        />
                    </div>

                    <Button
                        variant="secondary"
                        onClick={handleOpenSeatsDrawer}
                        leftIcon={<Settings2 size={16} />}
                    >
                        Modifica numero sedi
                    </Button>
                </div>
            </div>

            {/* --- Actions --- */}
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
                                Inserisci un metodo di pagamento per continuare dopo il periodo di prova.
                                Non verrai addebitato fino alla fine del trial.
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

            {/* --- Modify seats drawer --- */}
            <SystemDrawer open={seatsDrawerOpen} onClose={() => setSeatsDrawerOpen(false)} width={420}>
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
                                loading={updatingSeats}
                                disabled={newSeats === paidSeats || overLimit || newSeats < 1}
                            >
                                Aggiorna sedi
                            </Button>
                        </>
                    }
                >
                    <form
                        id="update-seats-form"
                        onSubmit={handleUpdateSeats}
                        style={{ display: "flex", flexDirection: "column", gap: "20px" }}
                    >
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <Text variant="body-sm" colorVariant="muted">
                                Attualmente hai <strong>{activityCount}</strong> sed{activityCount === 1 ? "e" : "i"} attiv{activityCount === 1 ? "a" : "e"} e <strong>{paidSeats}</strong> inclus{paidSeats === 1 ? "a" : "e"} nel piano.
                            </Text>
                        </div>

                        <NumberInput
                            label="Nuovo numero di sedi"
                            value={newSeats}
                            onChange={e => {
                                const val = parseInt(e.target.value, 10);
                                if (isNaN(val) || val < 1) { setNewSeats(1); return; }
                                setNewSeats(val);
                            }}
                            min={1}
                            step={1}
                            disabled={updatingSeats}
                        />

                        {overLimit ? (
                            <div style={{ background: "var(--hover-bg, #f1f5f9)", borderRadius: "8px", padding: "10px 12px" }}>
                                <Text variant="body-sm" colorVariant="muted">
                                    Per più di 25 sedi, contattaci:{" "}
                                    <a href="mailto:admin@cataloglobe.com" style={{ color: "var(--brand-primary)" }}>
                                        admin@cataloglobe.com
                                    </a>
                                </Text>
                            </div>
                        ) : newSeats < activityCount ? (
                            <div style={{ background: "#fef2f2", borderRadius: "8px", padding: "10px 12px" }}>
                                <Text variant="body-sm" style={{ color: "#dc2626" }}>
                                    Non puoi ridurre a {newSeats} — hai {activityCount} sedi attive.
                                </Text>
                            </div>
                        ) : (
                            <div style={{ background: "var(--hover-bg, #f1f5f9)", borderRadius: "8px", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "4px" }}>
                                <Text variant="body-sm" weight={600}>
                                    {formatPrice(newSeats)}
                                </Text>
                                {newSeats !== paidSeats && (
                                    <Text variant="caption" colorVariant="muted">
                                        {newPricing.total > currentPricing.total
                                            ? `+€${newPricing.total - currentPricing.total}/mese`
                                            : newPricing.total < currentPricing.total
                                                ? `−€${currentPricing.total - newPricing.total}/mese`
                                                : "Nessuna variazione di prezzo"
                                        }
                                    </Text>
                                )}
                            </div>
                        )}
                    </form>
                </DrawerLayout>
            </SystemDrawer>
        </div>
    );
}
