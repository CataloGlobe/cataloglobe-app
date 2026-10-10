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

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { BookUser, Search, UserRoundX } from "lucide-react";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { usePermissions } from "@/context/usePermissions";
import { canDoOnActivity, canDoOnAnyActivity, isTenantWide } from "@/lib/permissions";
import { usePlanFeatures } from "@/lib/planFeatures";
import { PageGate } from "@/components/PageGate/PageGate";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import { Button } from "@/components/ui/Button/Button";
import { Chip } from "@/components/ui/Chip/Chip";
import { ChipGroupSingle } from "@/components/ui/Chip/ChipGroup";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { Select } from "@/components/ui/Select/Select";
import Text from "@/components/ui/Text/Text";
import {
    DIRECTORY_LIMIT,
    getReservationGuest,
    listGuestVisitMarks,
    listReservationGuestNotesForGuests,
    listReservationGuests,
    type GuestVisitMark
} from "@/services/supabase/reservationGuests";
import { getActivitiesCached } from "@/hooks/activitiesCache";
import { useDetailParam } from "@/hooks/useDetailParam";
import type { V2Activity } from "@/types/activity";
import type { ReservationGuestSummary, V2ReservationGuestNote } from "@/types/reservationGuest";
import GuestsDirectory from "./GuestsDirectory";
import GuestDrawer, { type GuestNoteActivity } from "./GuestDrawer";
import { mergeGuestTags } from "./guestTags";
import { isLost, matchesGuestFilter, summarizeGuestVisits, type GuestFilter } from "./guestActivity";
import styles from "./Guests.module.scss";

/** «Chi non torna» in cima: si ricorda, come le altre preferenze di vista. */
const LOST_LINE_KEY = "guests_lost_line";

const FILTER_LABELS: { value: GuestFilter; label: string; warning?: boolean }[] = [
    { value: "all", label: "Tutti" },
    { value: "regular", label: "Abituali" },
    { value: "new", label: "Nuovi nel mese" },
    { value: "lost", label: "Non tornano da 3 mesi", warning: true },
    { value: "absent", label: "Con assenze", warning: true }
];

function readLostLine(): boolean {
    try {
        return localStorage.getItem(LOST_LINE_KEY) !== "off";
    } catch {
        return true;
    }
}

export default function Guests() {
    const tenantId = useTenantId();
    const { showToast } = useToast();
    const { hasFeature } = usePlanFeatures();
    const { permissions, loading: permissionsLoading } = usePermissions();

    const canRead = permissions
        ? canDoOnAnyActivity(permissions, "guests.read")
        : false;
    // Owner/admin vedono l'intera azienda: a loro il "nelle tue sedi" sarebbe
    // rumore. Agli altri serve, perché i loro numeri sono parziali per
    // costruzione.
    const tenantWide = permissions ? isTenantWide(permissions) : false;

    const [guests, setGuests] = useState<ReservationGuestSummary[]>([]);
    // Note ed etichette per sede delle persone in elenco: le etichette sono
    // l'unione delle sedi visibili a chi guarda (FASE 5.3), le note dicono
    // «da sapere». A quale sede appartengono, lo dice la scheda.
    const [notes, setNotes] = useState<V2ReservationGuestNote[]>([]);
    // Le visite dei clienti in elenco: pallini dei 12 mesi, sedi, chi non torna.
    const [marks, setMarks] = useState<GuestVisitMark[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    // Distingue "non ho ancora niente da mostrare" da "sto aggiornando ciò che
    // già mostro": una ricarica non sostituisce l'elenco con lo scheletro.
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
    const [search, setSearch] = useState("");
    // useDeferredValue e non un timer manuale: React salta i valori intermedi
    // mentre si digita, senza reintrodurre il debounce a mano che il progetto
    // ha già eliminato altrove.
    const deferredSearch = useDeferredValue(search);
    const [searchOpen, setSearchOpen] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (searchOpen) searchRef.current?.focus();
    }, [searchOpen]);

    const [filter, setFilter] = useState<GuestFilter>("all");
    const [sedeFilter, setSedeFilter] = useState("");
    const [lostLine, setLostLine] = useState(readLostLine);
    const toggleLostLine = useCallback((on: boolean) => {
        setLostLine(on);
        try {
            localStorage.setItem(LOST_LINE_KEY, on ? "on" : "off");
        } catch {
            // Senza memoria del browser la scelta vale per questa visita.
        }
    }, []);

    // Il cliente aperto sta nell'indirizzo (`?guest=<id>`, D131): è anche il
    // link con cui il dettaglio della prenotazione porta qui.
    const [selectedGuestId, openGuestDetail, closeGuestDetail] = useDetailParam("guest");
    // Fuori dall'elenco (link da una prenotazione, elenco filtrato o troncato)
    // il profilo si rilegge per id e si tiene qui.
    const [fetchedGuest, setFetchedGuest] = useState<ReservationGuestSummary | null>(null);

    // Gate di piano. Oggi la rubrica si popola solo dalle prenotazioni, quindi
    // il gate è lo stesso: `table_reservation`. Prima era ereditato dalla
    // pagina Prenotazioni; da pagina autonoma va dichiarato qui, altrimenti la
    // rubrica resterebbe raggiungibile fuori dal piano che la produce.
    const isLocked = !hasFeature("table_reservation");

    const loadGuests = useCallback(async () => {
        if (!tenantId || !canRead) return;
        setIsLoading(true);
        setLoadError(false);
        try {
            const rows = await listReservationGuests(tenantId, deferredSearch);
            const ids = rows.map(g => g.id);
            const [noteRows, markRows] = await Promise.all([
                listReservationGuestNotesForGuests(tenantId, ids),
                listGuestVisitMarks(tenantId, ids)
            ]);
            setGuests(rows);
            setNotes(noteRows);
            setMarks(markRows);
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

    // Il profilo si prende dall'elenco quando c'è; altrimenti (link da una
    // prenotazione, elenco filtrato o troncato) si rilegge per id.
    // Si legge dall'indirizzo e basta: aprire un altro cliente è cambiare
    // `?guest=`, così la guardia sulle note non salvate (nel layout) ferma
    // anche il clic su un'altra riga e l'indietro del browser.
    const selectedGuest = useMemo(() => {
        if (!selectedGuestId) return null;
        const inList = guests.find(g => g.id === selectedGuestId);
        if (inList) return inList;
        return fetchedGuest?.id === selectedGuestId ? fetchedGuest : null;
    }, [selectedGuestId, guests, fetchedGuest]);

    useEffect(() => {
        if (!selectedGuestId || selectedGuest) return;
        if (!tenantId || !canRead || isLocked) return;
        let alive = true;
        getReservationGuest(selectedGuestId, tenantId)
            .then(g => {
                if (alive) setFetchedGuest(g);
            })
            .catch(() => {
                if (alive) {
                    showToast({ message: "Scheda cliente non trovata.", type: "error" });
                    closeGuestDetail();
                }
            });
        return () => { alive = false; };
    }, [selectedGuestId, selectedGuest, tenantId, canRead, isLocked, showToast, closeGuestDetail]);

    // Oggi, una volta: i filtri e i pallini contano i giorni da qui.
    const today = useMemo(() => new Date(), []);
    const tagsByGuest = useMemo(() => mergeGuestTags(notes), [notes]);
    const activityByGuest = useMemo(() => summarizeGuestVisits(marks, today), [marks, today]);
    // «Da sapere»: le etichette (tranne «abituale», che è già un segno) e le
    // note, di tutte le sedi visibili.
    const knowByGuest = useMemo(() => {
        const out = new Map<string, string>();
        for (const [id, tags] of tagsByGuest) {
            const t = tags.filter(x => x.trim().toLowerCase() !== "abituale");
            if (t.length) out.set(id, t.join(" · "));
        }
        for (const n of notes) {
            if (!n.notes?.trim()) continue;
            const cur = out.get(n.guest_id);
            out.set(n.guest_id, cur ? `${cur} · ${n.notes.trim()}` : n.notes.trim());
        }
        return out;
    }, [tagsByGuest, notes]);

    const inSede = useCallback(
        (g: ReservationGuestSummary) => !sedeFilter || (activityByGuest.get(g.id)?.sedi.some(s => s.id === sedeFilter) ?? false),
        [sedeFilter, activityByGuest]
    );
    const counts = useMemo(() => {
        const c: Record<GuestFilter, number> = { all: 0, regular: 0, new: 0, lost: 0, absent: 0 };
        for (const g of guests) {
            if (!inSede(g)) continue;
            for (const f of FILTER_LABELS) {
                if (matchesGuestFilter(f.value, g, activityByGuest.get(g.id), tagsByGuest.get(g.id), today)) c[f.value] += 1;
            }
        }
        return c;
    }, [guests, inSede, activityByGuest, tagsByGuest, today]);
    const shownGuests = useMemo(
        () =>
            guests.filter(
                g => inSede(g) && matchesGuestFilter(filter, g, activityByGuest.get(g.id), tagsByGuest.get(g.id), today)
            ),
        [guests, inSede, filter, activityByGuest, tagsByGuest, today]
    );
    const lostRegulars = useMemo(
        () => guests.filter(g => isLost(activityByGuest.get(g.id), today)).length,
        [guests, activityByGuest, today]
    );

    const handleOpenGuest = useCallback(
        (guest: ReservationGuestSummary) => openGuestDetail(guest.id),
        [openGuestDetail]
    );

    // ↑ ↓ nel dettaglio: il cliente prima e dopo nell'elenco mostrato. Fuori
    // dall'elenco (aperto da un link) le frecce non ci sono.
    const guestIndex = selectedGuestId ? shownGuests.findIndex(g => g.id === selectedGuestId) : -1;
    const stepGuest = (by: number) => {
        const next = shownGuests[guestIndex + by];
        if (next) handleOpenGuest(next);
    };

    // Note e tag salvati nel drawer: si rileggono le etichette dell'elenco
    // (unione per sede), non si patcha a mano — la regola di unione sta in
    // un posto solo.
    const handleSaved = useCallback(() => {
        if (!tenantId) return;
        listReservationGuestNotesForGuests(tenantId, guests.map(g => g.id))
            .then(setNotes)
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
    const isFiltered = isSearching || filter !== "all" || sedeFilter !== "";
    const clearFilters = () => {
        setSearch("");
        setFilter("all");
        setSedeFilter("");
    };
    const showTools = !loadError && hasLoadedOnce && (guests.length > 0 || isFiltered);
    const sedeOptions = [
        { value: "", label: "Passati da: tutte le sedi" },
        ...noteActivities.map(a => ({ value: a.id, label: `Passati da: ${a.name}` }))
    ];

    return (
        <>
            <div className={styles.page}>
                {/* ── Cerca a sinistra, «Chi non torna» a destra (D154) ── */}
                {showTools && (
                    <div className={styles.bar}>
                        {searchOpen || search ? (
                            // Si richiude da sola uscendo, se è rimasta vuota.
                            <div onBlur={() => setSearchOpen(false)}>
                                <ToolbarSearch
                                    ref={searchRef}
                                    value={search}
                                    onChange={setSearch}
                                    placeholder="Cerca un cliente"
                                    width="min"
                                />
                            </div>
                        ) : (
                            <Button
                                variant="ghost"
                                size="sm"
                                leftIcon={<Search size={15} aria-hidden />}
                                onClick={() => setSearchOpen(true)}
                            >
                                Cerca un cliente
                            </Button>
                        )}
                        <label className={styles.lostToggle}>
                            <input type="checkbox" checked={lostLine} onChange={e => toggleLostLine(e.target.checked)} />
                            «Chi non torna» in cima
                        </label>
                    </div>
                )}

                {showTools && lostLine && lostRegulars > 0 && (
                    <div className={styles.lostLine} role="note">
                        <UserRoundX size={18} aria-hidden className={styles.lostIcon} />
                        <span>
                            <b>
                                {lostRegulars === 1
                                    ? "1 cliente abituale non torna da più di 3 mesi."
                                    : `${lostRegulars} clienti abituali non tornano da più di 3 mesi.`}
                            </b>{" "}
                            Venivano spesso: una telefonata li riporta.
                        </span>
                        <Chip
                            label="Vedi chi"
                            tone="warning"
                            className={styles.lostAction}
                            onClick={() => setFilter("lost")}
                        />
                    </div>
                )}

                {showTools && (
                    <div className={styles.filters}>
                        <ChipGroupSingle
                            ariaLabel="Quali clienti"
                            value={filter}
                            onChange={setFilter}
                            options={FILTER_LABELS.map(f => ({
                                value: f.value,
                                label: f.label,
                                count: counts[f.value],
                                tone: f.warning ? ("warning" as const) : undefined
                            }))}
                        />
                        {noteActivities.length > 1 && (
                            <Select
                                aria-label="Passati da"
                                containerClassName={styles.sede}
                                selectClassName={styles.sedeSelect}
                                value={sedeFilter}
                                onChange={e => setSedeFilter(e.target.value)}
                                options={sedeOptions}
                            />
                        )}
                    </div>
                )}

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
                ) : (
                    <GuestsDirectory
                        guests={shownGuests}
                        tagsByGuest={tagsByGuest}
                        activityByGuest={activityByGuest}
                        knowByGuest={knowByGuest}
                        today={today}
                        isLoading={isLoading}
                        hasLoadedOnce={hasLoadedOnce}
                        isFiltered={isFiltered}
                        onClearFilters={clearFilters}
                        onOpenGuest={handleOpenGuest}
                        selectedGuestId={selectedGuestId}
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
                    open
                    onClose={closeGuestDetail}
                    onPrev={guestIndex > 0 ? () => stepGuest(-1) : undefined}
                    onNext={guestIndex >= 0 && guestIndex < shownGuests.length - 1 ? () => stepGuest(1) : undefined}
                    position={guestIndex >= 0 ? { index: guestIndex, total: shownGuests.length } : undefined}
                    activity={activityByGuest.get(selectedGuest.id)}
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
