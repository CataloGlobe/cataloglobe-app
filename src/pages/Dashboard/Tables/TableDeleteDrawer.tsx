import { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import type { V2Table } from "@/types/orders";
import styles from "./TableDeleteDrawer.module.scss";

interface Props {
    open: boolean;
    table: V2Table | null;
    onClose: () => void;
    onConfirm: () => Promise<void>;
}

export default function TableDeleteDrawer({ open, table, onClose, onConfirm }: Props) {
    const [isDeleting, setIsDeleting] = useState(false);

    async function handleConfirm() {
        setIsDeleting(true);
        try {
            await onConfirm();
        } finally {
            setIsDeleting(false);
        }
    }

    return (
        <SystemDrawer open={open} onClose={onClose} width={420}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Elimina tavolo
                    </Text>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isDeleting}>
                            Annulla
                        </Button>
                        <Button
                            variant="danger"
                            onClick={handleConfirm}
                            loading={isDeleting}
                        >
                            Elimina
                        </Button>
                    </>
                }
            >
                <div className={styles.content}>
                    <Text>
                        Stai per eliminare il tavolo{" "}
                        <strong>{table?.label ?? ""}</strong>.
                    </Text>
                    <InlineBanner variant="info">
                        Il tavolo verrà eliminato. La storia ordini e le sessioni associate
                        rimangono accessibili in lettura, ma il tavolo non sarà più
                        disponibile per nuove ordinazioni. Il QR code stampato smetterà di
                        funzionare.
                    </InlineBanner>
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
