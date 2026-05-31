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
import { ActivityHoursSection } from "./hours-services/ActivityHoursSection";
import { ActivityHoursDrawer } from "./hours-services/ActivityHoursDrawer";
import { ActivityClosuresSection } from "./hours-services/ActivityClosuresSection";
import { ActivityClosureCreateEditDrawer } from "./hours-services/ActivityClosureCreateEditDrawer";
import { ActivityClosureDeleteDrawer } from "./hours-services/ActivityClosureDeleteDrawer";
import { PaymentMethodsSection } from "./hours-services/PaymentMethodsSection";
import { ServicesSection } from "./hours-services/ServicesSection";
import {
    FeesSection,
    feesToState,
    buildFeesPayload,
    feesStateEqual,
    type FeesState
} from "./hours-services/FeesSection";
import { ExportCatalogDrawer } from "./ExportCatalogDrawer";
import { ConfigAccordionSection } from "./components/ConfigAccordionSection";
import {
    deleteActivityAtomic,
    updateActivity,
    updateActivityOrderingEnabled
} from "@/services/supabase/activities";
import { listActivityHours } from "@/services/supabase/activityHours";
import { listActivityClosures } from "@/services/supabase/activityClosures";
import { getTenantLogoPublicUrl } from "@/services/supabase/tenants";
import { useToast } from "@/context/Toast/ToastContext";
import { useTenant } from "@/context/useTenant";
import { FEE_DEFINITIONS_BY_KEY } from "@/constants/activityFees";
import {
    formatInactiveReason,
    type InactiveReason
} from "@/utils/activityStatus";
import type { V2Activity } from "@/types/activity";
import type { V2ActivityHours } from "@/types/activity-hours";
import type { V2ActivityClosure } from "@/types/activity-closures";
import styles from "./ActivitySettingsTab.module.scss";

const DEFAULT_FG = "#000000";
const DEFAULT_BG = "#FFFFFF";

function arraysSameMembers(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    const set = new Set(a);
    for (const x of b) if (!set.has(x)) return false;
    return true;
}

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
    const [suspendDialogMode, setSuspendDialogMode] = useState<
        "suspend" | "edit-reason"
    >("suspend");
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);

    // ── URL copied indicator ─────────────────────────────────────────────────
    const [isUrlCopied, setIsUrlCopied] = useState(false);

    // ── Draft state: payment methods / services / fees ───────────────────────
    const savedPaymentMethods = useMemo(
        () => activity.payment_methods ?? [],
        [activity.payment_methods]
    );
    const savedServices = useMemo(
        () => activity.services ?? [],
        [activity.services]
    );
    const savedFees = useMemo(() => feesToState(activity.fees), [activity.fees]);

    const [paymentsDraft, setPaymentsDraft] = useState<string[]>(savedPaymentMethods);
    const [servicesDraft, setServicesDraft] = useState<string[]>(savedServices);
    const [feesDraft, setFeesDraft] = useState<FeesState>(savedFees);

    const [isSavingPayments, setIsSavingPayments] = useState(false);
    const [isSavingServices, setIsSavingServices] = useState(false);
    const [isSavingFees, setIsSavingFees] = useState(false);

    const lastSavedPaymentsRef = useRef<string[]>(savedPaymentMethods);
    const lastSavedServicesRef = useRef<string[]>(savedServices);
    const lastSavedFeesRef = useRef<FeesState>(savedFees);

    // Re-sync drafts when the saved value changes externally,
    // but preserve user's dirty draft.
    useEffect(() => {
        const newSaved = activity.payment_methods ?? [];
        if (arraysSameMembers(newSaved, lastSavedPaymentsRef.current)) return;
        setPaymentsDraft(prev =>
            arraysSameMembers(prev, lastSavedPaymentsRef.current) ? newSaved : prev
        );
        lastSavedPaymentsRef.current = newSaved;
    }, [activity.payment_methods]);

    useEffect(() => {
        const newSaved = activity.services ?? [];
        if (arraysSameMembers(newSaved, lastSavedServicesRef.current)) return;
        setServicesDraft(prev =>
            arraysSameMembers(prev, lastSavedServicesRef.current) ? newSaved : prev
        );
        lastSavedServicesRef.current = newSaved;
    }, [activity.services]);

    useEffect(() => {
        const newSaved = feesToState(activity.fees);
        if (feesStateEqual(newSaved, lastSavedFeesRef.current)) return;
        setFeesDraft(prev =>
            feesStateEqual(prev, lastSavedFeesRef.current) ? newSaved : prev
        );
        lastSavedFeesRef.current = newSaved;
    }, [activity.fees]);

    const isPaymentsDirty = !arraysSameMembers(paymentsDraft, savedPaymentMethods);
    const isServicesDirty = !arraysSameMembers(servicesDraft, savedServices);
    const isFeesDirty = !feesStateEqual(feesDraft, savedFees);

    // ── Single-open accordion state ──────────────────────────────────────────
    type AccordionKey = "payments" | "services" | "fees" | null;
    const [openAccordion, setOpenAccordion] = useState<AccordionKey>(null);

    const handleToggleAccordion = useCallback(
        (key: Exclude<AccordionKey, null>) => {
            if (key === openAccordion) {
                setOpenAccordion(null);
                return;
            }
            const currentlyOpenIsDirty =
                (openAccordion === "payments" && isPaymentsDirty) ||
                (openAccordion === "services" && isServicesDirty) ||
                (openAccordion === "fees" && isFeesDirty);
            if (currentlyOpenIsDirty) {
                showToast({
                    message:
                        "Salva o annulla le modifiche prima di continuare",
                    type: "warning"
                });
                return;
            }
            setOpenAccordion(key);
        },
        [openAccordion, isPaymentsDirty, isServicesDirty, isFeesDirty, showToast]
    );

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

    // ── Draft save / cancel handlers ─────────────────────────────────────────
    const savePayments = useCallback(async () => {
        setIsSavingPayments(true);
        try {
            await updateActivity(activity.id, tenantId, {
                payment_methods: paymentsDraft
            });
            await onReload();
            showToast({ message: "Metodi di pagamento salvati.", type: "success" });
        } catch {
            showToast({
                message: "Impossibile salvare i metodi di pagamento.",
                type: "error"
            });
        } finally {
            setIsSavingPayments(false);
        }
    }, [activity.id, tenantId, paymentsDraft, onReload, showToast]);

    const cancelPayments = useCallback(() => {
        setPaymentsDraft(savedPaymentMethods);
    }, [savedPaymentMethods]);

    const saveServices = useCallback(async () => {
        setIsSavingServices(true);
        try {
            await updateActivity(activity.id, tenantId, {
                services: servicesDraft
            });
            await onReload();
            showToast({ message: "Servizi salvati.", type: "success" });
        } catch {
            showToast({ message: "Impossibile salvare i servizi.", type: "error" });
        } finally {
            setIsSavingServices(false);
        }
    }, [activity.id, tenantId, servicesDraft, onReload, showToast]);

    const cancelServices = useCallback(() => {
        setServicesDraft(savedServices);
    }, [savedServices]);

    const saveFees = useCallback(async () => {
        setIsSavingFees(true);
        try {
            await updateActivity(activity.id, tenantId, {
                fees: buildFeesPayload(feesDraft)
            });
            await onReload();
            showToast({ message: "Tariffe salvate.", type: "success" });
        } catch {
            showToast({ message: "Impossibile salvare le tariffe.", type: "error" });
        } finally {
            setIsSavingFees(false);
        }
    }, [activity.id, tenantId, feesDraft, onReload, showToast]);

    const cancelFees = useCallback(() => {
        setFeesDraft(savedFees);
    }, [savedFees]);

    // ── Public toggles (immediate save) ──────────────────────────────────────
    const handlePaymentsPublicToggle = useCallback(
        async (checked: boolean) => {
            try {
                await updateActivity(activity.id, tenantId, {
                    payment_methods_public: checked
                });
                await onReload();
            } catch {
                showToast({
                    message: "Impossibile aggiornare la visibilità.",
                    type: "error"
                });
            }
        },
        [activity.id, tenantId, onReload, showToast]
    );

    const handleServicesPublicToggle = useCallback(
        async (checked: boolean) => {
            try {
                await updateActivity(activity.id, tenantId, {
                    services_public: checked
                });
                await onReload();
            } catch {
                showToast({
                    message: "Impossibile aggiornare la visibilità.",
                    type: "error"
                });
            }
        },
        [activity.id, tenantId, onReload, showToast]
    );

    const handleFeesPublicToggle = useCallback(
        async (checked: boolean) => {
            try {
                await updateActivity(activity.id, tenantId, {
                    fees_public: checked
                });
                await onReload();
            } catch {
                showToast({
                    message: "Impossibile aggiornare la visibilità.",
                    type: "error"
                });
            }
        },
        [activity.id, tenantId, onReload, showToast]
    );

    const handleOrderingEnabledToggle = useCallback(
        async (checked: boolean) => {
            try {
                await updateActivityOrderingEnabled(activity.id, tenantId, checked);
                showToast({
                    message: checked
                        ? "Ordinazioni QR riattivate"
                        : "Ordinazioni QR sospese. I clienti vedranno il menu ma non potranno ordinare.",
                    type: "success"
                });
                await onReload();
            } catch {
                showToast({
                    message: "Impossibile aggiornare lo stato delle ordinazioni.",
                    type: "error"
                });
            }
        },
        [activity.id, tenantId, onReload, showToast]
    );

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

    // ── Preview badges for accordion (use SAVED, not draft) ──────────────────
    const paymentPreviewBadges = useMemo<string[]>(
        () => savedPaymentMethods,
        [savedPaymentMethods]
    );
    const servicesPreviewBadges = useMemo<string[]>(
        () => savedServices,
        [savedServices]
    );
    const feesPreviewBadges = useMemo<string[]>(
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
                                        aria-label="Apri anteprima QR"
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
                                previewBadges={paymentPreviewBadges}
                                isOpen={openAccordion === "payments"}
                                onToggle={() => handleToggleAccordion("payments")}
                                publicToggle={{
                                    value: activity.payment_methods_public,
                                    onChange: handlePaymentsPublicToggle
                                }}
                                draft={{
                                    isDirty: isPaymentsDirty,
                                    onSave: savePayments,
                                    onCancel: cancelPayments,
                                    isSaving: isSavingPayments
                                }}
                            >
                                <PaymentMethodsSection
                                    value={paymentsDraft}
                                    onChange={setPaymentsDraft}
                                    disabled={isSavingPayments}
                                />
                            </ConfigAccordionSection>
                            <ConfigAccordionSection
                                title="Servizi offerti"
                                previewBadges={servicesPreviewBadges}
                                isOpen={openAccordion === "services"}
                                onToggle={() => handleToggleAccordion("services")}
                                publicToggle={{
                                    value: activity.services_public,
                                    onChange: handleServicesPublicToggle
                                }}
                                draft={{
                                    isDirty: isServicesDirty,
                                    onSave: saveServices,
                                    onCancel: cancelServices,
                                    isSaving: isSavingServices
                                }}
                            >
                                <ServicesSection
                                    value={servicesDraft}
                                    onChange={setServicesDraft}
                                    disabled={isSavingServices}
                                />
                            </ConfigAccordionSection>
                            <ConfigAccordionSection
                                title="Tariffe"
                                previewBadges={feesPreviewBadges}
                                isLast
                                isOpen={openAccordion === "fees"}
                                onToggle={() => handleToggleAccordion("fees")}
                                publicToggle={{
                                    value: activity.fees_public,
                                    onChange: handleFeesPublicToggle
                                }}
                                draft={{
                                    isDirty: isFeesDirty,
                                    onSave: saveFees,
                                    onCancel: cancelFees,
                                    isSaving: isSavingFees
                                }}
                            >
                                <FeesSection
                                    value={feesDraft}
                                    onChange={setFeesDraft}
                                    disabled={isSavingFees}
                                />
                            </ConfigAccordionSection>
                        </div>
                    </Card>
                </div>

                {/* ── Row 2b: Ordinazioni QR maintenance toggle (full width) ── */}
                <Card className={styles.card}>
                    <div className={styles.cardHeader}>
                        <div className={styles.cardHeaderText}>
                            <h3 className={styles.cardTitle}>Ordinazioni dal tavolo</h3>
                            <p className={styles.cardSubtitle}>
                                Sospendi temporaneamente la ricezione di ordini dal QR senza chiudere la sede.
                            </p>
                        </div>
                    </div>
                    <div className={styles.cardBodyFlat} style={{ padding: "16px 24px" }}>
                        <Switch
                            checked={activity.ordering_enabled}
                            onChange={handleOrderingEnabledToggle}
                            label="Ordinazioni QR abilitate"
                            description={
                                activity.ordering_enabled
                                    ? "I clienti possono ordinare scansionando il QR del tavolo."
                                    : "I clienti vedono il menu in sola lettura. Il tasto Invia ordine e' disabilitato. Riattiva quando vuoi accettare nuovamente ordini al tavolo."
                            }
                        />
                    </div>
                </Card>

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
                                        : `— ${formatInactiveReason(
                                              activity.inactive_reason
                                          )}`}
                                </span>
                            </div>
                        </div>
                        {isActive ? (
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
                        )}
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
