import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams, useParams, useNavigate } from "react-router-dom";
import { IconLoader2 } from "@tabler/icons-react";
import { Button } from "@/components/ui";
import { useBreadcrumbItems } from "@/context/useBreadcrumbItems";
import { usePageHeader } from "@/context/usePageHeader";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { ActivityProfileTab } from "./tabs/ActivityProfileTab";
import { ActivityAvailabilityTab } from "./tabs/ActivityAvailabilityTab";
import { ActivitySettingsTab } from "./tabs/ActivitySettingsTab";
import { TablesManagement } from "@/components/Tables/TablesManagement/TablesManagement";
import { TablesEmptyState } from "@/components/Tables/TablesManagement/TablesEmptyState";
import { PageGate } from "@/components/PageGate/PageGate";
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

    const handleTabChange = useCallback((next: TabValue) => {
        setSearchParams(prev => {
            prev.set("tab", next);
            return prev;
        });
    }, [setSearchParams]);

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

    // ── Header band: solo leading (tab line controllati). Lo stato sede
    // (Pubblicata/Sospesa) è già visibile in lista Sedi (overlay card +
    // colonna tabella) e nella tab Impostazioni: niente badge nella banda. ──
    const leading = useMemo(() => (
        <Tabs<TabValue> value={activeTab} onChange={handleTabChange} variant="line">
            <Tabs.List>
                <Tabs.Tab value="profile">Profilo</Tabs.Tab>
                <Tabs.Tab value="availability">Disponibilità</Tabs.Tab>
                <Tabs.Tab value="tables">Tavoli</Tabs.Tab>
                <Tabs.Tab value="settings">Impostazioni</Tabs.Tab>
            </Tabs.List>
        </Tabs>
    ), [activeTab, handleTabChange]);

    usePageHeader({
        leading,
        sticky: true,
    });

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
                {activeTab === "profile" && (
                    <ActivityProfileTab
                        activity={activity}
                        tenantId={businessId!}
                        onReload={fetchData}
                    />
                )}
                {activeTab === "availability" && (
                    <ActivityAvailabilityTab
                        activity={activity}
                        tenantId={businessId!}
                        onReload={fetchData}
                    />
                )}
                {activeTab === "tables" && (
                    <PageGate readPermission="tables.read" activityId={activity.id}>
                        {() => (
                            activity.ordering_enabled ? (
                                <TablesManagement
                                    tenantId={businessId!}
                                    activityId={activity.id}
                                    orderingEnabled={true}
                                />
                            ) : (
                                <TablesEmptyState
                                    onGoToSettings={() => handleTabChange("settings")}
                                />
                            )
                        )}
                    </PageGate>
                )}
                {activeTab === "settings" && (
                    <ActivitySettingsTab
                        activity={activity}
                        tenantId={businessId!}
                        onReload={fetchData}
                    />
                )}
            </div>
        </div>
    );
};

export default ActivityDetailPage;
