import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTenantId } from "@/context/useTenantId";
import { useBreadcrumbItems } from "@/context/useBreadcrumbItems";
import { Button } from "@/components/ui/Button/Button";
import { TextInput } from "@/components/ui/Input/TextInput";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { IconLayoutSidebarRightCollapse, IconLayoutSidebarRightExpand, IconChevronDown, IconDeviceMobile, IconDeviceDesktop, IconHistory } from "@tabler/icons-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
    getStyle,
    updateStyle,
    duplicateStyle,
    getStyleUsageCount,
    V2Style
} from "@/services/supabase/styles";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { StylePreview, type ViewMode } from "./Editor/StylePreview";
import { SegmentedControl } from "@components/ui/SegmentedControl/SegmentedControl";
import { StylePropertiesPanel } from "./Editor/StylePropertiesPanel";
import { StylePropertiesReadOnly } from "./Editor/StylePropertiesReadOnly";
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

// Larghezza del drawer Proprietà. Single source: framer anima questa width
// (0 ↔ PANEL_WIDTH); l'inner è fissato a PANEL_WIDTH così non reflowa durante
// l'animazione. Allineato a `.propertiesPanelInner { width }` nel SCSS.
const PANEL_WIDTH = 360;

export default function StyleEditorPage() {
    const { styleId } = useParams<{ styleId: string }>();
    const navigate = useNavigate();
    const currentTenantId = useTenantId();
    const { showToast } = useToast();

    const [isLoading, setIsLoading] = useState(true);
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
    const [pendingUsageCount, setPendingUsageCount] = useState(0);
    const [skipConfirmChecked, setSkipConfirmChecked] = useState(false);

    const isDirty =
        name !== styleData?.name || JSON.stringify(tokenModel) !== JSON.stringify(originalTokens);
    const isSystem = Boolean(styleData?.is_system);

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
                const data = await getStyle(id, currentTenantId!);
                if (data) {
                    setStyleData(data);
                    setName(data.name);
                    try {
                        const parsed = parseTokens(data.current_version?.config ?? {});
                        setTokenModel(parsed);
                        setOriginalTokens(parsed);
                    } catch {
                        setTokenModel(DEFAULT_STYLE_TOKENS);
                        setOriginalTokens(DEFAULT_STYLE_TOKENS);
                    }
                } else {
                    showToast({ message: "Stile non trovato.", type: "error" });
                    navigate(`/business/${currentTenantId}/styles`);
                }
            } catch {
                showToast({ message: "Errore nel caricamento dello stile.", type: "error" });
            } finally {
                setIsLoading(false);
            }
        },
        [currentTenantId, showToast, navigate]
    );

    useEffect(() => {
        if (!currentTenantId || !styleId) return;
        loadStyle(styleId);
    }, [currentTenantId, styleId, loadStyle]);

    const onRollbackComplete = useCallback(async () => {
        if (styleId) await loadStyle(styleId);
    }, [styleId, loadStyle]);

    const versioning = useStyleVersioning({
        styleId,
        tenantId: styleData?.tenant_id,
        onRollbackComplete
    });

    const doSave = useCallback(async (): Promise<boolean> => {
        if (!styleData) return false;
        const config = serializeTokens(tokenModel);
        setIsSaving(true);
        try {
            await updateStyle(styleData.id, name, config, styleData.tenant_id);
            showToast({ message: "Stile aggiornato (nuova versione creata).", type: "success" });
            setOriginalTokens(parseTokens(config));
            versioning.invalidate();
            const refreshed = await getStyle(styleData.id, styleData.tenant_id);
            if (refreshed) setStyleData(refreshed);
            return true;
        } catch {
            showToast({ message: "Impossibile salvare lo stile.", type: "error" });
            return false;
        } finally {
            setIsSaving(false);
        }
    }, [name, tokenModel, styleData, showToast, versioning.invalidate]);

    const handleSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (!name.trim()) {
                showToast({ message: "Il nome dello stile è obbligatorio.", type: "error" });
                return;
            }
            if (!styleData) {
                navigate(`/business/${currentTenantId}/styles`);
                return;
            }

            const skipKey = `cataloglobe-style-skip-confirm-${styleData.id}`;
            if (localStorage.getItem(skipKey)) {
                await doSave();
                return;
            }

            setIsSaving(true);
            let count = 0;
            try {
                count = await getStyleUsageCount(styleData.id, styleData.tenant_id);
            } catch {
                showToast({ message: "Impossibile salvare lo stile.", type: "error" });
                setIsSaving(false);
                return;
            }
            setIsSaving(false);

            if (count > 0) {
                setPendingUsageCount(count);
                setSkipConfirmChecked(false);
                setIsConfirmOpen(true);
                return;
            }

            await doSave();
        },
        [name, styleData, currentTenantId, showToast, navigate, doSave]
    );

    const handleConfirmSave = useCallback(async (): Promise<boolean> => {
        const ok = await doSave();
        if (ok && skipConfirmChecked && styleData) {
            localStorage.setItem(`cataloglobe-style-skip-confirm-${styleData.id}`, "true");
        }
        return ok;
    }, [doSave, skipConfirmChecked, styleData]);

    const handleConfirmClose = useCallback(() => {
        setIsConfirmOpen(false);
        setSkipConfirmChecked(false);
    }, []);

    const handleReset = useCallback(() => {
        setTokenModel(originalTokens);
        setName(styleData?.name ?? "");
    }, [originalTokens, styleData]);

    const handleDuplicateAndEdit = useCallback(async () => {
        if (!styleData) return;
        setIsDuplicating(true);
        try {
            const copy = await duplicateStyle(
                styleData.id,
                `Copia di ${styleData.name}`,
                styleData.tenant_id
            );
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
        { label: name || "Stile" }
    ], [currentTenantId, name]);

    useBreadcrumbItems(breadcrumbItems);

    if (isLoading) {
        return (
            <section className={styles.container}>
                <div className={styles.editorLayout}>
                    <div className={styles.canvasCol}>
                        <div className={styles.canvasArea} />
                    </div>
                </div>
            </section>
        );
    }

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
                                    <span className={styles.panelHandleLabel}>Proprietà</span>
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
                    <div className={styles.propertiesPanelInner} style={{ width: PANEL_WIDTH }}>

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

                        {/* Toggle anteprima Mobile/Desktop — zona fissa sotto l'header.
                            Stesso setter/stato di prima (handleViewModeChange / viewMode). */}
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

                        {/* Controllo versione prominente — zona fissa sotto l'header.
                            Stessa visibilità condizionale di prima (solo editing). */}
                        {!isSystem && styleData && (
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
                                        <Text variant="caption" colorVariant="muted">
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
                                        onClose={versioning.handleVersionClose}
                                        anchorEl={versionAnchorRef.current}
                                    />
                                )}
                            </div>
                        )}

                        {/* Contenuto scrollabile */}
                        <div className={styles.panelContent}>
                            {isSystem ? (
                                <div className={styles.panelForm}>
                                    <Text variant="body-sm" weight={600}>
                                        {name}
                                    </Text>
                                    <StylePropertiesReadOnly model={tokenModel} />
                                </div>
                            ) : (
                                <form
                                    id="style-form"
                                    className={styles.panelForm}
                                    onSubmit={handleSubmit}
                                >
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
                                </form>
                            )}
                        </div>

                        {/* Footer sticky: azioni per ramo (stessa condizione/callback) */}
                        <div className={styles.panelFooter}>
                            {isSystem ? (
                                <div className={styles.systemHeaderActions}>
                                    <span className={styles.systemBadge}>Stile di sistema</span>
                                    <Button
                                        variant="primary"
                                        loading={isDuplicating}
                                        onClick={handleDuplicateAndEdit}
                                    >
                                        Duplica e personalizza
                                    </Button>
                                </div>
                            ) : (
                                <div className={styles.panelActions}>
                                    <Button
                                        variant="secondary"
                                        onClick={handleReset}
                                        disabled={!isDirty || isSaving}
                                    >
                                        Annulla
                                    </Button>
                                    <Button
                                        variant="primary"
                                        type="submit"
                                        form="style-form"
                                        loading={isSaving}
                                        disabled={!isDirty}
                                    >
                                        Salva
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                    </motion.aside>
                )}
                </AnimatePresence>

            </div>

            <ConfirmDialog
                isOpen={isConfirmOpen}
                onClose={handleConfirmClose}
                onConfirm={handleConfirmSave}
                title="Stile in uso"
                message={`Questo stile è attualmente utilizzato in ${pendingUsageCount} ${pendingUsageCount === 1 ? "regola" : "regole"}. Le modifiche saranno applicate immediatamente alle sedi che lo utilizzano.`}
                confirmLabel="Salva comunque"
                confirmVariant="primary"
            >
                <label className={styles.confirmCheckbox}>
                    <input
                        type="checkbox"
                        checked={skipConfirmChecked}
                        onChange={e => setSkipConfirmChecked(e.target.checked)}
                    />
                    Non chiedere più per questo stile
                </label>
            </ConfirmDialog>
        </section>
    );
}
