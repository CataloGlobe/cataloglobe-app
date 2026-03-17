import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams, useParams, useNavigate } from "react-router-dom";
import { IconLoader2 } from "@tabler/icons-react";
import { Button, Card } from "@/components/ui";
import Breadcrumb from "@/components/ui/Breadcrumb/Breadcrumb";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { ActivityInfoTab } from "./tabs/ActivityInfoTab";
import { ActivityMediaTab } from "./tabs/ActivityMediaTab";
import { ActivityContactsTab } from "./tabs/ActivityContactsTab";
import { ActivitySettingsTab } from "./tabs/ActivitySettingsTab";
import { ActivityPublicAccessTab } from "./tabs/ActivityPublicAccessTab";
import {
    getActivityById,
    updateActivity,
    uploadActivityCover
} from "@/services/supabase/activities";
import { getGroupsForActivity } from "@/services/supabase/activity-groups";
import { V2Activity } from "@/types/activity";
import { V2ActivityGroup } from "@/types/activity-group";
import { useToast } from "@/context/Toast/ToastContext";
import styles from "./ActivityDetailPage.module.scss";

type SlugInlineState =
    | { type: "idle" }
    | { type: "warning" }
    | { type: "conflict"; suggestions: string[] };

const ActivityDetailPage: React.FC = () => {
    const { activityId, businessId } = useParams<{ activityId: string; businessId: string }>();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [searchParams, setSearchParams] = useSearchParams();

    const activeTab = (searchParams.get("tab") || "info") as
        | "info"
        | "media"
        | "contacts"
        | "settings"
        | "public";

    const setActiveTab = (tab: string) => {
        setSearchParams(prev => {
            prev.set("tab", tab);
            return prev;
        });
    };

    const [activity, setActivity] = useState<V2Activity | null>(null);
    const [groups, setGroups] = useState<V2ActivityGroup[]>([]);
    const [loading, setLoading] = useState(true);

    const [isUpdating, setIsUpdating] = useState(false);

    const fetchData = useCallback(async () => {
        if (!activityId) return;
        try {
            setLoading(true);
            const [activityData, groupsData] = await Promise.all([
                getActivityById(activityId, businessId!),
                getGroupsForActivity(activityId, businessId!)
            ]);

            if (activityData) {
                setActivity(activityData);
                setGroups(groupsData.filter(g => !g.is_system));
            }
        } catch (error) {
            console.error("Error fetching activity details:", error);
            showToast({
                message: "Impossibile caricare i dettagli della sede.",
                type: "error"
            });
        } finally {
            setLoading(false);
        }
    }, [activityId, showToast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const publicUrl = useMemo(() => {
        if (!activity) return "";
        const domain = import.meta.env.VITE_PUBLIC_DOMAIN || window.location.host;
        const protocol = window.location.protocol;
        return `${protocol}//${domain}/${activity.slug}`;
    }, [activity]);

    const copyToClipboard = () => {
        navigator.clipboard.writeText(publicUrl);
        showToast({
            message: "URL copiato negli appunti.",
            type: "success"
        });
    };

    const handleToggleStatus = async () => {
        if (!activity) return;
        const newStatus = activity.status === "active" ? "inactive" : "active";
        try {
            await updateActivity(activity.id, businessId!, { status: newStatus });
            setActivity({ ...activity, status: newStatus });
            showToast({
                message: `Sede impostata come ${newStatus === "active" ? "attiva" : "inattiva"}.`,
                type: "success"
            });
        } catch (error) {
            showToast({
                message: "Impossibile aggiornare lo stato della sede.",
                type: "error"
            });
        }
    };

    const handleSaveActivity = async (updates: Partial<V2Activity>) => {
        if (!activity) return;
        setIsUpdating(true);
        try {
            await updateActivity(activity.id, businessId!, updates);
            await fetchData();
            showToast({
                message: "Sede aggiornata con successo.",
                type: "success"
            });
        } catch (error) {
            showToast({
                message: "Impossibile aggiornare la sede.",
                type: "error"
            });
        } finally {
            setIsUpdating(false);
        }
    };

    const breadcrumbItems = useMemo(
        () => [
            { label: "Sedi", to: `/business/${businessId}/locations` },
            { label: activity?.name || "Dettaglio Sede" }
        ],
        [activity, businessId]
    );

    if (loading && !activity) {
        return (
            <div className={styles.container}>
                <div className={styles.loadingState}>
                    <IconLoader2 className="animate-spin" size={48} />
                    <p>Caricamento sede...</p>
                </div>
            </div>
        );
    }

    if (!activity) {
        return (
            <div className={styles.container}>
                <div className={styles.notFound}>
                    <h1>Sede non trovata</h1>
                    <p>La sede che stai cercando non esiste o è stata eliminata.</p>
                    <Button onClick={() => navigate(`/business/${businessId}/locations`)}>
                        Torna all'elenco
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.contentWrapper}>
                <div className={styles.header}>
                    <div className={styles.titleSection}>
                        <Breadcrumb items={breadcrumbItems} />
                        <h1>{activity.name}</h1>
                    </div>
                </div>

                <Tabs value={activeTab} onChange={setActiveTab}>
                    <Tabs.List>
                        <Tabs.Tab value="info">Informazioni</Tabs.Tab>
                        <Tabs.Tab value="media">Media</Tabs.Tab>
                        <Tabs.Tab value="contacts">Contatti</Tabs.Tab>
                        <Tabs.Tab value="settings">Impostazioni</Tabs.Tab>
                        <Tabs.Tab value="public">Accesso pubblico</Tabs.Tab>
                    </Tabs.List>

                    <div style={{ marginTop: "24px" }}>
                        <Tabs.Panel value="info">
                            <ActivityInfoTab
                                activity={activity}
                                groups={groups}
                                publicUrl={publicUrl}
                                onSave={handleSaveActivity}
                                isSaving={isUpdating}
                                onNavigateToGroups={() =>
                                    navigate(
                                        `/business/${businessId}/locations?tab=groups&highlight=${activity.id}`
                                    )
                                }
                                onCopyToClipboard={copyToClipboard}
                            />
                        </Tabs.Panel>

                        <Tabs.Panel value="media">
                            <ActivityMediaTab activity={activity} />
                        </Tabs.Panel>

                        <Tabs.Panel value="contacts">
                            <ActivityContactsTab activity={activity} />
                        </Tabs.Panel>

                        <Tabs.Panel value="settings">
                            <ActivitySettingsTab
                                activity={activity}
                                onToggleStatus={handleToggleStatus}
                            />
                        </Tabs.Panel>

                        <Tabs.Panel value="public">
                            <ActivityPublicAccessTab activity={activity} publicUrl={publicUrl} />
                        </Tabs.Panel>
                    </div>
                </Tabs>
            </div>
        </div>
    );
};

export default ActivityDetailPage;
