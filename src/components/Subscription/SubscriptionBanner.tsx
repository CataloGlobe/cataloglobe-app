import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, XCircle, Clock, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { useTenant } from "@/context/useTenant";
import { createPortalSession } from "@/services/supabase/billing";
import { useToast } from "@/context/Toast/ToastContext";
import styles from "./SubscriptionBanner.module.scss";

export function SubscriptionBanner() {
    const { businessId } = useParams<{ businessId: string }>();
    const { selectedTenant, userRole } = useTenant();
    const { status, trialDaysLeft } = useSubscriptionGuard();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);

    // Don't show if: no tenant, no subscription yet, or subscription is active
    if (!selectedTenant || !status || status === "active") return null;
    if (!selectedTenant.stripe_subscription_id) return null;

    const handlePortal = async () => {
        if (!selectedTenant) return;
        setLoading(true);
        try {
            const url = await createPortalSession(
                selectedTenant.id,
                window.location.href
            );
            window.location.href = url;
        } catch {
            showToast({ message: "Errore nell'apertura del portale. Riprova.", type: "error" });
        } finally {
            setLoading(false);
        }
    };

    const goToSubscription = () => {
        navigate(`/business/${businessId}/subscription`);
    };

    if (status === "trialing") {
        return (
            <div className={`${styles.banner} ${styles.info}`}>
                <div className={styles.content}>
                    <Clock size={16} className={styles.icon} />
                    <Text variant="body-sm" weight={500}>
                        {trialDaysLeft !== null
                            ? <>Hai <strong>{trialDaysLeft} giorn{trialDaysLeft === 1 ? "o rimasto" : "i rimasti"}</strong> di prova gratuita.</>
                            : <>Periodo di prova attivo.</>
                        }
                    </Text>
                </div>
                {userRole === "owner" && (
                    <button className={styles.link} onClick={goToSubscription}>
                        Gestisci abbonamento
                    </button>
                )}
            </div>
        );
    }

    if (status === "past_due") {
        return (
            <div className={`${styles.banner} ${styles.warning}`}>
                <div className={styles.content}>
                    <AlertTriangle size={16} className={styles.icon} />
                    <Text variant="body-sm" weight={500}>
                        Problema con il pagamento. Aggiorna il metodo di pagamento per evitare interruzioni.
                    </Text>
                </div>
                {userRole === "owner" && (
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handlePortal}
                        disabled={loading || !selectedTenant.stripe_customer_id}
                        leftIcon={<ExternalLink size={14} />}
                    >
                        {loading ? "Apertura..." : "Aggiorna pagamento"}
                    </Button>
                )}
            </div>
        );
    }

    if (status === "canceled" || status === "suspended") {
        return (
            <div className={`${styles.banner} ${styles.error}`}>
                <div className={styles.content}>
                    <XCircle size={16} className={styles.icon} />
                    <Text variant="body-sm" weight={500}>
                        {status === "canceled"
                            ? "Il tuo abbonamento è stato cancellato. Riattiva per continuare a modificare i contenuti."
                            : "Il tuo abbonamento è sospeso. Contatta l'assistenza per ripristinare l'accesso."}
                    </Text>
                </div>
                {userRole === "owner" && status === "canceled" && (
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={goToSubscription}
                    >
                        Riattiva abbonamento
                    </Button>
                )}
            </div>
        );
    }

    return null;
}
