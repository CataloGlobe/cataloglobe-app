import React, { useEffect, useState, useMemo, useCallback } from "react";
import { Navigate, Outlet, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronRight, Store } from "lucide-react";
import { Button } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { HeaderSaveAction, DiscardChangesConfirmDialog } from "@/components/ui/HeaderSaveAction/HeaderSaveAction";
import { buildSaveActionCompactConfig } from "@/components/ui/HeaderSaveAction/headerSaveActionCompact";
import { useUnsavedChangesGuard } from "@/components/ui/UnsavedChangesBar/useUnsavedChangesGuard";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { getActivityById } from "@/services/supabase/activities";
import { listActivityHours } from "@/services/supabase/activityHours";
import { getTenantFiscalProfile } from "@/services/supabase/tenants";
import { V2Activity } from "@/types/activity";
import type { V2ActivityHours } from "@/types/activity-hours";
import { useToast } from "@/context/Toast/ToastContext";
import { usePermissions } from "@/context/usePermissions";
import { canDoOnActivity, canDoOnTenant } from "@/lib/permissions";
import { formatInactiveReason } from "@/utils/activityStatus";
import { legacyTabTarget } from "@/utils/navLanding";
import {
    ACTIVITY_SECTIONS,
    type ActivityDetailOutletContext,
    type ActivitySection
} from "./ActivityDetailContext";
import { useActivityDraft } from "./useActivityDraft";
import { ActivitySedeMenu } from "./components/ActivitySedeMenu";
import { isSchedaPart, PART_TITLE, type SchedaPart } from "./scheda/schedaCopy";
import styles from "./ActivityDetailPage.module.scss";
import schedaStyles from "./scheda/Scheda.module.scss";

const isSection = (v: string): v is ActivitySection =>
    (ACTIVITY_SECTIONS as readonly string[]).includes(v);

/**
 * La Scheda della sede (Officina 3, prototipo C+++ «Scorrono insieme»): un
 * cruscotto con il telefono accanto, e ogni parte che si apre a fuoco con
 * `?parte=`. Questo parent legge la sede, gli orari e la ragione sociale una volta,
 * tiene il draft unico con la sua barra e la guardia all'uscita, e dà tutto
 * alle rotte figlie via `Outlet` (`useActivityDetail`).
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
        (next: ActivitySection, hash?: string, part?: SchedaPart) => {
            navigate({
                pathname: `${basePath}/${next}`,
                search: part ? `?parte=${part}` : "",
                hash: hash ? `#${hash}` : ""
            });
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
    // Orari, li leggono anche Ordini e prenotazioni (prerequisito); una sola
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
    // basta. Una lettura per apertura sede; la leggono Ordini e prenotazioni
    // per il
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

    // Niente briciole proprie: la sede è nel suo selettore dell'header e la
    // pagina («Scheda») la deriva l'header dalla voce di sidebar (§51.8).

    // Il draft unico (§31.4) vive qui, sopra le rotte: sopravvive al cambio di
    // pagina della sede. Con la sede non ancora letta il draft è inerte.
    const draft = useActivityDraft(
        activity ?? ({ id: activityId ?? "", tenant_id: businessId ?? "" } as V2Activity),
        businessId ?? "",
        setActivity
    );
    useUnsavedChangesGuard(draft.isDirty);

    // Testata (C+++): niente tab. A sinistra il nome della sede col suo
    // stato; con una parte a fuoco, il percorso «sede › parte» che torna al
    // cruscotto. Il Salva e il «⋯» (sospendi, elimina) a destra.
    const rawPart = section === "anagrafica" ? searchParams.get("parte") : null;
    const part: SchedaPart | null = rawPart && isSchedaPart(rawPart) ? rawPart : null;
    const closePart = useCallback(() => goToSection("anagrafica"), [goToSection]);

    const statusLabel = activity
        ? activity.status === "inactive"
            ? activity.inactive_reason
                ? `Sospesa · ${formatInactiveReason(activity.inactive_reason)}`
                : "Sospesa"
            : "Online"
        : null;

    const leading = useMemo(() => {
        if (!activity) return null;
        if (part) {
            return (
                <div className={schedaStyles.crumbs}>
                    <button type="button" onClick={closePart}>
                        {activity.name}
                    </button>
                    <ChevronRight size={14} strokeWidth={1.75} aria-hidden />
                    <strong>{PART_TITLE[part]}</strong>
                </div>
            );
        }
        return (
            <div className={schedaStyles.headTitle}>
                <h2>{activity.name}</h2>
                {statusLabel && (
                    <StatusBadge variant={activity.status === "inactive" ? "neutral" : "success"} label={statusLabel} />
                )}
            </div>
        );
    }, [activity, part, closePart, statusLabel]);

    // Il salvataggio del draft sta nella barra della pagina, a destra (MD1):
    // niente barra fluttuante. Solo per chi può modificare la sede.
    const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
    const showSave = Boolean(canManage && activity);
    const saveDraft = draft.save;
    const handleSave = useCallback(() => {
        void saveDraft();
    }, [saveDraft]);

    const actions = useMemo(() => (
        activity ? (
            <>
                {showSave && (
                    <HeaderSaveAction
                        isDirty={draft.isDirty}
                        isSaving={draft.isSaving}
                        onSave={handleSave}
                        onDiscard={draft.discard}
                        changeCount={draft.dirtyCount}
                    />
                )}
                {activity && businessId && (
                    <ActivitySedeMenu
                        activity={activity}
                        businessId={businessId}
                        tenantId={businessId}
                        reload={fetchData}
                        canManage={canManage}
                        canDelete={canDelete}
                    />
                )}
            </>
        ) : null
    ), [activity, businessId, fetchData, canManage, canDelete, showSave, draft.isDirty, draft.isSaving, draft.discard, draft.dirtyCount, handleSave]);

    // In compatto: con una parte a fuoco la freccia torna al cruscotto.
    const headerCompact = useMemo<PageHeaderCompactConfig>(() => ({
        ...(part ? { backAction: { label: activity?.name ?? "Scheda", onClick: closePart } } : {}),
        statusIndicator: statusLabel ? { label: statusLabel } : undefined,
        ...(showSave
            ? buildSaveActionCompactConfig({
                  isDirty: draft.isDirty,
                  isSaving: draft.isSaving,
                  onSave: handleSave,
                  onRequestDiscard: () => setConfirmDiscardOpen(true)
              })
            : {}),
        // Lo stato della sede resta a vista anche col draft pulito: il
        // «Salvato» della barra compatta non lo sostituisce.
        ...(showSave && !draft.isDirty && !draft.isSaving && statusLabel
            ? { statusIndicator: { label: statusLabel } }
            : {})
    }), [part, activity?.name, closePart, statusLabel, showSave, draft.isDirty, draft.isSaving, handleSave]);

    usePageHeader({
        leading,
        actions,
        compact: headerCompact,
    });

    // Redirect dei vecchi `?tab=` anche su una pagina della scheda (sull'indice
    // li legge `SedeHomeRedirect`): prima di tutto, così un link vecchio non
    // monta mai una rotta sbagliata.
    const legacyTab = searchParams.get("tab");
    if (legacyTab) {
        const target = legacyTabTarget(legacyTab);
        return (
            <Navigate
                to={{
                    pathname: `${basePath}/${target.segment}`,
                    search: target.search ? `?${target.search}` : "",
                    hash: target.hash ? `#${target.hash}` : ""
                }}
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
                {draft.isDirty && draft.error && <InlineBanner variant="error">{draft.error}</InlineBanner>}
                <Outlet context={context} />
            </div>
            <DiscardChangesConfirmDialog
                isOpen={confirmDiscardOpen}
                onClose={() => setConfirmDiscardOpen(false)}
                onDiscard={draft.discard}
            />
        </div>
    );
};

export default ActivityDetailPage;
