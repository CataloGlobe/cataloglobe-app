import { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import type { V2Table } from "@/types/orders";
import styles from "./TableRegenerateTokenDrawer.module.scss";

interface Props {
    open: boolean;
    table: V2Table | null;
    onClose: () => void;
    onConfirm: () => Promise<void>;
}

export default function TableRegenerateTokenDrawer({
    open,
    table,
    onClose,
    onConfirm
}: Props) {
    const [isProcessing, setIsProcessing] = useState(false);

    async function handleConfirm() {
        setIsProcessing(true);
        try {
            await onConfirm();
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
                        ordinare da questo tavolo. Le sessioni clienti attualmente
                        attive non vengono interrotte.
                    </InlineBanner>
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
