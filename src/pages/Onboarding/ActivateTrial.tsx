import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CreditCard, ShieldCheck } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { createCheckoutSession } from "@/services/supabase/billing";
import { useToast } from "@/context/Toast/ToastContext";
import styles from "./ActivateTrial.module.scss";

export default function ActivateTrial() {
    const [searchParams] = useSearchParams();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);

    const tenantId = searchParams.get("tenantId");

    const handleActivate = async () => {
        if (!tenantId) return;
        setLoading(true);
        try {
            const url = await createCheckoutSession(
                tenantId,
                `${window.location.origin}/business/${tenantId}/overview`,
                `${window.location.origin}/onboarding/activate-trial?tenantId=${tenantId}`
            );
            window.location.href = url;
        } catch {
            showToast({ message: "Errore nell'avvio del checkout. Riprova.", type: "error" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.card}>
                <div className={styles.iconCircle}>
                    <ShieldCheck size={32} />
                </div>

                <Text variant="title-lg" weight={700} className={styles.heading}>
                    Attiva il tuo abbonamento
                </Text>

                <Text variant="body" colorVariant="muted" className={styles.description}>
                    Per accedere alla tua attività, inserisci un metodo di pagamento.
                    Non verrai addebitato per i primi 30 giorni.
                    Poi &euro;29/mese. Puoi cancellare in qualsiasi momento.
                </Text>

                <ul className={styles.features}>
                    <li>
                        <Text variant="body-sm">Fino a 10 sedi</Text>
                    </li>
                    <li>
                        <Text variant="body-sm">Fino a 500 prodotti</Text>
                    </li>
                    <li>
                        <Text variant="body-sm">Cataloghi illimitati</Text>
                    </li>
                    <li>
                        <Text variant="body-sm">Nessun addebito per 30 giorni</Text>
                    </li>
                </ul>

                <div className={styles.actions}>
                    <Button
                        variant="primary"
                        fullWidth
                        onClick={handleActivate}
                        disabled={loading || !tenantId}
                    >
                        <CreditCard size={18} />
                        {loading ? "Reindirizzamento a Stripe..." : "Inizia la prova gratuita"}
                    </Button>

                    <Link to="/workspace" className={styles.backLink}>
                        <Text variant="body-sm" colorVariant="muted">
                            Torna alle attività
                        </Text>
                    </Link>
                </div>
            </div>
        </div>
    );
}
