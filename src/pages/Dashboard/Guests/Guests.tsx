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
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { List as ListIcon, Lock, Table2 } from "lucide-react";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { usePermissions } from "@/context/PermissionsContext";
import { usePageHeader } from "@/context/usePageHeader";
import { canDoOnAnyActivity, isTenantWide } from "@/lib/permissions";
import { usePlanFeatures } from "@/lib/planFeatures";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { Button } from "@/components/ui/Button/Button";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import {
    getReservationGuest,
    listReservationGuests
} from "@/services/supabase/reservationGuests";
import type { ReservationGuestSummary } from "@/types/reservationGuest";
import GuestsDirectory from "./GuestsDirectory";
import GuestsTable from "./GuestsTable";
import GuestDrawer from "./GuestDrawer";
import styles from "./Guests.module.scss";

type GuestsViewMode = "rows" | "table";

/** Stessa convenzione di `businesses_view_mode` su Sedi. */
const VIEW_MODE_KEY = "guests_view_mode";

export default function Guests() {
    const tenantId = useTenantId();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const { businessId = "" } = useParams<{ businessId: string }>();
    const { hasFeature } = usePlanFeatures();
    const { permissions, loading: permissionsLoading } = usePermissions();
    const [searchParams, setSearchParams] = useSearchParams();

    const canRead = permissions
        ? canDoOnAnyActivity(permissions, "guests.read")
        : false;
    const canManage = permissions
        ? canDoOnAnyActivity(permissions, "guests.manage")
        : false;
    // Owner/admin vedono l'intera azienda: a loro il "nelle tue sedi" sarebbe
    // rumore. Agli altri serve, perché i loro numeri sono parziali per
    // costruzione.
    const tenantWide = permissions ? isTenantWide(permissions) : false;

    const [guests, setGuests] = useState<ReservationGuestSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
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
    usePageHeader(isLocked ? null : { actions: headerActions, sticky: true });

    const loadGuests = useCallback(async () => {
        if (!tenantId || !canRead) return;
        setIsLoading(true);
        try {
            setGuests(await listReservationGuests(tenantId, deferredSearch));
        } catch {
            showToast({ message: "Errore nel caricamento della rubrica.", type: "error" });
        } finally {
            setIsLoading(false);
        }
    }, [tenantId, canRead, deferredSearch, showToast]);

    useEffect(() => {
        // Skip fetch pre-check: senza `guests.read` non si chiama la query per
        // farsi rispondere zero righe.
        if (permissionsLoading || !permissions || !canRead || isLocked) {
            setIsLoading(false);
            return;
        }
        void loadGuests();
    }, [permissionsLoading, permissions, canRead, isLocked, loadGuests]);

    // Deep link `?guest=<id>`: è così che il drawer della prenotazione porta
    // qui. Il profilo viene riletto per id invece di essere cercato
    // nell'elenco, che potrebbe non contenerlo (elenco filtrato o troncato).
    const deepLinkGuestId = searchParams.get("guest");

    useEffect(() => {
        if (!deepLinkGuestId || !tenantId || !canRead) return;
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
    }, [deepLinkGuestId, tenantId, canRead, showToast]);

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

    const handleSaved = useCallback(
        (updated: { venue_notes: string | null; tags: string[] }) => {
            setSelectedGuest(prev => (prev ? { ...prev, ...updated } : prev));
            setGuests(prev =>
                prev.map(g => (g.id === selectedGuest?.id ? { ...g, ...updated } : g))
            );
        },
        [selectedGuest?.id]
    );

    // ── Render ────────────────────────────────────────────────────────

    if (isLocked) {
        return (
            <div className={styles.lockedWrap}>
                <EmptyState
                    icon={<Lock size={40} strokeWidth={1.5} />}
                    title="La rubrica clienti è una funzione Pro"
                    description="Riconosci chi torna, ritrova le allergie annotate e vedi chi non si è presentato. Si popola da sola con le prenotazioni. Disponibile con il piano Pro."
                    action={
                        <Button
                            variant="primary"
                            onClick={() => navigate(`/business/${businessId}/subscription`)}
                        >
                            Passa a Pro
                        </Button>
                    }
                />
            </div>
        );
    }

    if (!permissionsLoading && permissions && !canRead) {
        return (
            <div className={styles.lockedWrap}>
                <EmptyState
                    icon={<Lock size={40} strokeWidth={1.5} />}
                    title="Non hai accesso alla rubrica clienti"
                    description="La rubrica raccoglie i clienti di tutta l'azienda, quindi richiede un permesso dedicato. Contatta il proprietario o un amministratore se ti serve."
                />
            </div>
        );
    }

    return (
        <>
            <div className={styles.page}>
                {viewMode === "table" ? (
                    <GuestsTable
                        guests={guests}
                        isLoading={isLoading}
                        isSearching={search.trim().length > 0}
                        onOpenGuest={handleOpenGuest}
                        tenantWide={tenantWide}
                    />
                ) : (
                    <GuestsDirectory
                        guests={guests}
                        isLoading={isLoading}
                        isSearching={search.trim().length > 0}
                        onOpenGuest={handleOpenGuest}
                        tenantWide={tenantWide}
                    />
                )}
            </div>

            {tenantId && (
                <GuestDrawer
                    open={isDrawerOpen}
                    onClose={handleCloseDrawer}
                    guest={selectedGuest}
                    tenantId={tenantId}
                    canManage={canManage}
                    tenantWide={tenantWide}
                    onSaved={handleSaved}
                />
            )}
        </>
    );
}
