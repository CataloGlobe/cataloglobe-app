import React from "react";
import {
    IconCopy,
    IconExternalLink,
    IconDownload,
    IconFileTypePdf,
    IconQrcode,
    IconAlertCircle
} from "@tabler/icons-react";
import { Button, Card } from "@/components/ui";
import { Badge } from "@/components/ui/Badge/Badge";
import UIText from "@/components/ui/Text/Text";
import { V2Activity } from "@/types/v2/activity";
import { QRCodeSVG } from "qrcode.react";
import { downloadMenuPdf } from "@/services/pdf/downloadMenuPdf";
import { useToast } from "@/context/Toast/ToastContext";
import styles from "../ActivityDetailPage.module.scss";

interface ActivityPublicAccessTabProps {
    activity: V2Activity;
    publicUrl: string;
}

export const ActivityPublicAccessTab: React.FC<ActivityPublicAccessTabProps> = ({
    activity,
    publicUrl
}) => {
    const { showToast } = useToast();
    const isInactive = activity.status !== "active";

    const handleCopyLink = () => {
        navigator.clipboard.writeText(publicUrl);
        showToast({
            message: "URL copiato negli appunti.",
            type: "success"
        });
    };

    const handleDownloadQR = () => {
        const svg = document.getElementById("public-qr-code");
        if (!svg) return;

        const svgData = new XMLSerializer().serializeToString(svg);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const img = new Image();

        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx?.drawImage(img, 0, 0);
            const pngFile = canvas.toDataURL("image/png");

            const downloadLink = document.createElement("a");
            downloadLink.download = `QR_${activity.slug}.png`;
            downloadLink.href = pngFile;
            downloadLink.click();
        };

        img.src = "data:image/svg+xml;base64," + btoa(svgData);
    };

    const handleDownloadPdf = async () => {
        try {
            await downloadMenuPdf(activity.id);
        } catch (error: any) {
            showToast({
                message: error.message || "Errore durante il download del PDF.",
                type: "error"
            });
        }
    };

    return (
        <div className={styles.grid12}>
            {isInactive && (
                <div
                    className={styles.colSpan12}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        padding: "1rem",
                        background: "#fff1f2",
                        border: "1px solid #fda4af",
                        borderRadius: "12px",
                        color: "#be123c"
                    }}
                >
                    <IconAlertCircle size={20} />
                    <UIText as="span" weight={600}>
                        Attività non pubblicata
                    </UIText>
                    <UIText as="span" variant="caption" style={{ color: "inherit" }}>
                        Il link pubblico e il QR code non saranno accessibili ai clienti finché
                        l'attività non viene attivata.
                    </UIText>
                </div>
            )}

            {/* Sezione 1: URL Pubblico */}
            <Card className={`${styles.card} ${styles.colSpan12}`}>
                <div className={styles.cardHeader}>
                    <h3>URL pubblico</h3>
                </div>
                <div className={styles.cardContent}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                        <div className={styles.urlContainer}>
                            <code>{publicUrl}</code>
                        </div>
                        <div style={{ display: "flex", gap: "0.75rem" }}>
                            <Button
                                variant="outline"
                                size="sm"
                                leftIcon={<IconCopy size={16} />}
                                onClick={handleCopyLink}
                            >
                                Copia link
                            </Button>
                            <Button
                                variant="primary"
                                size="sm"
                                leftIcon={<IconExternalLink size={16} />}
                                onClick={() => window.open(publicUrl, "_blank")}
                                disabled={isInactive}
                            >
                                Apri in nuova tab
                            </Button>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Sezione 2: QR Code */}
            <Card className={`${styles.card} ${styles.colSpan6}`}>
                <div className={styles.cardHeader}>
                    <h3>QR Code</h3>
                </div>
                <div
                    className={styles.cardContent}
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "1.5rem"
                    }}
                >
                    <div
                        style={{
                            padding: "1rem",
                            background: "#fff",
                            border: "1px solid #e5e7eb",
                            borderRadius: "12px"
                        }}
                    >
                        <QRCodeSVG
                            id="public-qr-code"
                            value={publicUrl}
                            size={200}
                            level="H"
                            includeMargin={false}
                        />
                    </div>
                    <Button
                        variant="secondary"
                        size="sm"
                        leftIcon={<IconDownload size={16} />}
                        onClick={handleDownloadQR}
                    >
                        Scarica QR Code
                    </Button>
                </div>
            </Card>

            {/* Sezione 3: PDF */}
            <Card className={`${styles.card} ${styles.colSpan6}`}>
                <div className={styles.cardHeader}>
                    <h3>Menu PDF</h3>
                </div>
                <div
                    className={styles.cardContent}
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "1rem",
                        height: "100%"
                    }}
                >
                    <UIText variant="body-sm" colorVariant="muted">
                        Scarica la versione stampabile del menu in formato PDF sincronizzata con il
                        catalogo attivo.
                    </UIText>
                    <div style={{ marginTop: "auto" }}>
                        <Button
                            variant="secondary"
                            size="sm"
                            leftIcon={<IconFileTypePdf size={16} />}
                            onClick={handleDownloadPdf}
                        >
                            Scarica PDF
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
};
