import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import {
    AlertTriangle,
    Maximize2,
    Check,
    Copy,
    Download,
    ExternalLink,
    FileText,
    Image as ImageIcon,
    Link as LinkIcon,
    Trash2
} from "lucide-react";
import { Button, Card } from "@/components/ui";
import UIText from "@/components/ui/Text/Text";
import { Switch } from "@/components/ui/Switch/Switch";
import { DropdownMenu } from "@/components/ui/DropdownMenu/DropdownMenu";
import { DropdownItem } from "@/components/ui/DropdownMenu/DropdownItem";
import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutFooter,
    ModalLayoutHeader
} from "@/components/ui/ModalLayout/ModalLayout";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { SuspendActivityDialog } from "../components/SuspendActivityDialog";
import { ActivityHoursSection } from "./hours-services/ActivityHoursSection";
import { ActivityHoursDrawer } from "./hours-services/ActivityHoursDrawer";
import { ActivityClosuresSection } from "./hours-services/ActivityClosuresSection";
import { ActivityClosureCreateEditDrawer } from "./hours-services/ActivityClosureCreateEditDrawer";
import { ActivityClosureDeleteDrawer } from "./hours-services/ActivityClosureDeleteDrawer";
import { PaymentMethodsSection } from "./hours-services/PaymentMethodsSection";
import { ServicesSection } from "./hours-services/ServicesSection";
import { FeesSection } from "./hours-services/FeesSection";
import { ExportCatalogDrawer } from "./ExportCatalogDrawer";
import { ConfigAccordionSection } from "./components/ConfigAccordionSection";
import {
    deleteActivityAtomic,
    updateActivity
} from "@/services/supabase/activities";
import { listActivityHours } from "@/services/supabase/activityHours";
import { listActivityClosures } from "@/services/supabase/activityClosures";
import { getTenantLogoPublicUrl } from "@/services/supabase/tenants";
import { useToast } from "@/context/Toast/ToastContext";
import { useTenant } from "@/context/useTenant";
import { FEE_DEFINITIONS_BY_KEY } from "@/constants/activityFees";
import type { V2Activity } from "@/types/activity";
import type { V2ActivityHours } from "@/types/activity-hours";
import type { V2ActivityClosure } from "@/types/activity-closures";
import styles from "./ActivitySettingsTab.module.scss";

const DEFAULT_FG = "#000000";
const DEFAULT_BG = "#FFFFFF";

interface ActivitySettingsTabProps {
    activity: V2Activity;
    tenantId: string;
    onReload: () => Promise<void>;
}

export const ActivitySettingsTab: React.FC<ActivitySettingsTabProps> = ({
    activity,
    tenantId,
    onReload
}) => {
    const { showToast } = useToast();
    const { selectedTenant } = useTenant();
    const navigate = useNavigate();

    // ── Hours state ──────────────────────────────────────────────────────────
    const [hours, setHours] = useState<V2ActivityHours[]>([]);
    const [isHoursLoading, setIsHoursLoading] = useState(true);
    const [isHoursDrawerOpen, setIsHoursDrawerOpen] = useState(false);

    // ── Closures state ───────────────────────────────────────────────────────
    const [closures, setClosures] = useState<V2ActivityClosure[]>([]);
    const [isClosuresLoading, setIsClosuresLoading] = useState(true);
    const [isClosureDrawerOpen, setIsClosureDrawerOpen] = useState(false);
    const [isClosureDeleteDrawerOpen, setIsClosureDeleteDrawerOpen] = useState(false);
    const [closureMode, setClosureMode] = useState<"create" | "edit">("create");
    const [selectedClosure, setSelectedClosure] = useState<V2ActivityClosure | undefined>();

    // ── QR / preview state ───────────────────────────────────────────────────
    const qrCardRef = useRef<SVGSVGElement>(null);
    const qrModalRef = useRef<SVGSVGElement>(null);
    const [isQrPreviewOpen, setIsQrPreviewOpen] = useState(false);
    const [qrFgColor, setQrFgColor] = useState(activity.qr_fg_color ?? DEFAULT_FG);
    const [qrBgColor, setQrBgColor] = useState(activity.qr_bg_color ?? DEFAULT_BG);
    const [isSavingColors, setIsSavingColors] = useState(false);
    const [showLogo, setShowLogo] = useState(true);

    // ── PDF export drawer ────────────────────────────────────────────────────
    const [isExportDrawerOpen, setIsExportDrawerOpen] = useState(false);

    // ── Publication / delete dialogs ─────────────────────────────────────────
    const [isSuspendOpen, setIsSuspendOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);

    // ── URL copied indicator ─────────────────────────────────────────────────
    const [isUrlCopied, setIsUrlCopied] = useState(false);

    // ── Computed values ──────────────────────────────────────────────────────
    const domain = import.meta.env.VITE_PUBLIC_DOMAIN || window.location.host;
    const protocol = window.location.protocol;
    const publicUrl = `${protocol}//${domain}/${activity.slug}`;
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

    // ── Loaders ──────────────────────────────────────────────────────────────
    const loadHours = useCallback(async () => {
        try {
            setIsHoursLoading(true);
            setHours(await listActivityHours(activity.id, tenantId));
        } catch {
            showToast({ message: "Errore nel caricamento degli orari.", type: "error" });
        } finally {
            setIsHoursLoading(false);
        }
    }, [activity.id, tenantId, showToast]);

    const loadClosures = useCallback(async () => {
        try {
            setIsClosuresLoading(true);
            setClosures(await listActivityClosures(activity.id, tenantId));
        } catch {
            showToast({ message: "Errore nel caricamento delle chiusure.", type: "error" });
        } finally {
            setIsClosuresLoading(false);
        }
    }, [activity.id, tenantId, showToast]);

    useEffect(() => {
        loadHours();
        loadClosures();
    }, [loadHours, loadClosures]);

    // Sync QR colors from props if changed externally
    useEffect(() => {
        setQrFgColor(activity.qr_fg_color ?? DEFAULT_FG);
        setQrBgColor(activity.qr_bg_color ?? DEFAULT_BG);
    }, [activity.qr_fg_color, activity.qr_bg_color]);

    // ── Handlers: Hours / Closures ───────────────────────────────────────────
    const handleHoursSaved = useCallback(async () => {
        await Promise.all([loadHours(), onReload()]);
    }, [loadHours, onReload]);

    const handleClosureSaved = useCallback(async () => {
        await loadClosures();
    }, [loadClosures]);

    const handleActivitySaved = useCallback(async () => {
        await onReload();
    }, [onReload]);

    const openCreateClosure = () => {
        setClosureMode("create");
        setSelectedClosure(undefined);
        setIsClosureDrawerOpen(true);
    };

    const openEditClosure = (closure: V2ActivityClosure) => {
        setClosureMode("edit");
        setSelectedClosure(closure);
        setIsClosureDrawerOpen(true);
    };

    const openDeleteClosure = (closure: V2ActivityClosure) => {
        setSelectedClosure(closure);
        setIsClosureDeleteDrawerOpen(true);
    };

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

    const handleDownloadQR = useCallback(async () => {
        const svg = isQrPreviewOpen ? qrModalRef.current : qrCardRef.current;
        if (!svg) return;

        const clone = svg.cloneNode(true) as SVGSVGElement;
        const images = clone.querySelectorAll("image");
        await Promise.all(
            Array.from(images).map(async imgEl => {
                const href =
                    imgEl.getAttribute("href") ??
                    imgEl.getAttributeNS("http://www.w3.org/1999/xlink", "href");
                if (!href || href.startsWith("data:")) return;
                try {
                    const resp = await fetch(href, { mode: "cors" });
                    const blob = await resp.blob();
                    const dataUrl = await new Promise<string>(resolve => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.readAsDataURL(blob);
                    });
                    imgEl.setAttribute("href", dataUrl);
                    imgEl.removeAttributeNS("http://www.w3.org/1999/xlink", "href");
                } catch {
                    // logo may not appear
                }
            })
        );

        const svgData = new XMLSerializer().serializeToString(clone);
        const img = new Image();
        await new Promise<void>(resolve => {
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

    const handleDownloadSVG = useCallback(() => {
        const svg = isQrPreviewOpen ? qrModalRef.current : qrCardRef.current;
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
    const handleToggleStatus = useCallback(async () => {
        if (isActive) {
            setIsSuspendOpen(true);
            return;
        }
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
    }, [activity.id, tenantId, isActive, onReload, showToast]);

    const handleSuspendConfirm = useCallback(
        async (reason: "maintenance" | "closed" | "unavailable"): Promise<boolean> => {
            try {
                await updateActivity(activity.id, tenantId, {
                    status: "inactive",
                    inactive_reason: reason
                });
                await onReload();
                showToast({ message: "Sede sospesa.", type: "success" });
                return true;
            } catch {
                showToast({ message: "Impossibile sospendere la sede.", type: "error" });
                return false;
            }
        },
        [activity.id, tenantId, onReload, showToast]
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

    // ── Preview badges for accordion ─────────────────────────────────────────
    const paymentBadges = activity.payment_methods ?? [];
    const serviceBadges = activity.services ?? [];
    const feesBadges = useMemo(
        () =>
            (activity.fees ?? [])
                .filter(f => f.value && f.value.trim() !== "")
                .map(f => FEE_DEFINITIONS_BY_KEY[f.key]?.label ?? f.key),
        [activity.fees]
    );

    return (
        <>
            <div className={styles.layout}>
                {/* ── Row 1: Hours + Closures ──────────────────────────────── */}
                <div className={styles.row}>
                    {isHoursLoading ? (
                        <div className={styles.skeletonCard} />
                    ) : (
                        <ActivityHoursSection
                            hours={hours}
                            activity={activity}
                            onEditRequest={() => setIsHoursDrawerOpen(true)}
                        />
                    )}
                    {isClosuresLoading ? (
                        <div className={styles.skeletonCard} />
                    ) : (
                        <ActivityClosuresSection
                            closures={closures}
                            onCreateRequest={openCreateClosure}
                            onEditRequest={openEditClosure}
                            onDeleteRequest={openDeleteClosure}
                        />
                    )}
                </div>

                {/* ── Row 2: Public access + Site config ───────────────────── */}
                <div className={styles.row}>
                    {/* Card: Accesso pubblico */}
                    <Card className={styles.card}>
                        <div className={styles.cardHeader}>
                            <div className={styles.cardHeaderText}>
                                <h3 className={styles.cardTitle}>Accesso pubblico</h3>
                                <p className={styles.cardSubtitle}>
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
                                        aria-label="Espandi anteprima QR"
                                    >
                                        <QRCodeSVG
                                            ref={qrCardRef}
                                            value={publicUrl}
                                            size={90}
                                            level="H"
                                            includeMargin={false}
                                            fgColor={qrFgColor}
                                            bgColor={qrBgColor}
                                            imageSettings={qrCardImageSettings}
                                        />
                                        <div className={styles.qrExpandBadge}>
                                            <Maximize2 size={12} />
                                        </div>
                                    </div>
                                    <div className={styles.qrSectionInfo}>
                                        <p className={styles.qrSectionDesc}>
                                            Stampabile o condivisibile per accesso rapido alla
                                            pagina pubblica della sede.
                                        </p>
                                        <DropdownMenu
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
                                            <DropdownItem onClick={handleDownloadQR}>
                                                <ImageIcon size={14} />
                                                Scarica PNG
                                            </DropdownItem>
                                            <DropdownItem onClick={handleDownloadSVG}>
                                                <Download size={14} />
                                                Scarica SVG
                                            </DropdownItem>
                                        </DropdownMenu>
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

                    {/* Card: Configurazione sede (accordion) */}
                    <Card className={styles.card}>
                        <div className={styles.cardHeader}>
                            <div className={styles.cardHeaderText}>
                                <h3 className={styles.cardTitle}>Configurazione sede</h3>
                                <p className={styles.cardSubtitle}>
                                    Pagamenti, servizi e tariffe mostrati nel footer pubblico
                                </p>
                            </div>
                        </div>
                        <div className={styles.cardBodyFlat}>
                            <ConfigAccordionSection
                                title="Metodi di pagamento"
                                previewBadges={paymentBadges}
                                defaultOpen
                            >
                                <PaymentMethodsSection
                                    activity={activity}
                                    tenantId={tenantId}
                                    onSaved={handleActivitySaved}
                                />
                            </ConfigAccordionSection>
                            <ConfigAccordionSection
                                title="Servizi offerti"
                                previewBadges={serviceBadges}
                            >
                                <ServicesSection
                                    activity={activity}
                                    tenantId={tenantId}
                                    onSaved={handleActivitySaved}
                                />
                            </ConfigAccordionSection>
                            <ConfigAccordionSection
                                title="Tariffe"
                                previewBadges={feesBadges}
                                isLast
                            >
                                <FeesSection
                                    activity={activity}
                                    tenantId={tenantId}
                                    onSaved={handleActivitySaved}
                                />
                            </ConfigAccordionSection>
                        </div>
                    </Card>
                </div>

                {/* ── Row 3: Publication status (full width) ───────────────── */}
                <Card className={styles.card}>
                    <div className={styles.cardHeader}>
                        <div className={styles.cardHeaderText}>
                            <h3 className={styles.cardTitle}>Stato pubblicazione</h3>
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
                                        : "— non visibile online."}
                                </span>
                            </div>
                        </div>
                        <Button
                            variant={isActive ? "outline" : "primary"}
                            onClick={handleToggleStatus}
                        >
                            {isActive ? "Sospendi pubblicazione" : "Riprendi pubblicazione"}
                        </Button>
                    </div>
                </Card>

                {/* ── Row 4: Destructive actions ───────────────────────────── */}
                <Card className={`${styles.card} ${styles.destructiveCard}`}>
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
            <ActivityHoursDrawer
                open={isHoursDrawerOpen}
                onClose={() => setIsHoursDrawerOpen(false)}
                hours={hours}
                activity={activity}
                tenantId={tenantId}
                onSuccess={handleHoursSaved}
            />
            <ActivityClosureCreateEditDrawer
                open={isClosureDrawerOpen}
                onClose={() => setIsClosureDrawerOpen(false)}
                mode={closureMode}
                activityId={activity.id}
                tenantId={tenantId}
                selectedClosure={selectedClosure}
                onSuccess={handleClosureSaved}
            />
            <ActivityClosureDeleteDrawer
                open={isClosureDeleteDrawerOpen}
                onClose={() => setIsClosureDeleteDrawerOpen(false)}
                closure={selectedClosure}
                tenantId={tenantId}
                onSuccess={handleClosureSaved}
            />
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
                onConfirm={handleSuspendConfirm}
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
