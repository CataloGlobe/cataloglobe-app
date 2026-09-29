import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTenantId } from "@/context/useTenantId";
import { useBreadcrumbItems } from "@/context/useBreadcrumbItems";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { Button } from "@/components/ui/Button/Button";
import { TextInput } from "@/components/ui/Input/TextInput";
import Text from "@/components/ui/Text/Text";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { useToast } from "@/context/Toast/ToastContext";
import { IconLayoutSidebarRightCollapse, IconLayoutSidebarRightExpand, IconChevronDown, IconDeviceMobile, IconDeviceDesktop, IconHistory, IconPalette } from "@tabler/icons-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
    getStyle,
    updateStyle,
    duplicateStyle,
    V2Style
} from "@/services/supabase/styles";
import { listAppearanceSources } from "@/services/supabase/layoutScheduling";
import { toRomeDateTime } from "@/services/supabase/schedulingNow";
import { appearanceOf, buildAppearance, describeStyleSaveWarning } from "@/utils/ruleAppearance";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { StylePreview, type ViewMode } from "./Editor/StylePreview";
import { SegmentedControl } from "@components/ui/SegmentedControl/SegmentedControl";
import { StylePropertiesPanel } from "./Editor/StylePropertiesPanel";
import { StyleVersionsPopover } from "./Editor/StyleVersionsPopover";
import { useStyleVersioning } from "./Editor/useStyleVersioning";
import {
    StyleTokenModel,
    parseTokens,
    serializeTokens,
    DEFAULT_STYLE_TOKENS
} from "./Editor/StyleTokenModel";
import styles from "./Styles.module.scss";
import { loadPublicFonts } from "@utils/loadPublicFonts";
import { usePermissions } from "@/context/PermissionsContext";
import { canDoOnTenant } from "@/lib/permissions";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { PageGate } from "@/components/PageGate/PageGate";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { useUnsavedChangesGuard } from "@/components/ui/UnsavedChangesBar/useUnsavedChangesGuard";
import {
    HeaderSaveAction,
    DiscardChangesConfirmDialog
} from "@/pages/Dashboard/Stories/components/HeaderSaveAction";
import { buildSaveActionCompactConfig } from "@/pages/Dashboard/Stories/components/headerSaveActionCompact";

// Larghezza del drawer Proprietà. Single source: framer anima questa width
// (0 ↔ PANEL_WIDTH); l'inner è fissato a PANEL_WIDTH così non reflowa durante
// l'animazione. Allineato a `.propertiesPanelInner { width }` nel SCSS.
const PANEL_WIDTH = 360;

export default function StyleEditorPage() {
    const { styleId } = useParams<{ styleId: string }>();
    const navigate = useNavigate();
    const currentTenantId = useTenantId();
    const { showToast } = useToast();
    const { permissions } = usePermissions();
    const { canEdit } = useSubscriptionGuard();
    // Gate di lettura prima di ogni fetch («skip fetch pre-check»); il blocco
    // lo rende `PageGate` più sotto.
    const canRead = permissions != null && canDoOnTenant(permissions, "styles.read");
    // Chi non ha `styles.write` (o ha l'abbonamento fermo) vede lo stile com'è:
    // pannello spento, niente Salva, niente ripristino di versioni.
    const canWrite = permissions != null && canDoOnTenant(permissions, "styles.write");

    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isDuplicating, setIsDuplicating] = useState(false);
    const [isPanelOpen, setIsPanelOpen] = useState(true);
    const reduce = useReducedMotion();
    const [viewMode, setViewMode] = useState<ViewMode>("mobile");
    const [isViewTransitioning, setIsViewTransitioning] = useState(false);
    const transitionTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    // Anchor del dropdown versioni (portalato): il popover legge il rect di questo trigger.
    const versionAnchorRef = useRef<HTMLButtonElement>(null);

    const handleViewModeChange = useCallback((mode: ViewMode) => {
        if (mode === viewMode) return;
        clearTimeout(transitionTimer.current);
        setIsViewTransitioning(true);
        transitionTimer.current = setTimeout(() => {
            setViewMode(mode);
            requestAnimationFrame(() => setIsViewTransitioning(false));
        }, 250);
    }, [viewMode]);

    const [styleData, setStyleData] = useState<V2Style | null>(null);
    const [name, setName] = useState("");
    const [tokenModel, setTokenModel] = useState<StyleTokenModel>(DEFAULT_STYLE_TOKENS);
    const [originalTokens, setOriginalTokens] = useState<StyleTokenModel>(DEFAULT_STYLE_TOKENS);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    // L'avviso prima di salvare (§34.5): chi vede la modifica, e quando.
    const [saveWarning, setSaveWarning] = useState<string | null>(null);
    const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

    const isSystem = Boolean(styleData?.is_system);
    // Uno stile di sistema non si modifica da nessuno: si duplica.
    const readOnly = !canWrite || !canEdit || isSystem;
    const isDirty =
        styleData != null &&
        (name !== styleData.name || JSON.stringify(tokenModel) !== JSON.stringify(originalTokens));

    useUnsavedChangesGuard(isDirty && !readOnly);

    useEffect(() => {
        return loadPublicFonts();
    }, []);

    // Blocco scroll globale
    useEffect(() => {
        const origHtmlH = document.documentElement.style.height;
        const origBodyH = document.body.style.height;
        const origBodyO = document.body.style.overflow;
        document.documentElement.style.height = "100%";
        document.body.style.height = "100%";
        document.body.style.overflow = "hidden";
        return () => {
            document.documentElement.style.height = origHtmlH;
            document.body.style.height = origBodyH;
            document.body.style.overflow = origBodyO;
        };
    }, []);

    const loadStyle = useCallback(
        async (id: string) => {
            try {
                setIsLoading(true);
                setLoadError(false);
                const data = await getStyle(id, currentTenantId!);
                setStyleData(data);
                if (data) {
                    setName(data.name);
                    try {
                        const parsed = parseTokens(data.current_version?.config ?? {});
                        setTokenModel(parsed);
                        setOriginalTokens(parsed);
                    } catch {
                        setTokenModel(DEFAULT_STYLE_TOKENS);
                        setOriginalTokens(DEFAULT_STYLE_TOKENS);
                    }
                }
            } catch (error) {
                // Un errore non è «non trovato»: la pagina lo dice, con «Riprova».
                console.error("Caricamento stile:", error);
                setLoadError(true);
            } finally {
                setIsLoading(false);
            }
        },
        [currentTenantId]
    );

    useEffect(() => {
        if (!currentTenantId || !styleId || !canRead) return;
        loadStyle(styleId);
    }, [currentTenantId, styleId, canRead, loadStyle]);

    const onRollbackComplete = useCallback(async () => {
        if (styleId) await loadStyle(styleId);
    }, [styleId, loadStyle]);

    const versioning = useStyleVersioning({
        styleId,
        tenantId: styleData?.tenant_id,
        onRollbackComplete
    });
    const invalidateVersions = versioning.invalidate;

    const doSave = useCallback(async (): Promise<boolean> => {
        if (!styleData) return false;
        const config = serializeTokens(tokenModel);
        setIsSaving(true);
        try {
            await updateStyle(styleData.id, name.trim(), config, styleData.tenant_id);
            showToast({ message: "Stile aggiornato (nuova versione creata).", type: "success" });
            setOriginalTokens(parseTokens(config));
            invalidateVersions();
            const refreshed = await getStyle(styleData.id, styleData.tenant_id);
            if (refreshed) {
                setStyleData(refreshed);
                setName(refreshed.name);
            }
            return true;
        } catch {
            showToast({ message: "Impossibile salvare lo stile.", type: "error" });
            return false;
        } finally {
            setIsSaving(false);
        }
    }, [name, tokenModel, styleData, showToast, invalidateVersions]);

    // Salva: se lo stile veste delle regole, prima l'avviso (§34.5). L'avviso
    // non si spegne: dice cosa succede ogni volta che è vero (§34.5/3).
    const handleSave = useCallback(async () => {
        if (!styleData || readOnly) return;
        if (!name.trim()) {
            showToast({ message: "Il nome dello stile è obbligatorio.", type: "error" });
            return;
        }
        setIsSaving(true);
        let warning: string | null = null;
        try {
            // Le regole si rileggono al Salva: chi vede la modifica è quello di adesso.
            const sources = await listAppearanceSources(styleData.tenant_id);
            const index = buildAppearance({ ...sources, instant: toRomeDateTime(new Date()), subscriptionInactive: !canEdit });
            warning = describeStyleSaveWarning(appearanceOf(index, { kind: "style", id: styleData.id }));
        } catch {
            showToast({ message: "Impossibile salvare lo stile.", type: "error" });
            setIsSaving(false);
            return;
        }
        setIsSaving(false);
        if (warning) {
            setSaveWarning(warning);
            setIsConfirmOpen(true);
            return;
        }
        await doSave();
    }, [name, styleData, readOnly, canEdit, showToast, doSave]);

    const handleSubmit = useCallback(
        (e: React.FormEvent) => {
            e.preventDefault();
            void handleSave();
        },
        [handleSave]
    );

    const handleDiscard = useCallback(() => {
        setTokenModel(originalTokens);
        setName(styleData?.name ?? "");
    }, [originalTokens, styleData]);

    const handleDuplicateAndEdit = useCallback(async () => {
        if (!styleData) return;
        setIsDuplicating(true);
        try {
            const copy = await duplicateStyle(styleData.id, `Copia di ${styleData.name}`, styleData.tenant_id);
            showToast({ message: "Stile duplicato con successo.", type: "success" });
            navigate(`/business/${currentTenantId}/styles/${copy.id}`);
        } catch {
            showToast({ message: "Impossibile duplicare lo stile.", type: "error" });
        } finally {
            setIsDuplicating(false);
        }
    }, [styleData, currentTenantId, showToast, navigate]);

    const breadcrumbItems = useMemo(() => [
        { label: "Stili", to: `/business/${currentTenantId}/styles` },
        { label: styleData?.name || "Stile" }
    ], [currentTenantId, styleData?.name]);

    useBreadcrumbItems(breadcrumbItems);

    // Testata: il Salva della bozza per chi modifica; «Duplica e
    // personalizza» sullo stile di sistema per chi può creare stili.
    const canDuplicateSystem = isSystem && canWrite && canEdit;
    const actions = useMemo(() => {
        if (canDuplicateSystem) {
            return (
                <Button variant="primary" loading={isDuplicating} onClick={handleDuplicateAndEdit}>
                    Duplica e personalizza
                </Button>
            );
        }
        if (readOnly || !styleData) return undefined;
        return (
            <HeaderSaveAction
                isDirty={isDirty}
                isSaving={isSaving}
                onSave={() => void handleSave()}
                onDiscard={handleDiscard}
            />
        );
    }, [canDuplicateSystem, isDuplicating, handleDuplicateAndEdit, readOnly, styleData, isDirty, isSaving, handleSave, handleDiscard]);

    const headerCompact = useMemo<PageHeaderCompactConfig>(() => {
        if (canDuplicateSystem) {
            return { primaryAction: { label: "Duplica e personalizza", onClick: handleDuplicateAndEdit } };
        }
        if (readOnly || !styleData) return {};
        return buildSaveActionCompactConfig({
            isDirty,
            isSaving,
            onSave: () => void handleSave(),
            onRequestDiscard: () => setConfirmDiscardOpen(true)
        });
    }, [canDuplicateSystem, handleDuplicateAndEdit, readOnly, styleData, isDirty, isSaving, handleSave]);

    usePageHeader({ actions, compact: headerCompact });

    if (permissions != null && !canRead) {
        return <PageGate readPermission="styles.read">{() => null}</PageGate>;
    }

    if (isLoading) {
        // Stessa sagoma della pagina: l'anteprima e il pannello.
        return (
            <section className={styles.container} aria-busy="true" aria-label="Caricamento">
                <div className={styles.editorLayout}>
                    <div className={styles.canvasCol}>
                        <Skeleton height="100%" />
                    </div>
                    <div className={styles.skeletonPanel}>
                        <Skeleton height="100%" />
                    </div>
                </div>
            </section>
        );
    }

    if (loadError) {
        return (
            <EmptyState
                variant="page"
                icon={<IconPalette />}
                title="Non è stato possibile caricare lo stile"
                description="Controlla la connessione e riprova."
                action={
                    <Button variant="secondary" onClick={() => styleId && loadStyle(styleId)}>
                        Riprova
                    </Button>
                }
            />
        );
    }

    if (!styleData) {
        return (
            <EmptyState
                variant="page"
                icon={<IconPalette />}
                title="Stile non trovato"
                description="Lo stile che cerchi non esiste o è stato eliminato."
                action={
                    <Button onClick={() => navigate(`/business/${currentTenantId}/styles`)}>
                        Torna a Stili
                    </Button>
                }
            />
        );
    }

    const banner = isSystem
        ? canDuplicateSystem
            ? "Stile di sistema: non si modifica. «Duplica e personalizza» ne fa uno tuo."
            : "Stile di sistema: non si modifica."
        : !canWrite
          ? "Sola lettura: per modificare gli stili serve un ruolo di amministratore."
          : !canEdit
            ? "Sola lettura: l'abbonamento non è attivo."
            : null;

    return (
        <section className={styles.container}>
            <div className={styles.editorLayout}>

                {/* ── Colonna sinistra: canvas (solo preview) ── */}
                <div className={styles.canvasCol}>
                    <div className={styles.canvasArea}>
                        {/* Maniglia di riapertura sul bordo destro. Compare dopo che
                            il pannello è uscito (delay in entrata). Logica invariata. */}
                        <AnimatePresence>
                            {!isPanelOpen && (
                                <motion.button
                                    type="button"
                                    className={styles.panelHandle}
                                    onClick={() => setIsPanelOpen(true)}
                                    aria-label="Apri proprietà stile"
                                    initial={reduce ? { opacity: 0 } : { opacity: 0, x: 14 }}
                                    animate={
                                        reduce
                                            ? { opacity: 1, transition: { duration: 0 } }
                                            : { opacity: 1, x: 0, transition: { duration: 0.28, delay: 0.12, ease: [0.22, 1, 0.36, 1] } }
                                    }
                                    exit={
                                        reduce
                                            ? { opacity: 0, transition: { duration: 0 } }
                                            : { opacity: 0, x: 14, transition: { duration: 0.16 } }
                                    }
                                >
                                    <IconLayoutSidebarRightExpand size={16} />
                                    <Text as="span" variant="caption" weight={600} className={styles.panelHandleLabel}>Proprietà</Text>
                                </motion.button>
                            )}
                        </AnimatePresence>

                        <StylePreview
                            model={versioning.previewOverrideTokens ?? tokenModel}
                            viewMode={viewMode}
                            isTransitioning={isViewTransitioning}
                        />
                    </div>
                </div>

                {/* ── Colonna destra: drawer proprietà (animato) ── */}
                <AnimatePresence initial={false}>
                {isPanelOpen && (
                    <motion.aside
                        className={styles.propertiesPanel}
                        initial={{ width: 0 }}
                        animate={{ width: PANEL_WIDTH }}
                        exit={{ width: 0 }}
                        transition={reduce ? { duration: 0 } : { duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
                    >
                    <div className={styles.propertiesPanelInner}>

                        {/* Header strip: titolo + comprimi (sostituisce la X isolata) */}
                        <div className={styles.panelTitleRow}>
                            <Text variant="body" weight={700}>Proprietà stile</Text>
                            <button
                                type="button"
                                className={styles.panelCloseBtn}
                                onClick={() => setIsPanelOpen(false)}
                                aria-label="Comprimi pannello"
                            >
                                <IconLayoutSidebarRightCollapse size={16} />
                            </button>
                        </div>

                        {/* Toggle anteprima Mobile/Desktop — zona fissa sotto l'header. */}
                        <div className={styles.panelToggleRow}>
                            <SegmentedControl<ViewMode>
                                value={viewMode}
                                onChange={handleViewModeChange}
                                options={[
                                    { value: "mobile", icon: <IconDeviceMobile size={16} />, label: "Mobile" },
                                    { value: "desktop", icon: <IconDeviceDesktop size={16} />, label: "Desktop" },
                                ]}
                            />
                        </div>

                        {/* Controllo versione — zona fissa sotto l'header. Gli stili di
                            sistema non hanno versioni da sfogliare. */}
                        {!isSystem && (
                            <div className={styles.versionZone}>
                                <button
                                    ref={versionAnchorRef}
                                    type="button"
                                    className={styles.versionControl}
                                    onClick={versioning.handleVersionClick}
                                >
                                    <span className={styles.versionIcon}>
                                        <IconHistory size={16} />
                                    </span>
                                    <span className={styles.versionMeta}>
                                        <Text variant="body-sm" weight={700}>
                                            Versione {styleData.current_version?.version || "N/A"}
                                        </Text>
                                        <Text variant="caption-xs" colorVariant="muted">
                                            Aggiornata {new Date(styleData.updated_at).toLocaleString("it-IT")}
                                        </Text>
                                    </span>
                                    <IconChevronDown
                                        size={15}
                                        className={`${styles.versionChevron} ${versioning.isVersionsOpen ? styles.versionChevronOpen : ""}`}
                                    />
                                </button>
                                {versioning.isVersionsOpen && (
                                    <StyleVersionsPopover
                                        versions={versioning.versions}
                                        isLoading={versioning.isVersionsLoading}
                                        currentVersionId={styleData.current_version_id}
                                        selectedVersionId={versioning.selectedVersionId}
                                        isRollingBack={versioning.isRollingBack}
                                        onSelectVersion={versioning.handleVersionSelect}
                                        onRollback={versioning.handleVersionRollback}
                                        readOnly={readOnly}
                                        onClose={versioning.handleVersionClose}
                                        anchorEl={versionAnchorRef.current}
                                    />
                                )}
                            </div>
                        )}

                        {/* Contenuto scrollabile: lo stesso pannello per tutti, spento
                            per chi non lo modifica (§50.11/3). */}
                        <div className={styles.panelContent}>
                            {banner && permissions != null && (
                                <InlineBanner variant="info">{banner}</InlineBanner>
                            )}
                            <form id="style-form" onSubmit={handleSubmit}>
                                <fieldset className={`${styles.panelForm} ${styles.readOnlyScope}`} disabled={readOnly}>
                                    <TextInput
                                        label="Nome stile"
                                        required
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        placeholder="Es: Dark Theme, Summer Vibes..."
                                    />
                                    <StylePropertiesPanel
                                        model={tokenModel}
                                        onChange={setTokenModel}
                                    />
                                </fieldset>
                            </form>
                        </div>
                    </div>
                    </motion.aside>
                )}
                </AnimatePresence>

            </div>

            <ConfirmDialog
                isOpen={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                onConfirm={doSave}
                title="Stile in uso"
                message={saveWarning ?? ""}
                confirmLabel="Salva comunque"
                confirmVariant="primary"
            />

            <DiscardChangesConfirmDialog
                isOpen={confirmDiscardOpen}
                onClose={() => setConfirmDiscardOpen(false)}
                onDiscard={handleDiscard}
            />
        </section>
    );
}
