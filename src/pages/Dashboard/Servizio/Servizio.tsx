import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Lock, Plus, Store } from "lucide-react";

import { Button } from "@/components/ui/Button/Button";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { TablesLiveView } from "@/components/Tables/TablesLiveView/TablesLiveView";
import ServizioElenco from "./ServizioElenco";
import ServizioTodayRow from "./ServizioTodayRow";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { usePageHeader } from "@/context/usePageHeader";
import { usePermissions } from "@/context/usePermissions";
import { canDoOnActivity, isOwnerOrAdmin } from "@/lib/permissions";
import { usePlanFeatures } from "@/lib/planFeatures";
import { getActivityById } from "@/services/supabase/activities";
import type { V2Activity } from "@/types/activity";
import { SERVIZIO_MODES, modeAccess, resolveServizioMode, type ServizioMode } from "@/utils/servizioModes";

import styles from "./Servizio.module.scss";

const LOCKED_HINT = "Disponibile con il piano Pro";

/**
 * Servizio (§18.2, lotti B-a e B-b): la sala di una sede, in due modi —
 * Elenco e Mappa. «Gestisci la sala» è la tab Sala della Scheda
 * (correzioni UI SV3). Il modo
 * sta in `?modo=`; senza, il primo che si può usare (`servizioModes.ts`).
 * Un modo col lucchetto si vede spento e non si apre: `?modo=` che lo chiede
 * passa al primo usabile. Fuori dal parent della Scheda: legge la sede da sé,
 * come «Cosa vedono i clienti».
 *
 * Un modo solo montato alla volta: cambiando modo i canali realtime del
 * modo lasciato (Elenco: prenotazioni e tavolate; Mappa:
 * `useTablesLiveRealtime`) si chiudono, e si riaprono tornandoci.
 *
 * `?modo=gestisci` porta alla tab Sala della Scheda;
 * `comande?tab=tavoli` alla Mappa; `prenotazioni?tab=service` all'Elenco.
 */
export default function Servizio() {
    const { activityId = "", businessId = "" } = useParams<{ activityId: string; businessId: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const { permissions } = usePermissions();
    const { hasFeature } = usePlanFeatures();

    const [activity, setActivity] = useState<V2Activity | null>(null);
    // «+ Senza prenotazione» sta nella testata (T14 SV1); il drawer resta
    // dell'Elenco, che ha i tavoli e la sala.
    const [isWalkinOpen, setIsWalkinOpen] = useState(false);
    const canReadReservations = permissions ? canDoOnActivity(permissions, "reservations.read", activityId) : false;
    const canWalkin = permissions ? canDoOnActivity(permissions, "seatings.manage", activityId) : false;
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

    const showWalkin = mode === "elenco" && canWalkin;
    const actions = useMemo(
        () =>
            showWalkin ? (
                <Button variant="primary" leftIcon={<Plus size={16} />} onClick={() => setIsWalkinOpen(true)}>
                    Senza prenotazione
                </Button>
            ) : undefined,
        [showWalkin]
    );
    const compactWithWalkin = useMemo<PageHeaderCompactConfig | undefined>(
        () =>
            compact && showWalkin
                ? { ...compact, primaryAction: { label: "Senza prenotazione", onClick: () => setIsWalkinOpen(true) } }
                : compact,
        [compact, showWalkin]
    );

    const headerConfig = useMemo(
        () => (leading ? { leading, actions, compact: compactWithWalkin } : null),
        [leading, actions, compactWithWalkin]
    );
    usePageHeader(headerConfig);

    // «Gestisci la sala» è la tab Sala della Scheda (correzioni UI SV3): i
    // vecchi `?modo=gestisci` portano lì.
    if (requested === "gestisci") {
        return <Navigate to="../sala" relative="path" replace />;
    }

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

    // Modi visibili ma tutti col lucchetto (piano Base): non è un permesso
    // che manca, è il piano. Prima non capitava: «Gestisci la sala» non
    // aveva lucchetto, e dalle correzioni UI (SV3) è la tab Sala della Scheda.
    if (!mode && modes.length > 0) {
        const billingCapable = isOwnerOrAdmin(permissions);
        return (
            <EmptyState
                icon={<Lock size={40} strokeWidth={1.5} />}
                title="Servizio è una funzione del piano Pro"
                description={
                    billingCapable
                        ? "L'Elenco delle prenotazioni del giorno e la Mappa dei tavoli con i conti aperti. I tavoli si gestiscono nella tab Sala della sede."
                        : "Chiedi al proprietario di passare a Pro. I tavoli si gestiscono nella tab Sala della sede."
                }
                action={
                    billingCapable ? (
                        <Button variant="primary" onClick={() => navigate(`/business/${businessId}/settings/abbonamento`)}>
                            Passa a Pro
                        </Button>
                    ) : undefined
                }
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

    return (
        <div className={styles.container} data-mode={mode}>
            {canReadReservations && (
                <ServizioTodayRow
                    tenantId={businessId}
                    activityId={activity.id}
                    requestsHref={`/business/${businessId}/locations/${activity.id}/prenotazioni`}
                />
            )}
            {mode === "elenco" && (
                <ServizioElenco
                    activityId={activity.id}
                    walkinOpen={isWalkinOpen}
                    onWalkinClose={() => setIsWalkinOpen(false)}
                />
            )}
            {mode === "mappa" && <TablesLiveView tenantId={businessId} activityId={activity.id} />}
        </div>
    );
}
