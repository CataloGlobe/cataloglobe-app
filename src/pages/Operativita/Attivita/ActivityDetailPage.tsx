import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams, useParams, useNavigate } from "react-router-dom";
import { IconLoader2 } from "@tabler/icons-react";
import { Button } from "@/components/ui";
import { useBreadcrumbItems } from "@/context/useBreadcrumbItems";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { ActivityProfileTab } from "./tabs/ActivityProfileTab";
import { ActivityAvailabilityTab } from "./tabs/ActivityAvailabilityTab";
import { ActivitySettingsTab } from "./tabs/ActivitySettingsTab";
import { ActivityOrderingTab } from "./tabs/ActivityOrderingTab";
import { TablesManagement } from "@/components/Tables/TablesManagement/TablesManagement";
import { TablesEmptyState } from "@/components/Tables/TablesManagement/TablesEmptyState";
import { PageGate } from "@/components/PageGate/PageGate";
import { getActivityById } from "@/services/supabase/activities";
import { V2Activity } from "@/types/activity";
import { useToast } from "@/context/Toast/ToastContext";
import { usePermissions } from "@/context/PermissionsContext";
import { canDoOnActivity } from "@/lib/permissions";
import styles from "./ActivityDetailPage.module.scss";

// Ordine = sequenza in cui affrontarle (FASE 6). `availability` (visibilità
// prodotti per sede) resta col suo nome: la sua destinazione è ancora aperta.
type TabValue =
    | "profile"
    | "hours"
    | "sala"
    | "availability"
    | "ordering"
    | "reservations"
    | "settings";

const TAB_VALUES: readonly TabValue[] = [
    "profile",
    "hours",
    "sala",
    "availability",
    "ordering",
    "reservations",
    "settings"
];

const TAB_LABELS: Record<TabValue, string> = {
    profile: "Profilo",
    hours: "Orari",
    sala: "Sala",
    availability: "Disponibilità",
    ordering: "Ordinazioni",
    reservations: "Prenotazioni",
    settings: "Impostazioni"
};

const LEGACY_TAB_MAP: Record<string, TabValue> = {
    info: "profile",
    media: "profile",
    "hours-services": "settings",
    "access-control": "settings",
    tables: "sala"
};

const isTabValue = (v: string): v is TabValue =>
    (TAB_VALUES as readonly string[]).includes(v);

const ActivityDetailPage: React.FC = () => {
    const { activityId, businessId } = useParams<{ activityId: string; businessId: string }>();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { permissions } = usePermissions();
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

    const canManage = activityId && permissions
        ? canDoOnActivity(permissions, "activity.manage", activityId)
        : false;
    const canManageHours = activityId && permissions
        ? canDoOnActivity(permissions, "activity_hours.write", activityId)
        : false;

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
                {TAB_VALUES.map(value => (
                    <Tabs.Tab key={value} value={value}>{TAB_LABELS[value]}</Tabs.Tab>
                ))}
            </Tabs.List>
        </Tabs>
    ), [activeTab, handleTabChange]);

    // Solo sezioni: la pagina non ha azioni di banda (lo stato sede vive in
    // lista e nella tab Impostazioni, vedi sopra), quindi in compatto la riga
    // è il solo picker.
    const headerCompact = useMemo<PageHeaderCompactConfig>(() => ({
        sections: TAB_VALUES.map(value => ({ value, label: TAB_LABELS[value] })),
        activeSection: activeTab,
        onSectionChange: value => handleTabChange(value as TabValue)
    }), [activeTab, handleTabChange]);

    usePageHeader({
        leading,
        compact: headerCompact,
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
        <div className={styles.container} data-active-tab={activeTab}>
            <div className={styles.contentWrapper}>
                {activeTab === "profile" && (
                    <ActivityProfileTab
                        activity={activity}
                        tenantId={businessId!}
                        onReload={fetchData}
                        canWrite={canManage}
                    />
                )}
                {activeTab === "availability" && (
                    <ActivityAvailabilityTab
                        activity={activity}
                        tenantId={businessId!}
                        onReload={fetchData}
                    />
                )}
                {activeTab === "sala" && (
                    <PageGate readPermission="tables.read" activityId={activity.id}>
                        {() => (
                            // I tavoli servono a due domini: ordinazioni QR e
                            // prenotazioni. Basta uno dei due abilitati per
                            // poterli mappare. `orderingEnabled` resta il gate
                            // delle sole azioni QR dentro la pagina.
                            activity.ordering_enabled || activity.enable_reservations ? (
                                <TablesManagement
                                    tenantId={businessId!}
                                    activityId={activity.id}
                                    orderingEnabled={activity.ordering_enabled}
                                    reservationsEnabled={activity.enable_reservations}
                                />
                            ) : (
                                <TablesEmptyState
                                    onGoToOrdering={() => handleTabChange("ordering")}
                                    onGoToReservations={() => handleTabChange("reservations")}
                                />
                            )
                        )}
                    </PageGate>
                )}
                {activeTab === "ordering" && (
                    <ActivityOrderingTab
                        activity={activity}
                        tenantId={businessId!}
                        onReload={fetchData}
                        canWrite={canManage}
                    />
                )}
                {/* Ponte FASE 6: Orari / Prenotazioni montano ancora l'intera
                    tab Impostazioni. I blocchi vengono spostati uno alla volta
                    nei passi successivi. */}
                {(activeTab === "hours" ||
                    activeTab === "reservations" ||
                    activeTab === "settings") && (
                    <ActivitySettingsTab
                        activity={activity}
                        tenantId={businessId!}
                        onReload={fetchData}
                        canWrite={canManage}
                        canManageHours={canManageHours}
                    />
                )}
            </div>
        </div>
    );
};

export default ActivityDetailPage;
