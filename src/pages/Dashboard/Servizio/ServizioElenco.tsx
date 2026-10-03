import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/context/Toast/ToastContext";
import { usePermissions } from "@/context/usePermissions";
import { canDoOnActivity } from "@/lib/permissions";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { todayIsoDate } from "@/utils/dateLocal";
import {
    closeSeating,
    listSeatingsWithState,
    openWalkinSeating,
    setSeatingPartySize,
    setSeatingTables,
    undoSeating
} from "@/services/supabase/seatings";
import type { SeatingWithState } from "@/types/seating";
import { formatTableLabels } from "@/components/ui/TableAssignmentBadge/formatTableLabels";
import ReservationsService from "@/pages/Dashboard/Reservations/ReservationsService";
import ReservationsTodayStrip from "@/pages/Dashboard/Reservations/ReservationsTodayStrip";
import ReservationDrawers from "@/pages/Dashboard/Reservations/ReservationDrawers";
import SeatingDetailDrawer from "@/pages/Dashboard/Reservations/SeatingDetailDrawer";
import WalkinCreateDrawer from "@/pages/Dashboard/Reservations/WalkinCreateDrawer";
import type { SeatingCloseAction } from "@/pages/Dashboard/Reservations/seatingClose";
import { composeServiceBoard, seatingDisplayName } from "@/pages/Dashboard/Reservations/serviceBoard";
import { useReservationDesk } from "@/pages/Dashboard/Reservations/hooks/useReservationDesk";
import { useSeatingsRealtime } from "@/pages/Dashboard/Reservations/hooks/useSeatingsRealtime";

import styles from "./Servizio.module.scss";

/**
 * Elenco, il modo predefinito di Servizio (§18.2, lotto B-b): la sala del
 * momento — In sala adesso · In arrivo · Concluse — con le tavolate senza
 * prenotazione. Era la scheda Servizio di Prenotazioni: stessi gate, stessi
 * testi, stessi gesti. Una riga con una prenotazione apre il suo dettaglio
 * (lo stesso banco di Prenotazioni, `useReservationDesk`); una tavolata
 * senza prenotazione apre il drawer della tavolata.
 *
 * Il modo lo apre solo chi legge prenotazioni e tavolate su questa sede, col
 * piano che le comprende (`servizioModes.ts`).
 */
export default function ServizioElenco({ activityId }: { activityId: string }) {
    const { showToast } = useToast();
    const { permissions } = usePermissions();

    // ── La sala della sede ────────────────────────────────────────────
    // Il gate va PRIMA del fetch: la view è `security_invoker` e a chi non
    // può leggere risponde `[]`, non un errore — senza il pre-check, "nessuno
    // in sala" e "non puoi vederlo" sarebbero la stessa risposta.
    const canReadService = permissions ? canDoOnActivity(permissions, "seatings.read", activityId) : false;
    const canReadReservations = permissions ? canDoOnActivity(permissions, "reservations.read", activityId) : false;
    const serviceCanManage = permissions ? canDoOnActivity(permissions, "seatings.manage", activityId) : false;

    const [serviceSeatings, setServiceSeatings] = useState<SeatingWithState[] | null>(null);
    // Le scritture della tavolata dal drawer della prenotazione passano tutte
    // da `loadData` del banco, che ricarica prenotazioni e piano ma non la
    // sala: questo token la fa ricaricare insieme.
    const [serviceReloadToken, setServiceReloadToken] = useState(0);
    const reloadService = useCallback(() => setServiceReloadToken(t => t + 1), []);

    const desk = useReservationDesk({
        activityId,
        enabled: canReadReservations,
        // Walk-in e drawer della tavolata usano il picker dei tavoli.
        wantTablesFor: serviceCanManage ? activityId : null,
        onSalaChanged: reloadService
    });
    const { tenantId, effectiveReservations, tableLabel } = desk;

    const loadService = useCallback(async () => {
        if (!tenantId || !canReadService) return;
        try {
            const rows = await listSeatingsWithState(activityId, tenantId, { date: todayIsoDate() });
            setServiceSeatings(rows);
        } catch {
            showToast({ message: "Errore nel caricamento della sala.", type: "error" });
        }
    }, [tenantId, activityId, canReadService, showToast]);

    useEffect(() => {
        // Cambiare sede azzera la sala: la precedente non deve restare a
        // schermo sotto il nome della nuova mentre arriva il fetch.
        setServiceSeatings(null);
        if (!canReadService) return;
        void loadService();
    }, [canReadService, loadService, serviceReloadToken]);

    useSeatingsRealtime(activityId, canReadService, loadService);

    const serviceReservations = useMemo(
        () => effectiveReservations.filter(r => r.activity_id === activityId),
        [effectiveReservations, activityId]
    );

    const serviceBoard = useMemo(() => {
        if (serviceSeatings === null) return null;
        return composeServiceBoard({
            seatings: serviceSeatings,
            reservations: serviceReservations,
            today: todayIsoDate(),
            now: new Date()
        });
    }, [serviceSeatings, serviceReservations]);

    // ── La tavolata: drawer proprio (walk-in) e apertura senza prenotazione ──
    // La tavolata selezionata si legge DAL board, non da uno snapshot: così
    // il drawer segue il realtime (un collega la sposta, il drawer lo vede).
    const [isWalkinOpen, setIsWalkinOpen] = useState(false);
    const [isSeatingDrawerOpen, setIsSeatingDrawerOpen] = useState(false);
    const [selectedSeatingId, setSelectedSeatingId] = useState<string | null>(null);
    const selectedSeating = useMemo(
        () => (selectedSeatingId ? (serviceSeatings ?? []).find(s => s.id === selectedSeatingId) ?? null : null),
        [selectedSeatingId, serviceSeatings]
    );
    const serviceTables = desk.tablesByActivity.get(activityId);

    // table_id → chi lo occupa ADESSO (tavolate aperte), per il picker. Si
    // mostra, non si impedisce: la doppia occupazione è un fatto di sala che
    // va visto, non un errore da bloccare. Esclusa la tavolata che si sta
    // modificando: non può essere in conflitto con sé stessa.
    const serviceTableOccupancy = useMemo<ReadonlyMap<string, string>>(() => {
        const out = new Map<string, string>();
        for (const s of serviceBoard?.inRoom ?? []) {
            if (s.id === selectedSeatingId) continue;
            const name = seatingDisplayName(s);
            for (const t of s.tables) {
                const prev = out.get(t.table_id);
                out.set(t.table_id, prev ? `${prev}, ${name}` : name);
            }
        }
        return out;
    }, [serviceBoard, selectedSeatingId]);

    const handleOpenSeating = useCallback((s: SeatingWithState) => {
        setSelectedSeatingId(s.id);
        setIsSeatingDrawerOpen(true);
    }, []);

    // Stessa forma dei gesti del drawer della prenotazione: RPC → ricarica →
    // toast, ritorna true se riuscito. La ricarica passa dal token della
    // sala, che è l'unica cosa che una tavolata senza prenotazione può
    // cambiare.
    const handleOpenWalkin = useCallback(
        async (tableIds: string[], partySize: number | null): Promise<boolean> => {
            if (!tenantId) return false;
            try {
                await openWalkinSeating(activityId, tableIds, partySize, tenantId);
                reloadService();
                showToast({ message: "Tavolata aperta.", type: "success" });
                return true;
            } catch (err) {
                showToast({
                    message: err instanceof Error ? err.message : "Errore inatteso",
                    type: "error"
                });
                return false;
            }
        },
        [tenantId, activityId, reloadService, showToast]
    );

    const runSeatingGesture = useCallback(
        async (gesture: () => Promise<unknown>, successMessage: string, type: "success" | "info") => {
            try {
                await gesture();
                reloadService();
                showToast({ message: successMessage, type });
                return true;
            } catch (err) {
                showToast({
                    message: err instanceof Error ? err.message : "Errore inatteso",
                    type: "error"
                });
                return false;
            }
        },
        [reloadService, showToast]
    );

    const handleSeatingSetTables = useCallback(
        async (tableIds: string[]): Promise<boolean> => {
            if (!tenantId || !selectedSeatingId) return false;
            return runSeatingGesture(
                () => setSeatingTables(selectedSeatingId, tableIds, tenantId),
                tableIds.length === 0
                    ? "Tavolata senza tavolo."
                    : `Tavolata spostata a${tableIds.length > 1 ? "i" : "l"} ${formatTableLabels(
                          tableIds.map(id => tableLabel(id, activityId))
                      )}.`,
                "success"
            );
        },
        [tenantId, selectedSeatingId, runSeatingGesture, tableLabel, activityId]
    );

    const handleSeatingSetPartySize = useCallback(
        async (partySize: number): Promise<boolean> => {
            if (!tenantId || !selectedSeatingId) return false;
            return runSeatingGesture(
                () => setSeatingPartySize(selectedSeatingId, partySize, tenantId),
                `Coperti al tavolo: ${partySize}.`,
                "success"
            );
        },
        [tenantId, selectedSeatingId, runSeatingGesture]
    );

    const handleSeatingComplete = useCallback(
        async (action?: SeatingCloseAction): Promise<boolean> => {
            if (!tenantId || !selectedSeatingId) return false;
            return runSeatingGesture(
                () => closeSeating(selectedSeatingId, "operator", tenantId, action),
                "Servizio concluso.",
                "success"
            );
        },
        [tenantId, selectedSeatingId, runSeatingGesture]
    );

    const handleSeatingUndo = useCallback(async (): Promise<boolean> => {
        if (!tenantId || !selectedSeatingId) return false;
        return runSeatingGesture(
            () => undoSeating(selectedSeatingId, tenantId),
            "Apertura annullata. Per riaprirla: Senza prenotazione.",
            "info"
        );
    }, [tenantId, selectedSeatingId, runSeatingGesture]);

    // SOLO al primo caricamento, come Prenotazioni: dopo, la pagina resta in
    // piedi e si aggiorna sotto.
    if (desk.isLoading && !desk.hasLoadedOnce) {
        return (
            <div className={styles.elenco} aria-busy="true">
                <Skeleton height={76} radius="var(--radius-surface)" />
                <Skeleton height={160} radius="var(--radius-surface)" />
            </div>
        );
    }

    return (
        <>
            <div className={styles.elenco}>
                <ReservationsTodayStrip items={serviceReservations} />
                <ReservationsService
                    board={serviceBoard}
                    canRead={canReadService}
                    reservationsById={desk.reservationsById}
                    tableViews={desk.tableViews}
                    onOpenDetail={desk.handleOpenDetail}
                    onOpenSeating={handleOpenSeating}
                    onOpenWalkin={serviceCanManage ? () => setIsWalkinOpen(true) : undefined}
                />
            </div>

            <SeatingDetailDrawer
                open={isSeatingDrawerOpen}
                onClose={() => setIsSeatingDrawerOpen(false)}
                seating={selectedSeating}
                tables={serviceTables}
                tableOccupancy={serviceTableOccupancy}
                canManageSeatings={serviceCanManage}
                onSetTables={handleSeatingSetTables}
                onSetPartySize={handleSeatingSetPartySize}
                onComplete={handleSeatingComplete}
                onUndo={handleSeatingUndo}
            />

            <WalkinCreateDrawer
                open={isWalkinOpen}
                onClose={() => setIsWalkinOpen(false)}
                tables={serviceTables}
                occupiedBy={serviceTableOccupancy}
                onSubmit={handleOpenWalkin}
            />

            <ReservationDrawers desk={desk} />
        </>
    );
}
