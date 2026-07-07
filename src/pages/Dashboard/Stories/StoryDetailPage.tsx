import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useBreadcrumbItems } from "@/context/useBreadcrumbItems";
import { usePageHeader } from "@/context/usePageHeader";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { useToast } from "@/context/Toast/ToastContext";
import { getStory, StoryWithProduct } from "@/services/supabase/stories";
import { useTenantId } from "@/context/useTenantId";
import { usePermissions } from "@/context/PermissionsContext";
import { canDoOnAnyActivity } from "@/lib/permissions";
import { PageGate } from "@/components/PageGate/PageGate";
import { StoryForm } from "./components/StoryForm";
import StoryDeleteDrawer from "./StoryDeleteDrawer";
import styles from "./Stories.module.scss";

const FORM_ID = "story-detail-form";

export default function StoryDetailPage() {
    const { storyId } = useParams<{ storyId: string }>();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const tenantId = useTenantId();
    const { permissions } = usePermissions();
    const canWrite = permissions ? canDoOnAnyActivity(permissions, "stories.write") : false;

    const [story, setStory] = useState<StoryWithProduct | null>(null);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);

    const refreshStory = useCallback(async () => {
        if (!tenantId || !storyId) return;
        try {
            const data = await getStory(storyId, tenantId);
            setStory(data);
        } catch (error) {
            console.error(error);
            showToast({ type: "error", message: "Errore durante il caricamento della storia." });
        }
    }, [tenantId, storyId, showToast]);

    useEffect(() => {
        setLoading(true);
        refreshStory().finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenantId, storyId]);

    const breadcrumbItems = [
        { label: "Storie", to: `/business/${tenantId}/stories` },
        { label: loading ? "Caricamento..." : story?.title || "Dettaglio" }
    ];
    useBreadcrumbItems(breadcrumbItems);

    const actions = canWrite ? (
        <Button variant="danger" onClick={() => setIsDeleteOpen(true)}>
            Elimina
        </Button>
    ) : undefined;

    usePageHeader({ actions, sticky: true });

    if (loading) {
        return (
            <div className={styles.wrapper}>
                <Text colorVariant="muted">Caricamento in corso...</Text>
            </div>
        );
    }

    if (!story) {
        return (
            <div className={styles.wrapper}>
                <Text variant="title-sm" colorVariant="error">
                    Storia non trovata.
                </Text>
                <Button variant="secondary" onClick={() => navigate(`/business/${tenantId}/stories`)}>
                    Torna alla lista
                </Button>
            </div>
        );
    }

    return (
        <PageGate readPermission="stories.read">
            {() => (
                <>
                    <div className={styles.wrapper}>
                        <div className={styles.brandPanel}>
                            <Text variant="title-sm" weight={600}>
                                Informazioni
                            </Text>

                            <StoryForm
                                formId={FORM_ID}
                                storyData={story}
                                tenantId={tenantId ?? ""}
                                canWrite={canWrite}
                                onSuccess={refreshStory}
                                onSavingChange={setIsSaving}
                            />

                            {canWrite && (
                                <div className={styles.brandPanelFooter}>
                                    <Button type="submit" form={FORM_ID} variant="primary" disabled={isSaving}>
                                        {isSaving ? "Salvataggio..." : "Salva modifiche"}
                                    </Button>
                                </div>
                            )}
                        </div>

                        <div className={styles.brandPanel}>
                            <Text variant="title-sm" weight={600}>
                                Contenuto
                            </Text>
                            <Text variant="body-sm" colorVariant="muted">
                                L'editor a blocchi (testo, foto, video) arriva in una prossima fase.
                            </Text>
                        </div>
                    </div>

                    <StoryDeleteDrawer
                        open={isDeleteOpen}
                        onClose={() => setIsDeleteOpen(false)}
                        storyData={story}
                        onSuccess={() => navigate(`/business/${tenantId}/stories`)}
                    />
                </>
            )}
        </PageGate>
    );
}
