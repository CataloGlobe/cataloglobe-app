import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import Text from "@/components/ui/Text/Text";
import { usePermissions } from "@/context/usePermissions";
import { isOwnerOrAdmin } from "@/lib/permissions";
import styles from "./ProLockedPanel.module.scss";

interface ProLockedPanelProps {
    tenantId: string;
    title: string;
    /** Cosa fa la funzione, in una o due righe. */
    description: string;
}

/**
 * Una tab della Scheda chiusa dal piano (correzioni UI O2): un solo pannello
 * al posto del modulo spento. «Passa a Pro» solo a chi gestisce
 * l'abbonamento (owner e admin, come `PageGate`); gli altri sanno a chi
 * chiederlo. «Confronta i piani» apre i prezzi della pagina pubblica.
 */
export function ProLockedPanel({ tenantId, title, description }: ProLockedPanelProps) {
    const navigate = useNavigate();
    const { permissions } = usePermissions();
    const billingCapable = permissions != null && isOwnerOrAdmin(permissions);

    return (
        <Card>
            <div className={styles.panel}>
                <span className={styles.icon} aria-hidden>
                    <Lock size={20} strokeWidth={1.75} />
                </span>
                <div className={styles.text}>
                    <Text as="h2" variant="title-sm" weight={600}>
                        {title}
                    </Text>
                    <Text variant="body-sm" colorVariant="muted">
                        {description}
                    </Text>
                </div>
                {billingCapable ? (
                    <div className={styles.actions}>
                        <Button variant="primary" onClick={() => navigate(`/business/${tenantId}/settings/abbonamento`)}>
                            Passa a Pro
                        </Button>
                        <Button as="a" variant="secondary" href="/#prezzi" target="_blank" rel="noopener noreferrer">
                            Confronta i piani
                        </Button>
                    </div>
                ) : (
                    <Text variant="body-sm" weight={600}>
                        Chiedi al proprietario di passare a Pro.
                    </Text>
                )}
            </div>
        </Card>
    );
}
