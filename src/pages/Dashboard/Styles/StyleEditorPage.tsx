import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTenantId } from "@/context/useTenantId";
import Breadcrumb from "@/components/ui/Breadcrumb/Breadcrumb";
import { Button } from "@/components/ui/Button/Button";
import { TextInput } from "@/components/ui/Input/TextInput";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { IconLayoutSidebarRightCollapse, IconX, IconChevronDown } from "@tabler/icons-react";
import {
    getStyle,
    updateStyle,
    duplicateStyle,
    V2Style
} from "@/services/supabase/styles";
import { StylePreview } from "./Editor/StylePreview";
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

export default function StyleEditorPage() {
    const { styleId } = useParams<{ styleId: string }>();
    const navigate = useNavigate();
    const currentTenantId = useTenantId();
    const { showToast } = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isDuplicating, setIsDuplicating] = useState(false);
    const [isPanelOpen, setIsPanelOpen] = useState(true);

    const [styleData, setStyleData] = useState<V2Style | null>(null);
    const [name, setName] = useState("");
    const [tokenModel, setTokenModel] = useState<StyleTokenModel>(DEFAULT_STYLE_TOKENS);
    const [originalTokens, setOriginalTokens] = useState<StyleTokenModel>(DEFAULT_STYLE_TOKENS);

    const isDirty =
        name !== styleData?.name || JSON.stringify(tokenModel) !== JSON.stringify(originalTokens);
    const isSystem = Boolean(styleData?.is_system);

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
        if (!styleId) {
            navigate(`/business/${currentTenantId}/styles`);
            return;
        }
        loadStyle(styleId);
    }, [styleId]); // eslint-disable-line react-hooks/exhaustive-deps

    const onRollbackComplete = useCallback(async () => {
        if (styleId) await loadStyle(styleId);
    }, [styleId, loadStyle]);

    const versioning = useStyleVersioning({
        styleId,
        tenantId: styleData?.tenant_id,
        onRollbackComplete
    });

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
            const config = serializeTokens(tokenModel);
            setIsSaving(true);
            try {
                await updateStyle(styleData.id, name, config, styleData.tenant_id);
                showToast({ message: "Stile aggiornato (nuova versione creata).", type: "success" });
                setOriginalTokens(parseTokens(config));
                versioning.invalidate();
                const refreshed = await getStyle(styleData.id, styleData.tenant_id);
                if (refreshed) setStyleData(refreshed);
            } catch {
                showToast({ message: "Impossibile salvare lo stile.", type: "error" });
            } finally {
                setIsSaving(false);
            }
        },
        [name, tokenModel, styleData, currentTenantId, showToast, navigate, versioning.invalidate]
    );

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

    const breadcrumbItems = [
        { label: "Stili", to: `/business/${currentTenantId}/styles` },
        { label: name || "Stile" }
    ];

    if (isLoading) {
        return (
            <section className={styles.container}>
                <div className={styles.editorLayout}>
                    <div className={styles.canvasCol}>
                        <div className={styles.canvasBreadcrumb}>
                            <Breadcrumb items={[{ label: "Stili" }, { label: "…" }]} />
                        </div>
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section className={styles.container}>
            <div className={styles.editorLayout}>

                {/* ── Colonna sinistra: canvas ── */}
                <div className={styles.canvasCol}>
                    <div className={styles.canvasBreadcrumb}>
                        <Breadcrumb items={breadcrumbItems} />
                    </div>
                    <div className={styles.canvasArea}>
                        {!isPanelOpen && (
                            <button
                                type="button"
                                className={styles.togglePanelBtn}
                                onClick={() => setIsPanelOpen(true)}
                            >
                                <IconLayoutSidebarRightCollapse size={15} />
                                Proprietà
                            </button>
                        )}
                        <StylePreview model={versioning.previewOverrideTokens ?? tokenModel} />
                    </div>
                </div>

                {/* ── Colonna destra: pannello proprietà ── */}
                {isPanelOpen && (
                    <div className={styles.propertiesPanel}>

                        {/* Header sticky */}
                        <div className={styles.panelHeader}>
                            <div className={styles.panelTitleRow}>
                                <span className={styles.panelTitle}>Proprietà stile</span>
                                <button
                                    type="button"
                                    className={styles.panelCloseBtn}
                                    onClick={() => setIsPanelOpen(false)}
                                >
                                    <IconX size={15} />
                                </button>
                            </div>

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

                        {/* Contenuto scrollabile */}
                        <div className={styles.panelContent}>
                            {!isSystem && styleData && (
                                <div className={styles.versionInfoWrapper}>
                                    <div className={styles.versionInfo}>
                                        <button
                                            type="button"
                                            className={styles.versionTrigger}
                                            onClick={versioning.handleVersionClick}
                                        >
                                            <Text
                                                variant="body-sm"
                                                weight={600}
                                                colorVariant="primary"
                                            >
                                                Versione:{" "}
                                                {styleData.current_version?.version || "N/A"}
                                            </Text>
                                            <IconChevronDown
                                                size={13}
                                                className={`${styles.versionChevron} ${versioning.isVersionsOpen ? styles.versionChevronOpen : ""}`}
                                            />
                                        </button>
                                        <Text variant="caption" colorVariant="muted">
                                            Aggiornato:{" "}
                                            {new Date(styleData.updated_at).toLocaleString(
                                                "it-IT"
                                            )}
                                        </Text>
                                    </div>
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
                                        />
                                    )}
                                </div>
                            )}

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
                    </div>
                )}

            </div>
        </section>
    );
}
