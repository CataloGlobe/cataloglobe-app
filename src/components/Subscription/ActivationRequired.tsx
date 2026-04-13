import { useState } from "react";
import { Link } from "react-router-dom";
import { CreditCard, ShieldCheck } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { NumberInput } from "@/components/ui/Input/NumberInput";
import { useTenant } from "@/context/useTenant";
import { createCheckoutSession } from "@/services/supabase/billing";
import { useToast } from "@/context/Toast/ToastContext";
import { formatPrice, MAX_SEATS } from "@/utils/pricing";
import logoPng from "@/assets/logo-V2.png";
import styles from "./ActivationRequired.module.scss";

/**
 * Standalone fullscreen activation page — shown instead of MainLayout
 * when the tenant has never completed Stripe checkout.
 * No sidebar, no banner, no header.
 */
export function ActivationRequired() {
    const { selectedTenant } = useTenant();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [seats, setSeats] = useState(1);

    if (!selectedTenant) return null;

    const overLimit = seats > MAX_SEATS;

    const handleSeatsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value, 10);
        if (isNaN(val) || val < 1) { setSeats(1); return; }
        setSeats(val);
    };

    const handleCheckout = async () => {
        setLoading(true);
        try {
            const url = await createCheckoutSession(
                selectedTenant.id,
                `${window.location.origin}/business/${selectedTenant.id}/overview`,
                `${window.location.origin}/business/${selectedTenant.id}/subscription`,
                seats
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
            <div className={styles.logo}>
                <img src={logoPng} alt="CataloGlobe" className={styles.logoImg} />
                <Text variant="title-md" weight={700} colorVariant="primary">
                    CataloGlobe
                </Text>
            </div>

            <div className={styles.card}>
                <div className={styles.iconCircle}>
                    <ShieldCheck size={32} />
                </div>

                <Text variant="title-lg" weight={700}>
                    Attiva il tuo abbonamento
                </Text>

                <Text variant="body" colorVariant="muted" className={styles.description}>
                    Per accedere a <strong>{selectedTenant.name}</strong>, inserisci un metodo di pagamento.
                    I primi 30 giorni sono gratuiti.
                </Text>

                <div className={styles.planBox}>
                    <NumberInput
                        label="Quante sedi ha la tua attività?"
                        value={seats}
                        onChange={handleSeatsChange}
                        min={1}
                        step={1}
                        disabled={loading}
                    />
                    {overLimit ? (
                        <Text variant="body-sm" colorVariant="muted">
                            Per più di 25 sedi, contattaci:{" "}
                            <a href="mailto:admin@cataloglobe.com" style={{ color: "var(--brand-primary)" }}>
                                admin@cataloglobe.com
                            </a>
                        </Text>
                    ) : (
                        <Text variant="body-sm" weight={600}>
                            {formatPrice(seats)} · Primi 30 giorni gratuiti
                        </Text>
                    )}
                </div>

                <Button
                    variant="primary"
                    fullWidth
                    onClick={handleCheckout}
                    disabled={loading || overLimit}
                    leftIcon={<CreditCard size={18} />}
                >
                    {loading ? "Reindirizzamento a Stripe..." : "Inizia la prova gratuita"}
                </Button>

                <Link to="/workspace" className={styles.backLink}>
                    <Text variant="body-sm" colorVariant="muted">
                        Torna alle attività
                    </Text>
                </Link>
            </div>
        </div>
    );
}
