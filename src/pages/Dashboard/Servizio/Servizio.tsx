import { useCallback, useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Lock, Plus, Store, Volume2, VolumeX } from "lucide-react";

import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { TablesLiveView } from "@/components/Tables/TablesLiveView/TablesLiveView";
import ServizioElenco from "./ServizioElenco";
import ServizioTodayRow from "./ServizioTodayRow";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { usePageHeader } from "@/context/usePageHeader";
import { usePermissions } from "@/context/usePermissions";
import { canDoOnActivity, isOwnerOrAdmin } from "@/lib/permissions";
import { usePlanFeatures } from "@/lib/planFeatures";
import { getActivityById } from "@/services/supabase/activities";
import { countManualOverridesByActivity } from "@/services/supabase/activeCatalog";
import { LOOK_D } from "@/styles/lookD";
import type { V2Activity } from "@/types/activity";
import { SERVIZIO_MODES, modeAccess, normalizeServizioMode, resolveServizioMode, type ServizioMode } from "@/utils/servizioModes";
import { ServizioSala } from "./ServizioSala";
import { useInServizioSwitch } from "./useInServizioSwitch";
import { AdessoD, InServizioD } from "./InServizioD";
import { useNextArrival } from "./useNextArrival";
import { usePendingReservationsCount } from "./usePendingReservationsCount";
import type { OrdersSummary } from "@/pages/Dashboard/Orders/Orders";
import { getServerSnapshot, getSnapshot, setSoundEnabled, subscribe } from "@/hooks/notificationSoundStore";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";

import { DetailPane } from "@/components/layout/DetailPane/DetailPane";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { useDetailParam } from "@/hooks/useDetailParam";
import { CosaVedonoContent } from "@/pages/Operativita/Attivita/routes/ActivityCosaVedonoRoute";

import styles from "./Servizio.module.scss";

/** I dettagli dal vivo dei modi (D131): `?tavolo=` della Mappa, `?prenotazione=` e `?tavolata=` dell'Elenco. */
const DETAIL_PARAMS = ["tavolo", "prenotazione", "tavolata"] as const;
/** Gli altri pannelli di lato di In servizio: aprendo la Disponibilità si chiudono. */
const DISPONIBILITA_SIBLINGS = [...DETAIL_PARAMS, "ordine"] as const;

/**
 * Servizio (§18.2, lotti B-a e B-b): la sala di una sede, in tre modi —
 * Elenco, Mappa e Sala (i tavoli da configurare: era la tab Sala della
 * Scheda, con la Scheda C+++ torna qui). Il modo
 * sta in `?modo=`; senza, il primo che si può usare (`servizioModes.ts`).
 * Un modo col lucchetto si vede spento e non si apre: `?modo=` che lo chiede
 * passa al primo usabile. Fuori dal parent della Scheda: legge la sede da sé,
 * come «Cosa vedono i clienti».
 *
 * Un modo solo montato alla volta: cambiando modo i canali realtime del
 * modo lasciato (Elenco: prenotazioni e tavolate; Mappa:
 * `useTablesLiveRealtime`) si chiudono, e si riaprono tornandoci.
 *
 * `?modo=gestisci` e `/sala` portano alla Sala;
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
    const canReadActivity = permissions ? canDoOnActivity(permissions, "activity.read", activityId) : false;
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

    // Nella D la sala si apre sulla Mappa (copia «Visual Redesign PR 3»);
    // senza i tavoli, il primo modo usabile come sempre.
    const requested = normalizeServizioMode(searchParams.get("modo")) ?? (LOOK_D ? "mappa" : null);
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

    // Cambiando modo il dettaglio aperto si chiude: tavolo, prenotazione e
    // tavolata sono di un modo solo, e tornando indietro non si riaprono da soli.
    // Stesso modo (l'indirizzo che si corregge): lo stato della voce resta,
    // col segno di un dettaglio aperto da qui (`useDetailParam`).
    const location = useLocation();
    const changeMode = useCallback(
        (next: ServizioMode) => {
            const same = searchParams.get("modo") === next;
            setSearchParams(
                prev => {
                    if (!same) for (const key of DETAIL_PARAMS) prev.delete(key);
                    prev.set("modo", next);
                    return prev;
                },
                { replace: true, state: same ? location.state : null }
            );
        },
        [searchParams, location.state, setSearchParams]
    );

    // Un `?modo=` che non si può usare (col lucchetto, sconosciuto) diventa
    // quello mostrato: l'indirizzo dice dove si è.
    const rawMode = searchParams.get("modo");
    // Anche senza `?modo=`, quando resta solo la Sala: è la sua parte, non «In servizio».
    useEffect(() => {
        if (mode && rawMode !== mode && (rawMode || mode === "sala")) changeMode(mode);
    }, [rawMode, mode, changeMode]);

    // La Sala è una parte di Servizio (sidebar e tab in alto). «In servizio»
    // tiene insieme Elenco, Mappa, Prenotazioni e Comande con un interruttore
    // (artifact v4: un secondo livello è un interruttore, mai altre tab).
    // D (copia «Visual Redesign PR 3»): Elenco e Mappa sono In servizio con
    // Comande e sala affiancate; niente interruttore in testata.
    const pageD = LOOK_D && (mode === "elenco" || mode === "mappa");
    const usable = (m: ServizioMode) => modes.some(e => e.mode === m && e.access === "usable");
    const canMappa = usable("mappa");
    const canElenco = usable("elenco");
    const showComandeD =
        pageD && hasFeature("table_ordering") && !!permissions && canDoOnActivity(permissions, "orders.read", activityId);
    const canCreateOrder =
        showComandeD && !!permissions && canDoOnActivity(permissions, "orders.manage", activityId);
    const { canEdit } = useSubscriptionGuard();
    // Solo lo stato del suono (lo stesso della campanella): l'audio lo
    // preparano gli avvisi sempre montati al primo gesto, anche questo clic.
    const soundEnabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    const toggleSound = useCallback(() => setSoundEnabled(!getSnapshot()), []);
    const [isCreateOrderOpen, setIsCreateOrderOpen] = useState(false);
    const [summary, setSummary] = useState<OrdersSummary>({ nuove: 0, pronte: 0, attese: 0 });
    const { count: conf, reload: reloadConf } = usePendingReservationsCount(businessId, activityId, pageD && canReadReservations);
    // Conferma e Rifiuta partono dopo i 5 s di «Annulla» (gesto differito): si ricontano dopo.
    const onPendingChange = useCallback(() => {
        window.setTimeout(reloadConf, 6_000);
    }, [reloadConf]);
    const next = useNextArrival(businessId, activityId, pageD && canReadReservations);
    // Sotto le due colonne «Adesso» non c'è: i numeri sono nel selettore delle parti.
    const [narrow, setNarrow] = useState(false);
    const adesso = useMemo(
        () =>
            pageD && !narrow ? (
                <AdessoD summary={showComandeD ? summary : { nuove: 0, pronte: 0, attese: 0 }} conf={conf} next={next} />
            ) : undefined,
        [pageD, narrow, showComandeD, summary, conf, next]
    );
    // «Senza prenotazione» apre il drawer dell'Elenco: dalla Mappa si passa
    // all'Elenco della sala, poi si apre.
    const openWalkin = useCallback(() => {
        if (pageD && searchParams.get("modo") !== "elenco") {
            setSearchParams(
                prev => {
                    for (const key of DETAIL_PARAMS) prev.delete(key);
                    prev.set("modo", "elenco");
                    prev.set("parte", "sala");
                    return prev;
                },
                { replace: true }
            );
        }
        setIsWalkinOpen(true);
    }, [pageD, searchParams, setSearchParams]);

    const inServizio = useInServizioSwitch(mode && mode !== "sala" && !pageD ? mode : null, changeMode);
    const leading = pageD ? adesso : inServizio.leading;
    const compact = useMemo<PageHeaderCompactConfig | undefined>(
        () =>
            inServizio.sections
                ? { sections: inServizio.sections, activeSection: mode ?? undefined, onSectionChange: inServizio.onSectionChange }
                : undefined,
        [inServizio.sections, inServizio.onSectionChange, mode]
    );

    const showWalkin = pageD ? canWalkin && canElenco : mode === "elenco" && canWalkin;
    // D (copia «Visual Redesign PR 3»): la disponibilità dei prodotti si
    // raggiunge da qui, «Disponibilità · N» con le modifiche a mano della sede;
    // la voce «Cosa vedono i clienti» non sta più nella sidebar, quindi il
    // pulsante c'è in ogni parte di In servizio, anche col piano Base (Mappa).
    // Non in «Sale e tavoli» (`?modo=sala`): nella copia sta solo qui.
    const showDisponibilita = pageD && !!activity && canReadActivity;
    const [fuori, setFuori] = useState<number | null>(null);
    useEffect(() => {
        setFuori(null);
        if (!showDisponibilita) return;
        let cancelled = false;
        countManualOverridesByActivity([activityId])
            .then(counts => {
                if (!cancelled) setFuori(counts[activityId] ?? 0);
            })
            .catch(() => {
                // Senza conteggio il pulsante resta, senza numero.
                if (!cancelled) setFuori(null);
            });
        return () => {
            cancelled = true;
        };
    }, [showDisponibilita, activityId]);
    // Il pannello di lato «Disponibilità dei prodotti» (copia, `pane menu`):
    // in sola lettura per chi vede In servizio ma non può cambiarla (Alex,
    // 2026-10-16); lo decide `CosaVedonoContent`, come nella pagina intera.
    const [dispParam, openDispParam, closeDisponibilita] = useDetailParam("disponibilita", DISPONIBILITA_SIBLINGS);
    const otherDetailOpen = DISPONIBILITA_SIBLINGS.some(key => searchParams.has(key));
    const disponibilitaOpen = showDisponibilita && dispParam !== null && !otherDetailOpen;
    const openDisponibilita = useCallback(() => openDispParam("1"), [openDispParam]);
    const disponibilitaTitleId = useId();
    const disponibilitaPageHref = `/business/${businessId}/locations/${activityId}/cosa-vedono`;
    const disponibilitaLabel = `Disponibilità${fuori ? ` · ${fuori}` : ""}`;
    const soundLabel = soundEnabled ? "Disattiva suoni notifiche" : "Attiva suoni notifiche";
    const actions = useMemo(
        () =>
            showWalkin || showDisponibilita || canCreateOrder ? (
                <>
                    {showDisponibilita && (
                        <Button variant="secondary" onClick={openDisponibilita}>
                            {disponibilitaLabel}
                        </Button>
                    )}
                    {showComandeD && (
                        <IconButton
                            variant="ghost"
                            icon={soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                            onClick={toggleSound}
                            aria-pressed={soundEnabled}
                            aria-label={soundLabel}
                            title={soundEnabled ? "Suono acceso" : "Suono spento"}
                        />
                    )}
                    {showWalkin && (
                        <Button
                            variant={pageD ? "secondary" : "primary"}
                            leftIcon={pageD ? undefined : <Plus size={16} />}
                            onClick={openWalkin}
                        >
                            Senza prenotazione
                        </Button>
                    )}
                    {canCreateOrder && (
                        <Button
                            variant="primary"
                            leftIcon={<Plus size={16} />}
                            onClick={() => setIsCreateOrderOpen(true)}
                            disabled={!canEdit}
                        >
                            Crea ordine
                        </Button>
                    )}
                </>
            ) : undefined,
        [
            showWalkin,
            showDisponibilita,
            canCreateOrder,
            showComandeD,
            pageD,
            disponibilitaLabel,
            openDisponibilita,
            openWalkin,
            soundEnabled,
            soundLabel,
            toggleSound,
            canEdit
        ]
    );
    const compactWithWalkin = useMemo<PageHeaderCompactConfig | undefined>(() => {
        if (pageD) {
            return {
                persistentIcons: showComandeD
                    ? [{ icon: soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />, label: soundLabel, onClick: toggleSound }]
                    : undefined,
                primaryAction: canCreateOrder
                    ? { label: "Crea ordine", onClick: () => setIsCreateOrderOpen(true), disabled: !canEdit }
                    : showWalkin
                      ? { label: "Senza prenotazione", onClick: openWalkin }
                      : undefined,
                secondaryActions: [
                    ...(showDisponibilita ? [{ label: disponibilitaLabel, onClick: openDisponibilita }] : []),
                    ...(canCreateOrder && showWalkin ? [{ label: "Senza prenotazione", onClick: openWalkin }] : [])
                ]
            };
        }
        return compact && (showWalkin || showDisponibilita)
            ? {
                ...compact,
                primaryAction: showWalkin ? { label: "Senza prenotazione", onClick: openWalkin } : undefined,
                secondaryActions: showDisponibilita ? [{ label: disponibilitaLabel, onClick: openDisponibilita }] : undefined
            }
            : compact;
    }, [
        pageD,
        compact,
        showWalkin,
        showDisponibilita,
        showComandeD,
        canCreateOrder,
        canEdit,
        soundEnabled,
        soundLabel,
        toggleSound,
        disponibilitaLabel,
        openDisponibilita,
        openWalkin
    ]);

    const headerConfig = useMemo(
        () => (leading || actions ? { leading, actions, compact: compactWithWalkin } : null),
        [leading, actions, compactWithWalkin]
    );
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

    // Modi visibili ma tutti col lucchetto (piano Base, senza i tavoli e
    // quindi senza la Sala): non è un permesso che manca, è il piano.
    if (!mode && modes.length > 0) {
        const billingCapable = isOwnerOrAdmin(permissions);
        return (
            <EmptyState
                gate
                icon={<Lock size={40} strokeWidth={1.5} />}
                title="Servizio è una funzione del piano Pro"
                description={
                    billingCapable
                        ? "L'Elenco delle prenotazioni del giorno e la Mappa dei tavoli con i conti aperti."
                        : "Chiedi al proprietario di passare a Pro."
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
                gate
                icon={<Lock size={40} strokeWidth={1.5} />}
                title="Non hai accesso a questa sezione"
                description="Contatta il proprietario o un amministratore per ottenere l'accesso."
            />
        );
    }

    if (pageD) {
        return (
            <>
                <InServizioD
                    tenantId={businessId}
                    activityId={activity.id}
                    view={mode === "mappa" ? "mappa" : "elenco"}
                    onViewChange={changeMode}
                    showComande={showComandeD}
                    canMappa={canMappa}
                    canElenco={canElenco}
                    conf={conf}
                    prenotazioniHref={`/business/${businessId}/locations/${activity.id}/prenotazioni`}
                    onPendingChange={onPendingChange}
                    summary={summary}
                    onSummary={setSummary}
                    onNarrowChange={setNarrow}
                    walkinOpen={isWalkinOpen}
                    onWalkinClose={() => setIsWalkinOpen(false)}
                    createOpen={isCreateOrderOpen}
                    onCreateClose={() => setIsCreateOrderOpen(false)}
                />
                <DetailPane
                    open={disponibilitaOpen}
                    onClose={closeDisponibilita}
                    aria-labelledby={disponibilitaTitleId}
                    backLabel="In servizio"
                >
                    <DrawerLayout
                        title="Disponibilità dei prodotti"
                        titleId={disponibilitaTitleId}
                        onClose={closeDisponibilita}
                        footer={
                            <Button variant="secondary" onClick={() => navigate(disponibilitaPageHref)}>
                                Apri la pagina intera
                            </Button>
                        }
                    >
                        {disponibilitaOpen && <CosaVedonoContent activity={activity} tenantId={businessId} />}
                    </DrawerLayout>
                </DetailPane>
            </>
        );
    }

    return (
        <div className={styles.container} data-mode={mode}>
            {canReadReservations && mode !== "sala" && (
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
            {mode === "sala" && <ServizioSala tenantId={businessId} activity={activity} />}
        </div>
    );
}
