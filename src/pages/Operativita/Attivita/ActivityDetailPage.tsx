import React, { useEffect, useState, useMemo, useCallback } from "react";
import { Navigate, Outlet, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Store } from "lucide-react";
import { Button } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { UnsavedChangesBar } from "@/components/ui/UnsavedChangesBar/UnsavedChangesBar";
import { useUnsavedChangesGuard } from "@/components/ui/UnsavedChangesBar/useUnsavedChangesGuard";
import { useBreadcrumbItems } from "@/context/useBreadcrumbItems";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { getActivityById } from "@/services/supabase/activities";
import { listActivityHours } from "@/services/supabase/activityHours";
import { getTenantFiscalProfile } from "@/services/supabase/tenants";
import { V2Activity } from "@/types/activity";
import type { V2ActivityHours } from "@/types/activity-hours";
import { useToast } from "@/context/Toast/ToastContext";
import { usePermissions } from "@/context/PermissionsContext";
import { canDoOnActivity, canDoOnTenant } from "@/lib/permissions";
import { formatInactiveReason } from "@/utils/activityStatus";
import {
    ACTIVITY_PAGES,
    ACTIVITY_SECTION_LABELS,
    ACTIVITY_SECTIONS,
    type ActivityDetailOutletContext,
    type ActivitySection
} from "./ActivityDetailContext";
import { useActivityDraft } from "./useActivityDraft";
import styles from "./ActivityDetailPage.module.scss";

/**
 * I vecchi `?tab=` (sette valori più cinque legacy di una consolidazione
 * precedente) portano alla rotta giusta con `replace`: i link in giro
 * continuano a funzionare (registro Sedi, chiusura 9; §29.2).
 */
const LEGACY_TAB_REDIRECT: Record<string, { section: ActivitySection; hash?: string }> = {
    profile: { section: "anagrafica" },
    info: { section: "anagrafica" },
    media: { section: "anagrafica" },
    hours: { section: "orari" },
    ordering: { section: "canali", hash: "ordini" },
    reservations: { section: "canali", hash: "prenotazioni" },
    settings: { section: "pubblicazione" },
    "hours-services": { section: "pubblicazione" },
    "access-control": { section: "pubblicazione" },
    sala: { section: "sala" },
    tables: { section: "sala" },
    availability: { section: "disponibilita" }
};

const isSection = (v: string): v is ActivitySection =>
    (ACTIVITY_SECTIONS as readonly string[]).includes(v);

/**
 * Il locale in quattro pagine (§31): Anagrafica · Orari · Canali ·
 * Pubblicazione, più Sala e Disponibilità come rotte senza tab. Questo
 * parent legge la sede, gli orari e la ragione sociale una volta, tiene il
 * draft unico con la sua barra e la guardia all'uscita, e dà tutto alle
 * rotte figlie via `Outlet` (`useActivityDetail`).
 */
const ActivityDetailPage: React.FC = () => {
    const { activityId, businessId } = useParams<{ activityId: string; businessId: string }>();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [searchParams] = useSearchParams();
    const { showToast } = useToast();
    const { permissions } = usePermissions();

    const basePath = `/business/${businessId}/locations/${activityId}`;
    const lastSegment = pathname.slice(basePath.length).split("/").filter(Boolean)[0] ?? "";
    const section: ActivitySection = isSection(lastSegment) ? lastSegment : "anagrafica";

    const goToSection = useCallback(
        (next: ActivitySection, hash?: string) => {
            navigate({ pathname: `${basePath}/${next}`, hash: hash ? `#${hash}` : "" });
        },
        [navigate, basePath]
    );

    const [activity, setActivity] = useState<V2Activity | null>(null);
    const [loading, setLoading] = useState(true);

    const canManage = activityId && permissions
        ? canDoOnActivity(permissions, "activity.manage", activityId)
        : false;
    // Eliminare una sede è tenant-scoped (proprietario e amministratore):
    // senza il permesso la zona pericolosa non si mostra (registro Sedi #85).
    const canDelete = permissions ? canDoOnTenant(permissions, "activities.delete") : false;
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

    // Orari a livello pagina: dato della sede, non di una rotta. Li scrive
    // Orari, li legge anche Canali (prerequisito delle prenotazioni); una sola
    // fonte, ricaricata dopo ogni scrittura via `loadHours`.
    const [hours, setHours] = useState<V2ActivityHours[]>([]);
    const [isHoursLoading, setIsHoursLoading] = useState(true);

    const loadHours = useCallback(async () => {
        if (!activityId || !businessId) return;
        try {
            setIsHoursLoading(true);
            setHours(await listActivityHours(activityId, businessId));
        } catch {
            showToast({ message: "Errore nel caricamento degli orari.", type: "error" });
        } finally {
            setIsHoursLoading(false);
        }
    }, [activityId, businessId, showToast]);

    useEffect(() => {
        loadHours();
    }, [loadHours]);

    // Ragione sociale a livello pagina: `get_user_tenants()` (fonte di
    // `selectedTenant`) non espone i campi fiscali, quindi il contesto non
    // basta. Una lettura per apertura sede; la legge Canali per il
    // prerequisito dell'informativa privacy. `null` = non ancora letta.
    const [legalName, setLegalName] = useState<string | null | undefined>(undefined);

    useEffect(() => {
        if (!businessId) return;
        let cancelled = false;
        getTenantFiscalProfile(businessId)
            .then(profile => {
                if (!cancelled) setLegalName(profile.legal_name ?? null);
            })
            .catch(() => {
                // Silente: il prerequisito resta "in caricamento" e la riga
                // non dichiara nulla di falso.
                if (!cancelled) setLegalName(undefined);
            });
        return () => {
            cancelled = true;
        };
    }, [businessId]);

    const breadcrumbItems = useMemo(
        () => [
            { label: "Sedi", to: `/business/${businessId}/locations` },
            { label: activity?.name || "Dettaglio Sede" }
        ],
        [activity, businessId]
    );

    useBreadcrumbItems(breadcrumbItems);

    // Il draft unico (§31.4) vive qui, sopra le rotte: sopravvive al cambio di
    // pagina della sede. Con la sede non ancora letta il draft è inerte.
    const draft = useActivityDraft(
        activity ?? ({ id: activityId ?? "", tenant_id: businessId ?? "" } as V2Activity),
        businessId ?? "",
        setActivity
    );
    useUnsavedChangesGuard(draft.isDirty);

    // Testata: le quattro pagine come tab che navigano, lo stato della sede
    // nelle azioni (su quattro pagine non è più a un click, come nel
    // prototipo §31). Sala e Disponibilità non hanno una tab attiva.
    const leading = useMemo(() => (
        <Tabs<ActivitySection> value={section} onChange={next => goToSection(next)} variant="line">
            <Tabs.List>
                {ACTIVITY_PAGES.map(value => (
                    <Tabs.Tab key={value} value={value}>{ACTIVITY_SECTION_LABELS[value]}</Tabs.Tab>
                ))}
            </Tabs.List>
        </Tabs>
    ), [section, goToSection]);

    const statusLabel = activity
        ? activity.status === "inactive"
            ? activity.inactive_reason
                ? `Sospesa · ${formatInactiveReason(activity.inactive_reason)}`
                : "Sospesa"
            : "Pubblicata"
        : null;

    const actions = useMemo(() => (
        statusLabel ? (
            <StatusBadge variant={activity?.status === "inactive" ? "neutral" : "success"} label={statusLabel} />
        ) : null
    ), [statusLabel, activity?.status]);

    const headerCompact = useMemo<PageHeaderCompactConfig>(() => ({
        sections: ACTIVITY_PAGES.map(value => ({ value, label: ACTIVITY_SECTION_LABELS[value] })),
        activeSection: section,
        onSectionChange: value => goToSection(value as ActivitySection),
        statusIndicator: statusLabel ? { label: statusLabel } : undefined
    }), [section, goToSection, statusLabel]);

    usePageHeader({
        leading,
        actions,
        compact: headerCompact,
    });

    // Redirect dei vecchi `?tab=`: prima di tutto, così un link vecchio non
    // monta mai una rotta sbagliata.
    const legacyTab = searchParams.get("tab");
    if (legacyTab) {
        const target = LEGACY_TAB_REDIRECT[legacyTab] ?? { section: "anagrafica" as ActivitySection };
        return (
            <Navigate
                to={{ pathname: `${basePath}/${target.section}`, hash: target.hash ? `#${target.hash}` : "" }}
                replace
            />
        );
    }

    if (loading && !activity) {
        return (
            <div className={styles.container}>
                <div className={styles.loading} aria-busy="true" aria-label="Caricamento sede">
                    <Skeleton height="40px" width="40%" />
                    <Skeleton height="160px" />
                    <Skeleton height="160px" />
                </div>
            </div>
        );
    }

    if (!activity || !businessId) {
        return (
            <div className={styles.container}>
                <EmptyState
                    variant="page"
                    icon={<Store />}
                    title="Sede non trovata"
                    description="La sede che stai cercando non esiste o è stata eliminata."
                    action={
                        <Button onClick={() => navigate(`/business/${businessId}/locations`)}>
                            Torna alle sedi
                        </Button>
                    }
                />
            </div>
        );
    }

    const context: ActivityDetailOutletContext = {
        activity,
        businessId,
        tenantId: businessId,
        reload: fetchData,
        hours,
        isHoursLoading,
        loadHours,
        legalName,
        canManage,
        canManageHours,
        canDelete,
        draft,
        goToSection
    };

    return (
        <div className={styles.container} data-active-tab={section}>
            <div className={styles.contentWrapper}>
                <Outlet context={context} />
            </div>
            {draft.isDirty && (
                <>
                    {draft.error && <InlineBanner variant="error">{draft.error}</InlineBanner>}
                    <UnsavedChangesBar
                        isSaving={draft.isSaving}
                        onCancel={draft.discard}
                        onSave={() => {
                            void draft.save();
                        }}
                        label={draft.dirtyCount === 1 ? "1 modifica non salvata" : `${draft.dirtyCount} modifiche non salvate`}
                    />
                </>
            )}
        </div>
    );
};

export default ActivityDetailPage;
