import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from "react";
import { useNavigate } from "react-router-dom";
import { QrCode, type QrCodeHandle } from "@/components/ui/QrCode/QrCode";
import { buildPublicUrl } from "@/utils/publicUrl";
import {
    AlertTriangle,
    Check,
    Copy,
    Download,
    ExternalLink,
    FileText,
    Image as ImageIcon,
    Link as LinkIcon,
    Palette,
    Trash2
} from "lucide-react";
import { Button, Card } from "@/components/ui";
import UIText from "@/components/ui/Text/Text";
import { Switch } from "@/components/ui/Switch/Switch";
import { Menu } from "@/components/ui/Menu";
import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutFooter,
    ModalLayoutHeader
} from "@/components/ui/ModalLayout/ModalLayout";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { SuspendActivityDialog } from "../components/SuspendActivityDialog";
import { ExportCatalogDrawer } from "./ExportCatalogDrawer";
import {
    deleteActivityAtomic,
    updateActivity
} from "@/services/supabase/activities";
import { getTenantLogoPublicUrl } from "@/services/supabase/tenants";
import { useToast } from "@/context/Toast/ToastContext";
import { useTenant } from "@/context/useTenant";
import {
    formatInactiveReason,
    type InactiveReason
} from "@/utils/activityStatus";
import type { V2Activity } from "@/types/activity";
import cards from "./ActivityTabCards.module.scss";
import styles from "./ActivitySettingsTab.module.scss";

const DEFAULT_FG = "#000000";
const DEFAULT_BG = "#FFFFFF";

interface ActivitySettingsTabProps {
    activity: V2Activity;
    tenantId: string;
    onReload: () => Promise<void>;
    canWrite?: boolean;
}

/**
 * Tab "Impostazioni": la sede come oggetto — come si raggiunge (URL, QR,
 * menù PDF), se è pubblicata, come si elimina. Cosa offre il locale sta in
 * Profilo; orari, sala e canali hanno la loro tab.
 */
export const ActivitySettingsTab: React.FC<ActivitySettingsTabProps> = ({
    activity,
    tenantId,
    onReload,
    canWrite = true
}) => {
    const { showToast } = useToast();
    const { selectedTenant } = useTenant();
    const navigate = useNavigate();

    // ── QR / preview state ───────────────────────────────────────────────────
    // Due istanze del QR (anteprima nella card + modale ingrandita): i controlli
    // di download vivono fuori dal componente e scelgono a runtime quale delle
    // due scaricare, quindi i download passano dai ref imperativi.
    const qrCardRef = useRef<QrCodeHandle>(null);
    const qrModalRef = useRef<QrCodeHandle>(null);
    const [isQrPreviewOpen, setIsQrPreviewOpen] = useState(false);
    const [qrFgColor, setQrFgColor] = useState(activity.qr_fg_color ?? DEFAULT_FG);
    const [qrBgColor, setQrBgColor] = useState(activity.qr_bg_color ?? DEFAULT_BG);
    const [isSavingColors, setIsSavingColors] = useState(false);
    const [showLogo, setShowLogo] = useState(true);

    // ── PDF export drawer ────────────────────────────────────────────────────
    const [isExportDrawerOpen, setIsExportDrawerOpen] = useState(false);

    // ── Publication / delete dialogs ─────────────────────────────────────────
    const [isSuspendOpen, setIsSuspendOpen] = useState(false);
    const [suspendDialogMode, setSuspendDialogMode] = useState<
        "suspend" | "edit-reason"
    >("suspend");
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);

    // ── URL copied indicator ─────────────────────────────────────────────────
    const [isUrlCopied, setIsUrlCopied] = useState(false);

    // ── Computed values ──────────────────────────────────────────────────────
    const publicUrl = buildPublicUrl(activity.slug);
    const isActive = activity.status === "active";

    const logoUrl = useMemo(() => {
        const path = selectedTenant?.logo_url;
        if (!path) return null;
        if (path.startsWith("http")) return path;
        return getTenantLogoPublicUrl(path);
    }, [selectedTenant?.logo_url]);

    const qrCardImageSettings =
        logoUrl && showLogo
            ? {
                  src: logoUrl,
                  width: 26,
                  height: 26,
                  excavate: true,
                  crossOrigin: "anonymous" as const
              }
            : undefined;

    const qrModalImageSettings =
        logoUrl && showLogo
            ? {
                  src: logoUrl,
                  width: 76,
                  height: 76,
                  excavate: true,
                  crossOrigin: "anonymous" as const
              }
            : undefined;

    // Sync QR colors from props if changed externally
    useEffect(() => {
        setQrFgColor(activity.qr_fg_color ?? DEFAULT_FG);
        setQrBgColor(activity.qr_bg_color ?? DEFAULT_BG);
    }, [activity.qr_fg_color, activity.qr_bg_color]);

    // ── Handlers: URL / QR / PDF ─────────────────────────────────────────────
    const handleCopyLink = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(publicUrl);
            setIsUrlCopied(true);
            showToast({ message: "URL copiato negli appunti.", type: "success" });
            setTimeout(() => setIsUrlCopied(false), 2000);
        } catch {
            showToast({ message: "Impossibile copiare l'URL.", type: "error" });
        }
    }, [publicUrl, showToast]);

    // La modale, quando aperta, è l'istanza che l'utente sta guardando: è quella
    // da scaricare (size 300 invece di 90).
    const handleDownloadQR = useCallback(async () => {
        const qr = isQrPreviewOpen ? qrModalRef.current : qrCardRef.current;
        await qr?.downloadPng();
    }, [isQrPreviewOpen]);

    const handleDownloadSVG = useCallback(() => {
        const qr = isQrPreviewOpen ? qrModalRef.current : qrCardRef.current;
        qr?.downloadSvg();
    }, [isQrPreviewOpen]);

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

    const handleResetColors = useCallback(() => {
        setQrFgColor(DEFAULT_FG);
        setQrBgColor(DEFAULT_BG);
    }, []);

    // ── Handlers: Publication / Delete ───────────────────────────────────────
    const handleSuspendRequest = useCallback(() => {
        setSuspendDialogMode("suspend");
        setIsSuspendOpen(true);
    }, []);

    const handleEditReasonRequest = useCallback(() => {
        setSuspendDialogMode("edit-reason");
        setIsSuspendOpen(true);
    }, []);

    const handleResumeStatus = useCallback(async () => {
        try {
            await updateActivity(activity.id, tenantId, {
                status: "active",
                inactive_reason: null
            });
            await onReload();
            showToast({ message: "Sede riattivata con successo.", type: "success" });
        } catch {
            showToast({ message: "Impossibile riattivare la sede.", type: "error" });
        }
    }, [activity.id, tenantId, onReload, showToast]);

    const handleSuspendDialogConfirm = useCallback(
        async (reason: InactiveReason): Promise<boolean> => {
            try {
                if (suspendDialogMode === "edit-reason") {
                    await updateActivity(activity.id, tenantId, {
                        inactive_reason: reason
                    });
                    await onReload();
                    showToast({ message: "Motivo aggiornato.", type: "success" });
                } else {
                    await updateActivity(activity.id, tenantId, {
                        status: "inactive",
                        inactive_reason: reason
                    });
                    await onReload();
                    showToast({ message: "Sede sospesa.", type: "success" });
                }
                return true;
            } catch {
                showToast({
                    message:
                        suspendDialogMode === "edit-reason"
                            ? "Impossibile aggiornare il motivo."
                            : "Impossibile sospendere la sede.",
                    type: "error"
                });
                return false;
            }
        },
        [activity.id, tenantId, suspendDialogMode, onReload, showToast]
    );

    const handleDeleteActivity = useCallback(async (): Promise<boolean> => {
        try {
            await deleteActivityAtomic(activity.id);
            showToast({ message: "Sede eliminata con successo.", type: "success" });
            navigate(`/business/${tenantId}/locations`);
            return true;
        } catch {
            showToast({ message: "Errore durante l'eliminazione della sede.", type: "error" });
            return false;
        }
    }, [activity.id, tenantId, navigate, showToast]);

    return (
        <>
            <div className={cards.layout}>
                {/* ── Accesso pubblico: come si raggiunge la sede ─────────── */}
                <Card className={cards.card}>
                    <div className={cards.cardHeader}>
                        <div className={cards.cardHeaderText}>
                            <h3 className={cards.cardTitle}>Accesso pubblico</h3>
                            <p className={cards.cardSubtitle}>
                                URL pubblico, QR code e catalogo PDF
                            </p>
                        </div>
                    </div>
                    <div className={styles.cardBody}>
                        {/* URL section */}
                        <div className={styles.urlSection}>
                            <span className={styles.sectionLabel}>URL pubblico</span>
                            <div className={styles.urlBox}>
                                <LinkIcon
                                    size={14}
                                    className={styles.urlBoxIcon}
                                />
                                <code className={styles.urlCode}>{publicUrl}</code>
                                <button
                                    type="button"
                                    className={styles.urlCopyBtn}
                                    onClick={handleCopyLink}
                                    aria-label="Copia URL"
                                >
                                    {isUrlCopied ? (
                                        <Check size={14} />
                                    ) : (
                                        <Copy size={14} />
                                    )}
                                    {isUrlCopied ? "Copiato" : "Copia"}
                                </button>
                            </div>
                            <a
                                href={publicUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.urlExternal}
                            >
                                Apri in nuova tab
                                <ExternalLink size={12} />
                            </a>
                        </div>

                        <div className={styles.divider} />

                        {/* QR section */}
                        <div className={styles.qrSection}>
                            <div className={styles.qrSectionHeader}>
                                <span className={styles.sectionLabel}>QR Code sede</span>
                            </div>
                            <div className={styles.qrSectionBody}>
                                <div
                                    className={styles.qrThumb}
                                    onClick={() => setIsQrPreviewOpen(true)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={e =>
                                        e.key === "Enter" && setIsQrPreviewOpen(true)
                                    }
                                    aria-label="Apri anteprima QR"
                                >
                                    <QrCode
                                        ref={qrCardRef}
                                        value={publicUrl}
                                        size={90}
                                        level="H"
                                        includeMargin={false}
                                        fgColor={qrFgColor}
                                        bgColor={qrBgColor}
                                        imageSettings={qrCardImageSettings}
                                        fileName={`${activity.slug}-qr`}
                                    />
                                </div>
                                <div className={styles.qrSectionInfo}>
                                    <p className={styles.qrSectionDesc}>
                                        Stampabile o condivisibile per accesso rapido alla
                                        pagina pubblica della sede.
                                    </p>
                                    <div className={styles.qrSectionActions}>
                                        <Menu
                                            trigger={
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    leftIcon={<Download size={14} />}
                                                >
                                                    Scarica
                                                </Button>
                                            }
                                        >
                                            <Menu.Item icon={ImageIcon} onSelect={handleDownloadQR}>
                                                Scarica PNG
                                            </Menu.Item>
                                            <Menu.Item icon={Download} onSelect={handleDownloadSVG}>
                                                Scarica SVG
                                            </Menu.Item>
                                        </Menu>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            leftIcon={<Palette size={14} />}
                                            onClick={() =>
                                                setIsQrPreviewOpen(true)
                                            }
                                        >
                                            Personalizza
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className={styles.divider} />

                        {/* PDF section */}
                        <div className={styles.pdfSection}>
                            <div className={styles.pdfSectionText}>
                                <span className={styles.sectionLabel}>Catalogo PDF</span>
                                <p className={styles.pdfDesc}>
                                    Esporta una versione stampabile del catalogo attivo.
                                </p>
                            </div>
                            <Button
                                variant="secondary"
                                size="sm"
                                leftIcon={<FileText size={14} />}
                                onClick={() => setIsExportDrawerOpen(true)}
                            >
                                Esporta
                            </Button>
                        </div>
                    </div>
                </Card>

                {/* ── Stato pubblicazione ──────────────────────────────────── */}
                <Card className={cards.card}>
                    <div className={cards.cardHeader}>
                        <div className={cards.cardHeaderText}>
                            <h3 className={cards.cardTitle}>Stato pubblicazione</h3>
                            <div className={styles.publicationRow}>
                                <span
                                    className={`${styles.statusDot} ${
                                        isActive ? styles.statusDotActive : ""
                                    }`}
                                />
                                <span className={styles.publicationLabel}>
                                    {isActive
                                        ? "Attività pubblicata"
                                        : "Attività sospesa"}
                                </span>
                                <span className={styles.publicationHint}>
                                    {isActive
                                        ? "— visibile tramite URL e QR code."
                                        : `— ${formatInactiveReason(
                                              activity.inactive_reason
                                          )}`}
                                </span>
                            </div>
                        </div>
                        {canWrite && (isActive ? (
                            <Button
                                variant="outline"
                                onClick={handleSuspendRequest}
                            >
                                Sospendi pubblicazione
                            </Button>
                        ) : (
                            <div className={styles.publicationActions}>
                                <Button
                                    variant="secondary"
                                    onClick={handleEditReasonRequest}
                                >
                                    Modifica motivo
                                </Button>
                                <Button
                                    variant="primary"
                                    onClick={handleResumeStatus}
                                >
                                    Riprendi pubblicazione
                                </Button>
                            </div>
                        ))}
                    </div>
                </Card>

                {/* ── Eliminazione ─────────────────────────────────────────── */}
                <Card className={`${cards.card} ${styles.destructiveCard}`}>
                    <div className={styles.destructiveHeader}>
                        <AlertTriangle size={16} />
                        <span className={styles.destructiveLabel}>Azioni distruttive</span>
                    </div>
                    <div className={styles.destructiveBody}>
                        <div className={styles.destructiveText}>
                            <p className={styles.destructiveTitle}>
                                Elimina definitivamente
                            </p>
                            <p className={styles.destructiveDesc}>
                                Rimuove la sede e tutte le configurazioni associate.
                                Irreversibile.
                            </p>
                        </div>
                        <Button
                            variant="danger"
                            leftIcon={<Trash2 size={14} />}
                            onClick={() => setIsDeleteOpen(true)}
                        >
                            Elimina
                        </Button>
                    </div>
                </Card>
            </div>

            {/* ── Drawers ──────────────────────────────────────────────────── */}
            <ExportCatalogDrawer
                open={isExportDrawerOpen}
                onClose={() => setIsExportDrawerOpen(false)}
                activityId={activity.id}
                activityName={activity.name}
                tenantId={tenantId}
            />

            {/* ── Dialogs ──────────────────────────────────────────────────── */}
            <SuspendActivityDialog
                isOpen={isSuspendOpen}
                onClose={() => setIsSuspendOpen(false)}
                onConfirm={handleSuspendDialogConfirm}
                mode={suspendDialogMode}
                initialReason={
                    suspendDialogMode === "edit-reason"
                        ? activity.inactive_reason
                        : null
                }
            />
            <ConfirmDialog
                isOpen={isDeleteOpen}
                onClose={() => setIsDeleteOpen(false)}
                title="Elimina sede"
                message="Questa azione è irreversibile. La sede e tutte le configurazioni associate verranno eliminate definitivamente."
                confirmLabel="Elimina"
                onConfirm={handleDeleteActivity}
            />

            {/* ── QR Preview Modal ─────────────────────────────────────────── */}
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
                            <QrCode
                                ref={qrModalRef}
                                value={publicUrl}
                                size={300}
                                level="H"
                                includeMargin={false}
                                fgColor={qrFgColor}
                                bgColor={qrBgColor}
                                imageSettings={qrModalImageSettings}
                                fileName={`${activity.slug}-qr`}
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
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={handleResetColors}
                                >
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
                            leftIcon={<ImageIcon size={14} />}
                            onClick={handleDownloadQR}
                        >
                            Scarica PNG
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            leftIcon={<Download size={14} />}
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
        </>
    );
};
