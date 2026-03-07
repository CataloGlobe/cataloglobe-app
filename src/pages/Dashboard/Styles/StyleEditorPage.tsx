import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Breadcrumb from "@/components/ui/Breadcrumb/Breadcrumb";
import { Button } from "@/components/ui/Button/Button";
import { useToast } from "@/context/Toast/ToastContext";
import { IconLayoutSidebarRightCollapse } from "@tabler/icons-react";
import { getStyle, updateStyle, V2Style } from "@/services/supabase/v2/styles";
import { StylePreview } from "./Editor/StylePreview";
import { StyleSettingsDrawer } from "./Editor/StyleSettingsDrawer";
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
    const { showToast } = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Layout State
    const [isDrawerOpen, setIsDrawerOpen] = useState(true);

    const [styleData, setStyleData] = useState<V2Style | null>(null);
    const [name, setName] = useState("");

    // UI Token Model State
    const [tokenModel, setTokenModel] = useState<StyleTokenModel>(DEFAULT_STYLE_TOKENS);
    const [originalTokens, setOriginalTokens] = useState<StyleTokenModel>(DEFAULT_STYLE_TOKENS);

    // Derived states
    const isDirty =
        name !== styleData?.name || JSON.stringify(tokenModel) !== JSON.stringify(originalTokens);

    // FASE 1 & FASE 5: Blocco Assoluto Scroll Globale
    useEffect(() => {
        const originalHtmlHeight = document.documentElement.style.height;
        const originalBodyHeight = document.body.style.height;
        const originalBodyOverflow = document.body.style.overflow;

        document.documentElement.style.height = "100%";
        document.body.style.height = "100%";
        document.body.style.overflow = "hidden"; // Forza nascondere lo scroll globale pagina

        // Return di cleanup quando si cambia pagina
        return () => {
            document.documentElement.style.height = originalHtmlHeight;
            document.body.style.height = originalBodyHeight;
            document.body.style.overflow = originalBodyOverflow;
        };
    }, []);

    useEffect(() => {
        if (!styleId) {
            navigate("/dashboard/stili");
            return;
        }
        loadStyle(styleId);
    }, [styleId]);

    const loadStyle = async (id: string) => {
        try {
            setIsLoading(true);
            const data = await getStyle(id);
            if (data) {
                setStyleData(data);
                setName(data.name);

                try {
                    const cfg = data.current_version?.config || {};
                    const parsedTokens = parseTokens(cfg);
                    setTokenModel(parsedTokens);
                    setOriginalTokens(parsedTokens);
                } catch {
                    setTokenModel(DEFAULT_STYLE_TOKENS);
                    setOriginalTokens(DEFAULT_STYLE_TOKENS);
                }
            } else {
                showToast({ message: "Stile non trovato.", type: "error" });
                navigate("/dashboard/stili");
            }
        } catch (error) {
            console.error("Errore caricamento stile:", error);
            showToast({ message: "Errore nel caricamento dello stile.", type: "error" });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name.trim()) {
            showToast({ message: "Il nome dello stile è obbligatorio.", type: "error" });
            return;
        }

        const finalConfigToSave = serializeTokens(tokenModel);

        setIsSaving(true);
        try {
            if (styleData) {
                await updateStyle(styleData.id, name, finalConfigToSave, styleData.tenant_id);
                showToast({
                    message: "Stile aggiornato (nuova versione creata).",
                    type: "success"
                });

                // Reset isDirty state by updating original tokens to current ones
                setOriginalTokens(parseTokens(finalConfigToSave));
            } else {
                navigate("/dashboard/stili");
            }
        } catch (error) {
            console.error("Errore salvataggio stile:", error);
            showToast({ message: "Impossibile salvare lo stile.", type: "error" });
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <section className={styles.container}>
                <PageHeader title="Caricamento..." />
            </section>
        );
    }

    const breadcrumbItems = [
        { label: "Stili", to: "/dashboard/stili" },
        { label: name || "Modifica Stile" }
    ];

    const isSystemError = styleData?.is_system;

    return (
        <section
            className={styles.container}
            style={{
                height: "100dvh",
                maxHeight: "100%", // Evita di strabordare se il MainLayout taglia lo spazio con la Navbar
                display: "flex",
                flexDirection: "column",
                padding: 0,
                overflow: "hidden"
            }}
        >
            <div style={{ padding: "24px 24px 0 24px", flexShrink: 0 }}>
                <div style={{ marginBottom: "16px" }}>
                    <Breadcrumb items={breadcrumbItems} />
                </div>
                <PageHeader
                    title="Modifica Stile"
                    subtitle="Aggiorna i dettagli dello stile."
                    actions={
                        <div style={{ display: "flex", gap: "12px" }}>
                            <Button
                                variant="secondary"
                                onClick={() => {
                                    setTokenModel(originalTokens);
                                    setName(styleData?.name || "");
                                }}
                                disabled={!isDirty || isSaving}
                            >
                                Annulla
                            </Button>
                            <Button
                                variant="primary"
                                type="submit"
                                form="style-form"
                                loading={isSaving}
                                disabled={!isDirty || isSystemError}
                            >
                                Salva Modifiche
                            </Button>
                        </div>
                    }
                />
            </div>

            <div className={styles.editorLayout}>
                {/* CENTRAL CANVAS PREVIEW */}
                <div className={styles.canvasArea}>
                    {!isDrawerOpen && (
                        <button
                            className={styles.toggleDrawerBtn}
                            onClick={() => setIsDrawerOpen(true)}
                        >
                            <IconLayoutSidebarRightCollapse size={18} />
                            Proprietà Stile
                        </button>
                    )}
                    <StylePreview model={tokenModel} />
                </div>

                {/* RIGHT DRAWER SETTINGS */}
                <div className={styles.styleEditorPanelShell}>
                    <StyleSettingsDrawer
                        isOpen={isDrawerOpen}
                        onClose={() => setIsDrawerOpen(false)}
                        name={name}
                        setName={setName}
                        tokenModel={tokenModel}
                        setTokenModel={setTokenModel}
                        styleData={styleData}
                        isSystemError={isSystemError}
                        onSubmit={handleSubmit}
                    />
                </div>
            </div>
        </section>
    );
}
