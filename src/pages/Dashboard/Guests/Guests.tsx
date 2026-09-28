// Rubrica clienti — pagina.
//
// PERCHÉ UNA PAGINA E NON UNA TAB DENTRO PRENOTAZIONI
// I profili nascono oggi dalle prenotazioni, ma è già previsto che arrivino
// anche dagli ordini al tavolo: sono clienti del locale, non clienti delle
// prenotazioni. Metterla sotto Prenotazioni avrebbe significato spostarla
// dopo, con i link già in circolazione. In più una voce di menu si scopre,
// una tab dentro un'altra sezione no.
//
// AMBITO DEI CONTEGGI: le view sono `security_invoker`, quindi visite e
// assenze sono filtrate sulle sedi del chiamante. Ogni numero passa da
// `formatVisitCount`/`formatAbsenceCount`, che qualificano con "nelle tue
// sedi" i ruoli activity-scoped. Vedi `@/utils/guestVisibilityCopy`.
//
// VINCOLI DI PRODOTTO: nessuna esportazione, nessuna selezione multipla,
// nessuna azione di invio. La rubrica serve a erogare il servizio; per il
// marketing servirebbe un consenso separato che oggi non raccogliamo.

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BookUser, List as ListIcon, Table2 } from "lucide-react";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { usePermissions } from "@/context/PermissionsContext";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { canDoOnActivity, canDoOnAnyActivity, isTenantWide } from "@/lib/permissions";
import { usePlanFeatures } from "@/lib/planFeatures";
import { PageGate } from "@/components/PageGate/PageGate";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { Button } from "@/components/ui/Button/Button";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import Text from "@/components/ui/Text/Text";
import {
    DIRECTORY_LIMIT,
    getReservationGuest,
    listReservationGuestNotesForGuests,
    listReservationGuests
} from "@/services/supabase/reservationGuests";
import { getActivitiesCached } from "@/hooks/activitiesCache";
import type { V2Activity } from "@/types/activity";
import type { ReservationGuestSummary } from "@/types/reservationGuest";
import GuestsDirectory from "./GuestsDirectory";
import GuestsTable from "./GuestsTable";
import GuestDrawer, { type GuestNoteActivity } from "./GuestDrawer";
import { mergeGuestTags } from "./guestTags";
import styles from "./Guests.module.scss";

type GuestsViewMode = "rows" | "table";

/** Stessa convenzione di `businesses_view_mode` su Sedi. */
const VIEW_MODE_KEY = "guests_view_mode";

export default function Guests() {
    const tenantId = useTenantId();
    const { showToast } = useToast();
    const { hasFeature } = usePlanFeatures();
    const { permissions, loading: permissionsLoading } = usePermissions();
    const [searchParams, setSearchParams] = useSearchParams();

    const canRead = permissions
        ? canDoOnAnyActivity(permissions, "guests.read")
        : false;
    // Owner/admin vedono l'intera azienda: a loro il "nelle tue sedi" sarebbe
    // rumore. Agli altri serve, perché i loro numeri sono parziali per
    // costruzione.
    const tenantWide = permissions ? isTenantWide(permissions) : false;

    const [guests, setGuests] = useState<ReservationGuestSummary[]>([]);
    // Etichette per ospite, unione delle sedi visibili a chi guarda: note e
    // tag sono per sede (FASE 5.3), l'elenco è dell'azienda. Un tag compare
    // qui se c'è in almeno una delle proprie sedi; a quale, lo dice la scheda.
    const [tagsByGuest, setTagsByGuest] = useState<ReadonlyMap<string, string[]>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    // Distingue "non ho ancora niente da mostrare" da "sto aggiornando ciò che
    // già mostro". Vive qui e scende come prop alle due viste, così tabella e
    // griglia si comportano allo stesso modo: senza, la griglia sostituiva
    // l'intero elenco con lo scheletro a ogni ricarica mentre la tabella
    // teneva il layout. Stessa forma di `Reservations.tsx`.
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
    const [search, setSearch] = useState("");
    // useDeferredValue e non un timer manuale: React salta i valori intermedi
    // mentre si digita, senza reintrodurre il debounce a mano che il progetto
    // ha già eliminato altrove.
    const deferredSearch = useDeferredValue(search);

    // Righe di default: si legge una persona alla volta, ed è quello che fa un
    // operatore prima del servizio. La tabella serve a confrontare molte righe
    // sulla stessa colonna, ed è una scelta che chi la vuole fa una volta —
    // per questo la preferenza si ricorda, come su Sedi.
    const [viewMode, setViewMode] = useState<GuestsViewMode>(() => {
        const saved = localStorage.getItem(VIEW_MODE_KEY);
        return saved === "table" || saved === "rows" ? saved : "rows";
    });

    const handleViewChange = useCallback((next: GuestsViewMode) => {
        setViewMode(next);
        localStorage.setItem(VIEW_MODE_KEY, next);
    }, []);

    const [selectedGuest, setSelectedGuest] = useState<ReservationGuestSummary | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    // Gate di piano. Oggi la rubrica si popola solo dalle prenotazioni, quindi
    // il gate è lo stesso: `table_reservation`. Prima era ereditato dalla
    // pagina Prenotazioni; da pagina autonoma va dichiarato qui, altrimenti la
    // rubrica resterebbe raggiungibile fuori dal piano che la produce.
    const isLocked = !hasFeature("table_reservation");

    // La ricerca vive nella barra azioni dell'header, come su Sedi e Prodotti:
    // stesso `ToolbarSearch`, stessa altezza del cluster di controlli. Nessuna
    // azione primaria accanto — non esiste un "Nuovo cliente": le schede si
    // creano da sole, e nessun pulsante di esportazione o invio.
    const headerActions = useMemo(
        () => (
            <>
                <ToolbarSearch
                    value={search}
                    onChange={setSearch}
                    placeholder="Cerca cliente..."
                />
                <SegmentedControl<GuestsViewMode>
                    iconsOnly
                    value={viewMode}
                    onChange={handleViewChange}
                    options={[
                        { value: "rows", label: "Vista righe", icon: <ListIcon size={16} /> },
                        { value: "table", label: "Vista tabella", icon: <Table2 size={16} /> }
                    ]}
                />
            </>
        ),
        [search, viewMode, handleViewChange]
    );

    // Niente `title`/`subtitle`: `PageHeaderSlot` li ignora per scelta
    // (rende solo `leading` e `actions`; il titolo vive nel breadcrumb della
    // navbar post-refactor). Passarli darebbe l'illusione di una intestazione
    // che nessuno renderizza.
    // Nessuna tab e nessuna CTA: in compatto la riga resta lente + toggle vista.
    // `primaryAction` omesso di proposito — la rubrica non ha un'azione di
    // creazione, i clienti nascono dalle prenotazioni.
    const headerCompact = useMemo<PageHeaderCompactConfig>(() => ({
        search: {
            value: search,
            onChange: setSearch,
            placeholder: "Cerca cliente..."
        },
        persistentIcons: [
            viewMode === "rows"
                ? { icon: <Table2 size={18} />, label: "Vista tabella", onClick: () => handleViewChange("table") }
                : { icon: <ListIcon size={18} />, label: "Vista righe", onClick: () => handleViewChange("rows") }
        ]
    }), [search, viewMode, handleViewChange]);

    // Ricerca e vista solo a chi legge la rubrica: sulla schermata bloccata
    // (piano o permesso) la testata resta vuota.
    const showHeader = !isLocked && canRead;
    usePageHeader(showHeader ? { actions: headerActions, compact: headerCompact } : null);

    const loadGuests = useCallback(async () => {
        if (!tenantId || !canRead) return;
        setIsLoading(true);
        setLoadError(false);
        try {
            const rows = await listReservationGuests(tenantId, deferredSearch);
            setGuests(rows);
            const notes = await listReservationGuestNotesForGuests(tenantId, rows.map(g => g.id));
            setTagsByGuest(mergeGuestTags(notes));
        } catch (error) {
            // Un errore non è una rubrica vuota: la pagina lo dice, con «Riprova».
            console.error("Caricamento rubrica clienti:", error);
            setLoadError(true);
        } finally {
            setIsLoading(false);
            setHasLoadedOnce(true);
        }
    }, [tenantId, canRead, deferredSearch]);

    useEffect(() => {
        // Skip fetch pre-check: senza `guests.read` non si chiama la query per
        // farsi rispondere zero righe.
        // Finché i permessi non ci sono resta lo scheletro: niente vuoto finto.
        if (permissionsLoading || !permissions || !canRead || isLocked) return;
        void loadGuests();
    }, [permissionsLoading, permissions, canRead, isLocked, loadGuests]);

    // Le sedi del drawer: quelle con `guests.read`, con il diritto di scrivere
    // deciso sede per sede. La cache è la stessa della navbar.
    const [activities, setActivities] = useState<V2Activity[]>([]);
    useEffect(() => {
        if (!tenantId || !canRead || isLocked) return;
        let alive = true;
        getActivitiesCached(tenantId)
            .then(rows => { if (alive) setActivities(rows); })
            .catch(() => {
                if (alive) showToast({ message: "Errore nel caricamento delle sedi.", type: "error" });
            });
        return () => { alive = false; };
    }, [tenantId, canRead, isLocked, showToast]);

    const noteActivities = useMemo<GuestNoteActivity[]>(() => {
        if (!permissions) return [];
        return activities
            .filter(a => canDoOnActivity(permissions, "guests.read", a.id))
            .map(a => ({
                id: a.id,
                name: a.name,
                canManage: canDoOnActivity(permissions, "guests.manage", a.id)
            }));
    }, [activities, permissions]);

    // Deep link `?guest=<id>`: è così che il drawer della prenotazione porta
    // qui. Il profilo viene riletto per id invece di essere cercato
    // nell'elenco, che potrebbe non contenerlo (elenco filtrato o troncato).
    const deepLinkGuestId = searchParams.get("guest");

    useEffect(() => {
        if (!deepLinkGuestId || !tenantId || !canRead || isLocked) return;
        let alive = true;
        getReservationGuest(deepLinkGuestId, tenantId)
            .then(g => {
                if (!alive) return;
                setSelectedGuest(g);
                setIsDrawerOpen(true);
            })
            .catch(() => {
                if (alive) {
                    showToast({ message: "Scheda cliente non trovata.", type: "error" });
                }
            });
        return () => { alive = false; };
    }, [deepLinkGuestId, tenantId, canRead, isLocked, showToast]);

    const handleOpenGuest = useCallback((guest: ReservationGuestSummary) => {
        setSelectedGuest(guest);
        setIsDrawerOpen(true);
    }, []);

    const handleCloseDrawer = useCallback(() => {
        setIsDrawerOpen(false);
        // Il parametro va tolto: senza, riaprire la stessa scheda dopo averla
        // chiusa non funzionerebbe (l'URL è già su quel valore).
        if (searchParams.has("guest")) {
            setSearchParams(
                prev => {
                    prev.delete("guest");
                    return prev;
                },
                { replace: true }
            );
        }
    }, [searchParams, setSearchParams]);

    // Note e tag salvati nel drawer: si rileggono le etichette dell'elenco
    // (unione per sede), non si patcha a mano — la regola di unione sta in
    // un posto solo.
    const handleSaved = useCallback(() => {
        if (!tenantId) return;
        listReservationGuestNotesForGuests(tenantId, guests.map(g => g.id))
            .then(notes => setTagsByGuest(mergeGuestTags(notes)))
            .catch(() => {
                showToast({ message: "Errore nel caricamento delle etichette.", type: "error" });
            });
    }, [tenantId, guests, showToast]);

    // ── Render ────────────────────────────────────────────────────────

    // Piano e permesso in un solo cancello (§50.14): «Passa a Pro» solo a chi
    // gestisce l'abbonamento, il blocco di permesso con la frase di sistema.
    if (isLocked || (!permissionsLoading && permissions && !canRead)) {
        return (
            <PageGate feature="table_reservation" readPermission="guests.read">
                {() => null}
            </PageGate>
        );
    }

    const isSearching = search.trim().length > 0;
    const clearSearch = () => setSearch("");

    return (
        <>
            <div className={styles.page}>
                {loadError ? (
                    <EmptyState
                        variant="page"
                        icon={<BookUser />}
                        title="Non è stato possibile caricare la rubrica"
                        description="Controlla la connessione e riprova."
                        action={
                            <Button variant="secondary" onClick={() => void loadGuests()}>
                                Riprova
                            </Button>
                        }
                    />
                ) : viewMode === "table" ? (
                    <GuestsTable
                        guests={guests}
                        tagsByGuest={tagsByGuest}
                        isLoading={isLoading}
                        hasLoadedOnce={hasLoadedOnce}
                        isSearching={isSearching}
                        onClearSearch={clearSearch}
                        onOpenGuest={handleOpenGuest}
                        tenantWide={tenantWide}
                    />
                ) : (
                    <GuestsDirectory
                        guests={guests}
                        tagsByGuest={tagsByGuest}
                        isLoading={isLoading}
                        hasLoadedOnce={hasLoadedOnce}
                        isSearching={isSearching}
                        onClearSearch={clearSearch}
                        onOpenGuest={handleOpenGuest}
                        tenantWide={tenantWide}
                    />
                )}

                {/* Il tetto della lista, detto (C2): oltre i 200 più recenti
                    i clienti non spariscono, si trovano cercando. */}
                {!loadError && guests.length >= DIRECTORY_LIMIT && (
                    <Text as="p" variant="caption" colorVariant="muted">
                        Mostrati i {DIRECTORY_LIMIT} clienti più recenti: cerca per trovare gli altri.
                    </Text>
                )}
            </div>

            {tenantId && selectedGuest && (
                <GuestDrawer
                    open={isDrawerOpen}
                    onClose={handleCloseDrawer}
                    guest={selectedGuest}
                    tenantId={tenantId}
                    activities={noteActivities}
                    tenantWide={tenantWide}
                    onSaved={handleSaved}
                />
            )}
        </>
    );
}
