import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams, useParams, useNavigate } from "react-router-dom";
import { IconLoader2 } from "@tabler/icons-react";
import { Button } from "@/components/ui";
import Breadcrumb from "@/components/ui/Breadcrumb/Breadcrumb";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { SuspendActivityDialog } from "./components/SuspendActivityDialog";
import { ActivityInfoTab } from "./tabs/ActivityInfoTab";
import { ActivityMediaTab } from "./tabs/ActivityMediaTab";
import { ActivityHoursServicesTab } from "./tabs/ActivityHoursServicesTab";
import { ActivityAccessControlTab } from "./tabs/ActivityAccessControlTab";
import {
    getActivityById,
    getActivityCount,
    updateActivity,
    deleteActivityAtomic
} from "@/services/supabase/activities";
import { getGroupsForActivity } from "@/services/supabase/activity-groups";
import { V2Activity } from "@/types/activity";
import { V2ActivityGroup } from "@/types/activity-group";
import { useToast } from "@/context/Toast/ToastContext";
import styles from "./ActivityDetailPage.module.scss";

const ActivityDetailPage: React.FC = () => {
    const { activityId, businessId } = useParams<{ activityId: string; businessId: string }>();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [searchParams, setSearchParams] = useSearchParams();

    const activeTab = (searchParams.get("tab") || "info") as
        | "info"
        | "media"
        | "hours-services"
        | "access-control";

    const setActiveTab = (tab: string) => {
        setSearchParams(prev => {
            prev.set("tab", tab);
            return prev;
        });
    };

    const [activity, setActivity] = useState<V2Activity | null>(null);
    const [groups, setGroups] = useState<V2ActivityGroup[]>([]);
    const [activityCount, setActivityCount] = useState(0);
    const [loading, setLoading] = useState(true);

    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [isSuspendOpen, setIsSuspendOpen] = useState(false);

    const fetchData = useCallback(async () => {
        if (!activityId) return;
        try {
            setLoading(true);
            const [activityData, groupsData, count] = await Promise.all([
                getActivityById(activityId, businessId!),
                getGroupsForActivity(activityId, businessId!),
                getActivityCount(businessId!)
            ]);

            if (activityData) {
                setActivity(activityData);
                setGroups(groupsData.filter(g => !g.is_system));
            }
            setActivityCount(count);
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

    const handleToggleStatus = useCallback(() => {
        if (!activity) return;
        if (activity.status === "active") {
            setIsSuspendOpen(true);
        } else {
            // Riattivazione diretta
            (async () => {
                try {
                    await updateActivity(activity.id, businessId!, {
                        status: "active",
                        inactive_reason: null
                    });
                    await fetchData();
                    showToast({ message: "Sede riattivata con successo.", type: "success" });
                } catch {
                    showToast({
                        message: "Impossibile riattivare la sede.",
                        type: "error"
                    });
                }
            })();
        }
    }, [activity, businessId, fetchData, showToast]);

    const handleSuspendConfirm = useCallback(
        async (reason: "maintenance" | "closed" | "unavailable"): Promise<boolean> => {
            if (!activity) return false;
            try {
                await updateActivity(activity.id, businessId!, {
                    status: "inactive",
                    inactive_reason: reason
                });
                await fetchData();
                showToast({ message: "Sede sospesa.", type: "success" });
                return true;
            } catch {
                showToast({
                    message: "Impossibile sospendere la sede.",
                    type: "error"
                });
                return false;
            }
        },
        [activity, businessId, fetchData, showToast]
    );

    const handleDeleteActivity = useCallback(async (): Promise<boolean> => {
        if (!activity) return false;
        try {
            await deleteActivityAtomic(activity.id);
            showToast({ message: "Sede eliminata con successo.", type: "success" });
            navigate(`/business/${businessId}/locations`);
            return true;
        } catch {
            showToast({ message: "Errore durante l'eliminazione della sede.", type: "error" });
            return false;
        }
    }, [activity, businessId, navigate, showToast]);

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
                        <Tabs.Tab value="hours-services">Orari & Servizi</Tabs.Tab>
                        <Tabs.Tab value="access-control">Accesso & Controllo</Tabs.Tab>
                    </Tabs.List>

                    <div style={{ marginTop: "24px" }}>
                        <Tabs.Panel value="info">
                            <ActivityInfoTab
                                activity={activity}
                                groups={groups}
                                publicUrl={publicUrl}
                                showGroups={activityCount > 1}
                                onNavigateToGroups={() =>
                                    navigate(
                                        `/business/${businessId}/locations?tab=groups&highlight=${activity.id}`
                                    )
                                }
                                onReload={fetchData}
                            />
                        </Tabs.Panel>

                        <Tabs.Panel value="media">
                            <ActivityMediaTab
                                activity={activity}
                                onCoverUpdate={url =>
                                    setActivity(a => (a ? { ...a, cover_image: url } : a))
                                }
                            />
                        </Tabs.Panel>

                        <Tabs.Panel value="hours-services">
                            <ActivityHoursServicesTab
                                activity={activity}
                                tenantId={businessId!}
                                onReload={fetchData}
                            />
                        </Tabs.Panel>

                        <Tabs.Panel value="access-control">
                            <ActivityAccessControlTab
                                activity={activity}
                                publicUrl={publicUrl}
                                tenantId={businessId!}
                                onToggleStatus={handleToggleStatus}
                                onDeleteRequest={() => setIsDeleteOpen(true)}
                                onReload={fetchData}
                            />
                        </Tabs.Panel>
                    </div>
                </Tabs>
            </div>

            <ConfirmDialog
                isOpen={isDeleteOpen}
                onClose={() => setIsDeleteOpen(false)}
                title="Elimina sede"
                message="Questa azione è irreversibile. La sede e tutte le configurazioni associate verranno eliminate definitivamente."
                confirmLabel="Elimina"
                onConfirm={handleDeleteActivity}
            />

            <SuspendActivityDialog
                isOpen={isSuspendOpen}
                onClose={() => setIsSuspendOpen(false)}
                onConfirm={handleSuspendConfirm}
            />
        </div>
    );
};

export default ActivityDetailPage;
