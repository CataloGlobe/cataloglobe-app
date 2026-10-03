import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Lock, Store } from "lucide-react";

import { Button } from "@/components/ui/Button/Button";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { TablesLiveView } from "@/components/Tables/TablesLiveView/TablesLiveView";
import { TablesManagement } from "@/components/Tables/TablesManagement/TablesManagement";
import { TablesEmptyState } from "@/components/Tables/TablesManagement/TablesEmptyState";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { usePageHeader } from "@/context/usePageHeader";
import { usePermissions } from "@/context/usePermissions";
import { usePlanFeatures } from "@/lib/planFeatures";
import { getActivityById } from "@/services/supabase/activities";
import type { V2Activity } from "@/types/activity";
import { SERVIZIO_MODES, modeAccess, resolveServizioMode, type ServizioMode } from "@/utils/servizioModes";

import styles from "./Servizio.module.scss";

const LOCKED_HINT = "Disponibile con il piano Pro";

/**
 * Servizio (§18.2, lotto B-a): la sala di una sede, in più modi. Il modo
 * sta in `?modo=`; senza, il primo che si può usare (`servizioModes.ts`).
 * Un modo col lucchetto si vede spento e non si apre: `?modo=` che lo chiede
 * passa al primo usabile. Fuori dal parent della Scheda: legge la sede da sé,
 * come «Cosa vedono i clienti».
 *
 * Un modo solo montato alla volta: cambiando modo il canale realtime della
 * Mappa (`useTablesLiveRealtime`) si chiude, e si riapre tornandoci.
 *
 * `/sala` e i vecchi `?tab=sala|tables` portano qui, in Gestisci la sala;
 * `comande?tab=tavoli` alla Mappa.
 */
export default function Servizio() {
    const { activityId = "", businessId = "" } = useParams<{ activityId: string; businessId: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const { permissions } = usePermissions();
    const { hasFeature } = usePlanFeatures();

    const [activity, setActivity] = useState<V2Activity | null>(null);
    const [loading, setLoading] = useState(true);

    // `getActivityById` non lancia: una lettura fallita è `null`, e la pagina
    // lo dice con «Sede non trovata».
    const load = useCallback(async () => {
        setLoading(true);
        setActivity(await getActivityById(activityId, businessId));
        setLoading(false);
    }, [activityId, businessId]);

    useEffect(() => {
        void load();
    }, [load]);

    const requested = searchParams.get("modo");
    const mode = permissions ? resolveServizioMode(requested, permissions, hasFeature, activityId) : null;

    const modes = useMemo(
        () =>
            permissions
                ? SERVIZIO_MODES.map(entry => ({ ...entry, access: modeAccess(entry, permissions, hasFeature, activityId) })).filter(
                      entry => entry.access !== "hidden"
                  )
                : [],
        [permissions, hasFeature, activityId]
    );

    const changeMode = useCallback(
        (next: ServizioMode) => {
            setSearchParams(
                prev => {
                    prev.set("modo", next);
                    return prev;
                },
                { replace: true }
            );
        },
        [setSearchParams]
    );

    // Un `?modo=` che non si può usare (col lucchetto, sconosciuto) diventa
    // quello mostrato: l'indirizzo dice dove si è.
    useEffect(() => {
        if (requested && mode && requested !== mode) changeMode(mode);
    }, [requested, mode, changeMode]);

    const leading = useMemo(
        () =>
            modes.length > 0 && mode ? (
                <Tabs<ServizioMode> value={mode} onChange={changeMode} variant="line">
                    <Tabs.List aria-label="Modi di Servizio">
                        {modes.map(entry => (
                            <Tabs.Tab
                                key={entry.mode}
                                value={entry.mode}
                                disabled={entry.access === "locked"}
                                disabledTooltip={entry.access === "locked" ? LOCKED_HINT : undefined}
                            >
                                {entry.access === "locked" ? (
                                    <span className={styles.lockedTab}>
                                        {entry.label}
                                        <Lock size={14} strokeWidth={1.75} role="img" aria-label="Funzione del piano Pro" />
                                    </span>
                                ) : (
                                    entry.label
                                )}
                            </Tabs.Tab>
                        ))}
                    </Tabs.List>
                </Tabs>
            ) : null,
        [modes, mode, changeMode]
    );

    const compact = useMemo<PageHeaderCompactConfig | undefined>(
        () =>
            modes.length > 0 && mode
                ? {
                      sections: modes.map(entry => ({
                          value: entry.mode,
                          label: entry.label,
                          disabled: entry.access === "locked",
                          description: entry.access === "locked" ? LOCKED_HINT : undefined
                      })),
                      activeSection: mode,
                      onSectionChange: value => changeMode(value as ServizioMode)
                  }
                : undefined,
        [modes, mode, changeMode]
    );

    const headerConfig = useMemo(() => (leading ? { leading, compact } : null), [leading, compact]);
    usePageHeader(headerConfig);

    if ((loading && !activity) || !permissions) {
        return (
            <div className={styles.loading} aria-busy="true" aria-label="Caricamento sede">
                <Skeleton height="40px" width="40%" />
                <Skeleton height="320px" />
            </div>
        );
    }

    if (!activity) {
        return (
            <EmptyState
                variant="page"
                icon={<Store />}
                title="Sede non trovata"
                description="La sede che stai cercando non esiste o è stata eliminata."
                action={<Button onClick={() => navigate(`/business/${businessId}/locations`)}>Torna alle sedi</Button>}
            />
        );
    }

    if (!mode) {
        return (
            <EmptyState
                icon={<Lock size={40} strokeWidth={1.5} />}
                title="Non hai accesso a questa sezione"
                description="Contatta il proprietario o un amministratore per ottenere l'accesso."
            />
        );
    }

    const scheda = `/business/${businessId}/locations/${activity.id}/ordini-prenotazioni`;

    return (
        <div className={styles.container} data-mode={mode}>
            {mode === "mappa" && <TablesLiveView tenantId={businessId} activityId={activity.id} />}
            {mode === "gestisci" &&
                // I tavoli servono a due canali: ordini al tavolo e prenotazioni.
                // Basta uno dei due acceso per mapparli.
                (activity.ordering_enabled || activity.enable_reservations ? (
                    <TablesManagement
                        tenantId={businessId}
                        activityId={activity.id}
                        orderingEnabled={activity.ordering_enabled}
                        reservationsEnabled={activity.enable_reservations}
                    />
                ) : (
                    <TablesEmptyState
                        onGoToOrdering={() => navigate(`${scheda}#ordini`)}
                        onGoToReservations={() => navigate(`${scheda}#prenotazioni`)}
                    />
                ))}
        </div>
    );
}
