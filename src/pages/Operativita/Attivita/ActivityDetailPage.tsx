import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams, useParams, useNavigate } from "react-router-dom";
import { IconLoader2 } from "@tabler/icons-react";
import { Button } from "@/components/ui";
import { useBreadcrumbItems } from "@/context/useBreadcrumbItems";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { ActivityProfileTab } from "./tabs/ActivityProfileTab";
import { ActivityAvailabilityTab } from "./tabs/ActivityAvailabilityTab";
import { ActivitySettingsTab } from "./tabs/ActivitySettingsTab";
import { TablesManagement } from "@/components/Tables/TablesManagement/TablesManagement";
import { TablesEmptyState } from "@/components/Tables/TablesManagement/TablesEmptyState";
import { getActivityById } from "@/services/supabase/activities";
import { V2Activity } from "@/types/activity";
import { useToast } from "@/context/Toast/ToastContext";
import styles from "./ActivityDetailPage.module.scss";

type TabValue = "profile" | "availability" | "tables" | "settings";

const LEGACY_TAB_MAP: Record<string, TabValue> = {
    info: "profile",
    media: "profile",
    "hours-services": "settings",
    "access-control": "settings"
};

const isTabValue = (v: string): v is TabValue =>
    v === "profile" || v === "availability" || v === "tables" || v === "settings";

const ActivityDetailPage: React.FC = () => {
    const { activityId, businessId } = useParams<{ activityId: string; businessId: string }>();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [searchParams, setSearchParams] = useSearchParams();

    // Normalize legacy tab params on first render
    useEffect(() => {
        const raw = searchParams.get("tab");
        if (raw && LEGACY_TAB_MAP[raw]) {
            setSearchParams(
                prev => {
                    prev.set("tab", LEGACY_TAB_MAP[raw]);
                    return prev;
                },
                { replace: true }
            );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const rawTab = searchParams.get("tab");
    const activeTab: TabValue =
        rawTab && isTabValue(rawTab)
            ? rawTab
            : rawTab && LEGACY_TAB_MAP[rawTab]
            ? LEGACY_TAB_MAP[rawTab]
            : "profile";

    const setActiveTab = (tab: string) => {
        setSearchParams(prev => {
            prev.set("tab", tab);
            return prev;
        });
    };

    const [activity, setActivity] = useState<V2Activity | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        if (!activityId || !businessId) return;
        try {
            setLoading(true);
            const activityData = await getActivityById(activityId, businessId);
            if (activityData) {
                setActivity(activityData);
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
    }, [activityId, businessId, showToast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const breadcrumbItems = useMemo(
        () => [
            { label: "Sedi", to: `/business/${businessId}/locations` },
            { label: activity?.name || "Dettaglio Sede" }
        ],
        [activity, businessId]
    );

    useBreadcrumbItems(breadcrumbItems);

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
                        <div className={styles.titleRow}>
                            <h1>{activity.name}</h1>
                            {activity.status === "active" ? (
                                <StatusBadge variant="success" label="Pubblicata" />
                            ) : (
                                <StatusBadge variant="neutral" label="Sospesa" />
                            )}
                        </div>
                    </div>
                </div>

                <Tabs value={activeTab} onChange={setActiveTab}>
                    <Tabs.List>
                        <Tabs.Tab value="profile">Profilo</Tabs.Tab>
                        <Tabs.Tab value="availability">Disponibilità</Tabs.Tab>
                        <Tabs.Tab value="tables">Tavoli</Tabs.Tab>
                        <Tabs.Tab value="settings">Impostazioni</Tabs.Tab>
                    </Tabs.List>

                    <div style={{ marginTop: "24px" }}>
                        <Tabs.Panel value="profile">
                            <ActivityProfileTab
                                activity={activity}
                                tenantId={businessId!}
                                onReload={fetchData}
                            />
                        </Tabs.Panel>

                        <Tabs.Panel value="availability">
                            <ActivityAvailabilityTab
                                activity={activity}
                                tenantId={businessId!}
                                onReload={fetchData}
                            />
                        </Tabs.Panel>

                        <Tabs.Panel value="tables">
                            {activity.ordering_enabled ? (
                                <TablesManagement
                                    tenantId={businessId!}
                                    activityId={activity.id}
                                    orderingEnabled={true}
                                />
                            ) : (
                                <TablesEmptyState
                                    onGoToSettings={() => setActiveTab("settings")}
                                />
                            )}
                        </Tabs.Panel>

                        <Tabs.Panel value="settings">
                            <ActivitySettingsTab
                                activity={activity}
                                tenantId={businessId!}
                                onReload={fetchData}
                            />
                        </Tabs.Panel>
                    </div>
                </Tabs>
            </div>
        </div>
    );
};

export default ActivityDetailPage;
