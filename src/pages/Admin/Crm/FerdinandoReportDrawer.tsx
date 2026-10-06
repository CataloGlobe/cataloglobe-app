import { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import Text from "@/components/ui/Text/Text";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { useToast } from "@/context/Toast/ToastContext";
import styles from "./Crm.module.scss";

/**
 * Report per Ferdinando (versione ridotta del riepilogo): lead, telefonate,
 * prove e clienti per annuncio, più le obiezioni più sentite. Solo numeri,
 * nessun nome di locale o di persona. Si copia e si manda a mano: nessun
 * invio automatico finché non si decide come e a che indirizzo.
 */
export function FerdinandoReportDrawer({ open, onClose, text }: { open: boolean; onClose: () => void; text: string }) {
    const { showToast } = useToast();
    const [error, setError] = useState<string | null>(null);

    function copy() {
        setError(null);
        navigator.clipboard.writeText(text).then(
            () => showToast({ message: "Report copiato.", type: "success" }),
            () => setError("Non sono riuscito a copiarlo: selezionalo e copialo a mano.")
        );
    }

    return (
        <SystemDrawer open={open} onClose={onClose} size="md">
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Report per Ferdinando
                    </Text>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose}>
                            Chiudi
                        </Button>
                        <Button variant="primary" onClick={copy}>
                            Copia
                        </Button>
                    </>
                }
            >
                <div className={styles.drawerForm}>
                    {error && <InlineBanner variant="error">{error}</InlineBanner>}
                    <Text variant="body-sm" colorVariant="muted">
                        Solo numeri, per annuncio, nel periodo scelto nel Riepilogo. L'annuncio è quello da cui il locale è
                        arrivato la prima volta.
                    </Text>
                    <Textarea label="Testo" rows={16} value={text} readOnly />
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
