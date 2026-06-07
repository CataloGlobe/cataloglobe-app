import { QRCodeSVG } from "qrcode.react";
import { Copy, Download, ExternalLink } from "lucide-react";

import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import Text from "@/components/ui/Text/Text";
import type { V2TableWithState } from "@/types/orders";

import { useToast } from "@/context/Toast/ToastContext";

import styles from "./TableQrPreviewDrawer.module.scss";

interface Props {
    open: boolean;
    table: V2TableWithState | null;
    qrUrl: string | null;
    onClose: () => void;
    onDownloadPdf: () => Promise<void>;
    isDownloadingPdf?: boolean;
}

export default function TableQrPreviewDrawer({
    open,
    table,
    qrUrl,
    onClose,
    onDownloadPdf,
    isDownloadingPdf
}: Props) {
    const { showToast } = useToast();

    async function handleCopyLink(): Promise<void> {
        if (!qrUrl) return;
        try {
            await navigator.clipboard.writeText(qrUrl);
            showToast({ message: "Link copiato", type: "success" });
        } catch {
            showToast({ message: "Impossibile copiare il link", type: "error" });
        }
    }

    return (
        <SystemDrawer open={open} onClose={onClose} width={520}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Anteprima QR{table ? ` — ${table.label}` : ""}
                    </Text>
                }
                footer={
                    <Button variant="secondary" onClick={onClose}>
                        Chiudi
                    </Button>
                }
            >
                <div className={styles.content}>
                    {qrUrl && table ? (
                        <>
                            <div className={styles.qrCard}>
                                <QRCodeSVG value={qrUrl} size={200} level="M" />
                            </div>

                            <div className={styles.urlSection}>
                                <Text variant="body-sm" colorVariant="muted">
                                    Link di ordinazione
                                </Text>
                                <div className={styles.urlBox}>
                                    <code className={styles.urlCode}>{qrUrl}</code>
                                    <IconButton
                                        icon={<Copy size={14} />}
                                        aria-label="Copia link"
                                        title="Copia link"
                                        variant="ghost"
                                        onClick={() => void handleCopyLink()}
                                    />
                                </div>
                            </div>

                            <div className={styles.actions}>
                                <Button
                                    as="a"
                                    href={qrUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    variant="outline"
                                    fullWidth
                                    leftIcon={<ExternalLink size={16} />}
                                >
                                    Apri pagina
                                </Button>
                                <Button
                                    variant="outline"
                                    fullWidth
                                    leftIcon={<Download size={16} />}
                                    onClick={() => void onDownloadPdf()}
                                    loading={!!isDownloadingPdf}
                                >
                                    Scarica QR (PDF)
                                </Button>
                            </div>

                            <Text variant="body-sm" colorVariant="muted">
                                Aprendo la pagina viene avviata una sessione reale sul
                                tavolo, come se fosse stato scansionato dal cliente.
                            </Text>
                        </>
                    ) : (
                        <Text colorVariant="muted">Nessun tavolo selezionato.</Text>
                    )}
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
