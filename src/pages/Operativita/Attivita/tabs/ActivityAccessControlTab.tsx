import React, { useRef, useCallback, useState, useEffect, useMemo } from "react";
import {
    IconCopy,
    IconExternalLink,
    IconDownload,
    IconFileTypePdf,
    IconAlertCircle,
    IconAlertTriangle,
    IconArrowsMaximize,
    IconPhoto,
    IconLink
} from "@tabler/icons-react";
import { Button, Card } from "@/components/ui";
import { Switch } from "@/components/ui/Switch/Switch";
import UIText from "@/components/ui/Text/Text";
import { Divider } from "@/components/ui/Divider/Divider";
import { DropdownMenu } from "@/components/ui/DropdownMenu/DropdownMenu";
import { DropdownItem } from "@/components/ui/DropdownMenu/DropdownItem";
import ModalLayout, {
    ModalLayoutHeader,
    ModalLayoutContent,
    ModalLayoutFooter
} from "@/components/ui/ModalLayout/ModalLayout";
import { Select } from "@/components/ui/Select/Select";
import { V2Activity } from "@/types/activity";
import { QRCodeSVG } from "qrcode.react";
import { ExportCatalogDrawer } from "./ExportCatalogDrawer";
import { updateActivity } from "@/services/supabase/activities";
import { getTenantLogoPublicUrl } from "@/services/supabase/tenants";
import { useToast } from "@/context/Toast/ToastContext";
import { useTenant } from "@/context/useTenant";
import pageStyles from "../ActivityDetailPage.module.scss";
import styles from "./AccessControl.module.scss";

const DEFAULT_FG = "#000000";
const DEFAULT_BG = "#FFFFFF";

interface ActivityAccessControlTabProps {
    activity: V2Activity;
    publicUrl: string;
    tenantId: string;
    onToggleStatus: () => void;
    onDeleteRequest: () => void;
    onReload: () => Promise<void> | void;
}

export const ActivityAccessControlTab: React.FC<ActivityAccessControlTabProps> = ({
    activity,
    publicUrl,
    tenantId,
    onToggleStatus,
    onDeleteRequest,
    onReload
}) => {
    const { showToast } = useToast();
    const { selectedTenant } = useTenant();
    const qrCardRef = useRef<SVGSVGElement>(null);
    const qrModalRef = useRef<SVGSVGElement>(null);
    const isActive = activity.status === "active";
    const isInactive = !isActive;

    // QR preview modal
    const [isQrPreviewOpen, setIsQrPreviewOpen] = useState(false);

    // QR customization — initialized from DB, saved explicitly
    const [qrFgColor, setQrFgColor] = useState(activity.qr_fg_color ?? DEFAULT_FG);
    const [qrBgColor, setQrBgColor] = useState(activity.qr_bg_color ?? DEFAULT_BG);
    const [isSavingColors, setIsSavingColors] = useState(false);
    const [isExportDrawerOpen, setIsExportDrawerOpen] = useState(false);

    // Sync from props if activity changes externally
    useEffect(() => {
        setQrFgColor(activity.qr_fg_color ?? DEFAULT_FG);
        setQrBgColor(activity.qr_bg_color ?? DEFAULT_BG);
    }, [activity.qr_fg_color, activity.qr_bg_color]);

    const handleSaveColors = useCallback(async () => {
        setIsSavingColors(true);
        try {
            await updateActivity(activity.id, tenantId, {
                qr_fg_color: qrFgColor,
                qr_bg_color: qrBgColor
            });
            await onReload();
            showToast({ message: "Colori salvati.", type: "success" });
        } catch {
            showToast({ message: "Impossibile salvare i colori.", type: "error" });
        } finally {
            setIsSavingColors(false);
        }
    }, [activity.id, tenantId, qrFgColor, qrBgColor, onReload, showToast]);

    // Logo
    const logoUrl = useMemo(() => {
        const path = selectedTenant?.logo_url;
        if (!path) return null;
        if (path.startsWith("http")) return path;
        return getTenantLogoPublicUrl(path);
    }, [selectedTenant?.logo_url]);
    const [showLogo, setShowLogo] = useState(true);

    const qrCardImageSettings = logoUrl && showLogo
        ? { src: logoUrl, width: 52, height: 52, excavate: true, crossOrigin: "anonymous" as const }
        : undefined;

    const qrModalImageSettings = logoUrl && showLogo
        ? { src: logoUrl, width: 76, height: 76, excavate: true, crossOrigin: "anonymous" as const }
        : undefined;

    const handleResetColors = useCallback(() => {
        setQrFgColor(DEFAULT_FG);
        setQrBgColor(DEFAULT_BG);
    }, []);

    const handleCopyLink = useCallback(() => {
        navigator.clipboard.writeText(publicUrl);
        showToast({ message: "URL copiato negli appunti.", type: "success" });
    }, [publicUrl, showToast]);

    const handleDownloadQR = useCallback(async () => {
        const svg = (isQrPreviewOpen ? qrModalRef.current : qrCardRef.current);
        if (!svg) return;

        // Inline external <image> hrefs as data URIs so canvas can render them
        const clone = svg.cloneNode(true) as SVGSVGElement;
        const images = clone.querySelectorAll("image");
        await Promise.all(
            Array.from(images).map(async (imgEl) => {
                const href = imgEl.getAttribute("href") ?? imgEl.getAttributeNS("http://www.w3.org/1999/xlink", "href");
                if (!href || href.startsWith("data:")) return;
                try {
                    const resp = await fetch(href, { mode: "cors" });
                    const blob = await resp.blob();
                    const dataUrl = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.readAsDataURL(blob);
                    });
                    imgEl.setAttribute("href", dataUrl);
                    imgEl.removeAttributeNS("http://www.w3.org/1999/xlink", "href");
                } catch {
                    // Se il fetch fallisce, il logo non apparirà nel PNG
                }
            })
        );

        const svgData = new XMLSerializer().serializeToString(clone);
        const img = new Image();

        await new Promise<void>((resolve) => {
            img.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext("2d");
                ctx?.drawImage(img, 0, 0);
                const pngFile = canvas.toDataURL("image/png");

                const downloadLink = document.createElement("a");
                downloadLink.download = `${activity.slug}-qr.png`;
                downloadLink.href = pngFile;
                downloadLink.click();
                resolve();
            };
            img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
        });
    }, [activity.slug, isQrPreviewOpen]);

    const handleReasonChange = useCallback(
        async (e: React.ChangeEvent<HTMLSelectElement>) => {
            const newReason = e.target.value as V2Activity["inactive_reason"];
            try {
                await updateActivity(activity.id, tenantId, { inactive_reason: newReason });
                await onReload();
                showToast({ message: "Motivo aggiornato.", type: "success" });
            } catch {
                showToast({ message: "Impossibile aggiornare il motivo.", type: "error" });
            }
        },
        [activity.id, tenantId, onReload, showToast]
    );

    const handleDownloadSVG = useCallback(() => {
        const svg = (isQrPreviewOpen ? qrModalRef.current : qrCardRef.current);
        if (!svg) return;

        const svgData = new XMLSerializer().serializeToString(svg);
        const blob = new Blob([svgData], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);

        const downloadLink = document.createElement("a");
        downloadLink.download = `${activity.slug}-qr.svg`;
        downloadLink.href = url;
        downloadLink.click();
        URL.revokeObjectURL(url);
    }, [activity.slug, isQrPreviewOpen]);

    return (
        <div className={pageStyles.grid12}>
            {/* Banner inattiva */}
            {isInactive && (
                <div className={`${pageStyles.colSpan12} ${styles.banner}`}>
                    <IconAlertCircle size={20} />
                    <UIText as="span" weight={600}>
                        Attività non pubblicata
                    </UIText>
                    <UIText as="span" variant="caption">
                        Il link pubblico e il QR code non saranno accessibili ai clienti finché
                        l&apos;attività non viene attivata.
                    </UIText>
                </div>
            )}

            {/* Sezione 1: URL Pubblico — riga compatta */}
            <div className={`${pageStyles.colSpan12} ${styles.urlBar}`}>
                <div className={styles.urlBarLeft}>
                    <IconLink size={16} className={styles.urlBarIcon} />
                    <code className={styles.urlCode}>{publicUrl}</code>
                </div>
                <div className={styles.urlActions}>
                    <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<IconCopy size={16} />}
                        onClick={handleCopyLink}
                    >
                        Copia link
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<IconExternalLink size={16} />}
                        onClick={() => window.open(publicUrl, "_blank")}
                        disabled={isInactive}
                    >
                        Apri in nuova tab
                    </Button>
                </div>
            </div>

            {/* Sezione 2: QR Code + Catalogo PDF */}
            <Card className={`${pageStyles.card} ${pageStyles.colSpan6}`}>
                <div className={pageStyles.cardHeader}>
                    <h3>QR Code</h3>
                </div>
                <div className={`${pageStyles.cardContent} ${styles.qrContent}`}>
                    <div
                        className={styles.qrClickable}
                        onClick={() => setIsQrPreviewOpen(true)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => e.key === "Enter" && setIsQrPreviewOpen(true)}
                        aria-label="Espandi anteprima QR Code"
                    >
                        <QRCodeSVG
                            ref={qrCardRef}
                            value={publicUrl}
                            size={200}
                            level="H"
                            includeMargin={false}
                            fgColor={qrFgColor}
                            bgColor={qrBgColor}
                            imageSettings={qrCardImageSettings}
                        />
                        <div className={styles.qrExpandBadge}>
                            <IconArrowsMaximize size={14} />
                        </div>
                    </div>
                    <UIText variant="caption" colorVariant="muted">
                        Clicca per espandere
                    </UIText>
                    <DropdownMenu
                        trigger={
                            <Button
                                variant="secondary"
                                size="sm"
                                leftIcon={<IconDownload size={16} />}
                            >
                                Scarica QR Code
                            </Button>
                        }
                    >
                        <DropdownItem onClick={handleDownloadQR}>
                            <IconPhoto size={15} />
                            Scarica PNG
                        </DropdownItem>
                        <DropdownItem onClick={handleDownloadSVG}>
                            <IconDownload size={15} />
                            Scarica SVG
                        </DropdownItem>
                    </DropdownMenu>
                </div>
            </Card>

            <Card className={`${pageStyles.card} ${pageStyles.colSpan6}`}>
                <div className={pageStyles.cardHeader}>
                    <h3>Catalogo PDF</h3>
                </div>
                <div className={`${pageStyles.cardContent} ${styles.pdfContent}`}>
                    <UIText variant="body-sm" colorVariant="muted">
                        Scarica la versione stampabile di un catalogo in formato PDF.
                    </UIText>
                    <div className={styles.pdfAction}>
                        <Button
                            variant="secondary"
                            size="sm"
                            leftIcon={<IconFileTypePdf size={16} />}
                            onClick={() => setIsExportDrawerOpen(true)}
                        >
                            Esporta catalogo
                        </Button>
                    </div>
                </div>
            </Card>

            {/* Sezione 3: Gestione (Visibilità + Azioni Distruttive) */}
            <Card className={`${pageStyles.card} ${pageStyles.colSpan12} ${styles.managementCard}`}>
                {/* Visibilità pubblica */}
                <div className={pageStyles.cardHeader}>
                    <h3>Visibilità pubblica</h3>
                </div>
                <div className={pageStyles.cardContent}>
                    <div className={styles.visibilityRow}>
                        <div className={styles.visibilityInfo}>
                            <div className={isActive ? styles.statusPublished : styles.statusSuspended}>
                                {isActive ? "Attività pubblicata" : "Attività sospesa"}
                            </div>
                            <p className={styles.visibilityDescription}>
                                {isActive
                                    ? "Il catalogo è attualmente visibile online per tutti gli utenti che dispongono dello slug o del QR code."
                                    : "L'attività è nascosta al pubblico. Solo gli amministratori possono visualizzarla in anteprima."}
                            </p>
                            {isInactive && (
                                <div className={styles.reasonSelect}>
                                    <Select
                                        label="Motivo visualizzato pubblicamente"
                                        value={activity.inactive_reason ?? "maintenance"}
                                        onChange={handleReasonChange}
                                        options={[
                                            { value: "maintenance", label: "Manutenzione" },
                                            { value: "closed", label: "Chiusura temporanea" },
                                            { value: "unavailable", label: "Non disponibile" }
                                        ]}
                                    />
                                </div>
                            )}
                        </div>
                        <Button
                            variant={isActive ? "outline" : "primary"}
                            onClick={onToggleStatus}
                        >
                            {isActive ? "Sospendi" : "Pubblica"}
                        </Button>
                    </div>
                </div>

                <Divider />

                {/* Azioni distruttive */}
                <div className={styles.destructiveSection}>
                    <div className={styles.destructiveHeader}>
                        <IconAlertTriangle size={18} />
                        <h3>Azioni distruttive</h3>
                    </div>
                    <div className={styles.destructiveContent}>
                        <div className={styles.destructiveInfo}>
                            <div className={styles.destructiveLabel}>
                                Elimina definitivamente
                            </div>
                            <p className={styles.destructiveDescription}>
                                Rimuove l&apos;attività e tutte le configurazioni associate. Questa
                                operazione non può essere annullata.
                            </p>
                        </div>
                        <Button
                            variant="danger"
                            onClick={onDeleteRequest}
                        >
                            Elimina
                        </Button>
                    </div>
                </div>
            </Card>

            {/* ── QR Preview Modal ───────────────────────────────────── */}
            <ModalLayout
                isOpen={isQrPreviewOpen}
                onClose={() => setIsQrPreviewOpen(false)}
                width="md"
                height="fit"
            >
                <ModalLayoutHeader>
                    <UIText variant="title-sm" weight={600}>
                        QR Code — {activity.name}
                    </UIText>
                </ModalLayoutHeader>

                <ModalLayoutContent>
                    <div className={styles.qrModalBody}>
                        <div className={styles.qrModalPreview}>
                            <QRCodeSVG
                                ref={qrModalRef}
                                value={publicUrl}
                                size={300}
                                level="H"
                                includeMargin={false}
                                fgColor={qrFgColor}
                                bgColor={qrBgColor}
                                imageSettings={qrModalImageSettings}
                            />
                        </div>

                        <div className={styles.qrCustomize}>
                            <p className={styles.qrCustomizeTitle}>Personalizza</p>

                            <div className={styles.qrColorRow}>
                                <div className={styles.qrColorField}>
                                    <label>Colore QR</label>
                                    <input
                                        type="color"
                                        value={qrFgColor}
                                        onChange={e => setQrFgColor(e.target.value)}
                                    />
                                </div>
                                <div className={styles.qrColorField}>
                                    <label>Sfondo</label>
                                    <input
                                        type="color"
                                        value={qrBgColor}
                                        onChange={e => setQrBgColor(e.target.value)}
                                    />
                                </div>
                            </div>

                            {logoUrl && (
                                <Switch
                                    label="Mostra logo"
                                    checked={showLogo}
                                    onChange={setShowLogo}
                                />
                            )}

                            <div className={styles.qrCustomizeActions}>
                                <Button variant="secondary" size="sm" onClick={handleResetColors}>
                                    Ripristina
                                </Button>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    loading={isSavingColors}
                                    onClick={handleSaveColors}
                                >
                                    Salva colori
                                </Button>
                            </div>
                        </div>
                    </div>
                </ModalLayoutContent>

                <ModalLayoutFooter>
                    <div className={styles.qrModalFooter}>
                        <Button
                            variant="primary"
                            size="sm"
                            leftIcon={<IconPhoto size={16} />}
                            onClick={handleDownloadQR}
                        >
                            Scarica PNG
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            leftIcon={<IconDownload size={16} />}
                            onClick={handleDownloadSVG}
                        >
                            Scarica SVG
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsQrPreviewOpen(false)}
                        >
                            Chiudi
                        </Button>
                    </div>
                </ModalLayoutFooter>
            </ModalLayout>

            <ExportCatalogDrawer
                open={isExportDrawerOpen}
                onClose={() => setIsExportDrawerOpen(false)}
                activityId={activity.id}
                activityName={activity.name}
                tenantId={tenantId}
            />
        </div>
    );
};
