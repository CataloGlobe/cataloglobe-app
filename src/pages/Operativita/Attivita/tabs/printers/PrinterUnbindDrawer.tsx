import React, { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import Text from "@/components/ui/Text/Text";
import type { Printer } from "@/types/printers";
import styles from "./PrintersSection.module.scss";

interface PrinterUnbindDrawerProps {
    open: boolean;
    printer: Printer | null;
    onClose: () => void;
    onConfirm: () => Promise<void>;
}

/**
 * Conferma di scollegamento (pattern B informativo: nessun FK inbound da
 * proteggere, la riga viene eliminata dopo l'unbind lato Sunmi).
 */
export const PrinterUnbindDrawer: React.FC<PrinterUnbindDrawerProps> = ({
    open,
    printer,
    onClose,
    onConfirm
}) => {
    const [isDeleting, setIsDeleting] = useState(false);

    const handleConfirm = async () => {
        setIsDeleting(true);
        try {
            await onConfirm();
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <SystemDrawer open={open} onClose={onClose} width={420}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Scollega stampante
                    </Text>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isDeleting}>
                            Annulla
                        </Button>
                        <Button variant="danger" onClick={handleConfirm} loading={isDeleting}>
                            Scollega
                        </Button>
                    </>
                }
            >
                <div className={styles.drawerContent}>
                    <Text>
                        Stai per scollegare la stampante{" "}
                        <strong>{printer?.label ?? ""}</strong>
                        {printer ? ` (SN ${printer.sn})` : ""} da questa sede.
                    </Text>
                    <InlineBanner variant="info">
                        La stampante verrà rimossa dal negozio Sunmi della sede e non
                        riceverà più comande. Potrai ricollegarla in qualsiasi momento
                        inserendo di nuovo il numero di serie.
                    </InlineBanner>
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
};
