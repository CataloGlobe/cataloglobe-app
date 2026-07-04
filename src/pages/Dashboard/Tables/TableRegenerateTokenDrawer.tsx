import { useEffect, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { Switch } from "@/components/ui/Switch/Switch";
import type { V2Table } from "@/types/orders";
import styles from "./TableRegenerateTokenDrawer.module.scss";

interface Props {
    open: boolean;
    table: V2Table | null;
    onClose: () => void;
    onConfirm: (terminateSessions: boolean) => Promise<void>;
}

export default function TableRegenerateTokenDrawer({
    open,
    table,
    onClose,
    onConfirm
}: Props) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [terminateSessions, setTerminateSessions] = useState(true);

    useEffect(() => {
        if (open) {
            setTerminateSessions(true);
        }
    }, [open]);

    async function handleConfirm() {
        setIsProcessing(true);
        try {
            await onConfirm(terminateSessions);
        } finally {
            setIsProcessing(false);
        }
    }

    return (
        <SystemDrawer open={open} onClose={onClose} width={420}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Rigenera token QR
                    </Text>
                }
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={onClose}
                            disabled={isProcessing}
                        >
                            Annulla
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleConfirm}
                            loading={isProcessing}
                        >
                            Rigenera
                        </Button>
                    </>
                }
            >
                <div className={styles.content}>
                    <Text>
                        Stai per rigenerare il token QR del tavolo{" "}
                        <strong>{table?.label ?? ""}</strong>.
                    </Text>
                    <InlineBanner variant="warning">
                        Il QR code attualmente stampato non funzionerà più. Dovrai
                        stampare e affiggere il nuovo QR per permettere ai clienti di
                        ordinare da questo tavolo.
                    </InlineBanner>
                    <Switch
                        label="Termina anche le sessioni attive su questo tavolo"
                        description="I clienti attualmente connessi a questo tavolo dovranno riscansionare il QR."
                        checked={terminateSessions}
                        onChange={setTerminateSessions}
                        disabled={isProcessing}
                    />
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
