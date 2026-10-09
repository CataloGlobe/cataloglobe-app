import { useNavigate, useParams } from "react-router-dom";
import ReservationDetailDrawer from "./ReservationDetailDrawer";
import ReservationCreateEditDrawer from "./ReservationCreateEditDrawer";
import type { ReservationDesk } from "./hooks/useReservationDesk";
import type { V2Reservation } from "@/types/reservation";

/**
 * Il dettaglio della prenotazione (accanto all'elenco, D131) e il drawer
 * crea/modifica, legati a un banco (`useReservationDesk`). Li montano Prenotazioni e l'Elenco di
 * Servizio: gli stessi gesti, gli stessi testi, da tutte e due le pagine.
 */
interface Props {
    desk: ReservationDesk;
    /** La pagina sotto, per il ritorno al telefono: «‹ Prenotazioni». */
    backLabel: string;
    /** Le prenotazioni nell'ordine in cui la pagina le mostra, per ↑ ↓ (D131). */
    sequence?: V2Reservation[];
    /**
     * In alternativa a `sequence`: la pagina sposta lei il dettaglio (l'Elenco
     * di Servizio mescola prenotazioni e tavolate). Assente: niente frecce.
     */
    onStep?: (by: 1 | -1) => void;
    /** Con `onStep`: dove si è nell'elenco della pagina («2 di 5»). */
    position?: { index: number; total: number };
}

export default function ReservationDrawers({ desk, backLabel, sequence = [], onStep, position }: Props) {
    const navigate = useNavigate();
    const { businessId = "" } = useParams<{ businessId: string }>();
    const {
        selectedReservation: reservation,
        selectedActivity,
        detailSeating,
        detailGuest
    } = desk;

    const at = reservation ? sequence.findIndex(r => r.id === reservation.id) : -1;
    const step = (by: 1 | -1) => {
        if (onStep) return onStep(by);
        const from = at === -1 ? (by > 0 ? -1 : 0) : at;
        const next = sequence[(from + by + sequence.length) % sequence.length];
        if (next) desk.handleOpenDetail(next);
    };
    const canStep = onStep !== undefined || sequence.length > 1;

    return (
        <>
            <ReservationDetailDrawer
                backLabel={backLabel}
                onPrev={canStep ? () => step(-1) : undefined}
                onNext={canStep ? () => step(1) : undefined}
                position={onStep ? position : at >= 0 ? { index: at, total: sequence.length } : undefined}
                open={desk.isDrawerOpen}
                onClose={desk.handleCloseDrawer}
                reservation={reservation}
                activityName={reservation ? desk.activityNames.get(reservation.activity_id) ?? null : null}
                operatorNames={desk.operatorNames}
                tableView={reservation ? desk.tableViews.get(reservation.id) ?? null : null}
                seatingTableView={detailSeating === undefined ? undefined : detailSeating.view}
                seatingId={detailSeating === undefined ? undefined : detailSeating.id}
                tables={desk.selectedTables}
                tableOccupancy={desk.selectedTableOccupancy}
                onSetTables={desk.handleSetTables}
                onResetTables={desk.handleResetTables}
                allReservations={desk.effectiveReservations}
                activityCapacity={selectedActivity?.reservation_capacity ?? null}
                activityDurationMinutes={selectedActivity?.reservation_duration_minutes ?? undefined}
                canManage={reservation ? desk.canManageActivity(reservation.activity_id) : false}
                activityReminderEnabled={selectedActivity?.reservation_reminder_enabled}
                canManageSeatings={reservation ? desk.canManageSeatingsOn(reservation.activity_id) : false}
                onArrive={desk.handleArrive}
                onCompleteService={desk.handleCompleteService}
                onUndoArrival={desk.handleUndoArrival}
                seatingPartySize={detailSeating === undefined ? undefined : detailSeating.partySize}
                seatingPendingOrders={detailSeating === undefined ? undefined : detailSeating.pending}
                onSetSeatingPartySize={desk.handleSetSeatingPartySizeFromReservation}
                guestSummary={detailGuest}
                guestNote={desk.detailGuestNote}
                tenantWide={desk.tenantWide}
                onOpenGuest={
                    detailGuest
                        ? () => {
                              // La scheda completa vive nella pagina Clienti:
                              // il deep link `?guest=` la apre già aperta, così
                              // il link è condivisibile e la rubrica resta una
                              // sola implementazione. Il dettaglio resta
                              // nell'indirizzo: «indietro» torna alla
                              // prenotazione aperta.
                              navigate(`/business/${businessId}/guests?guest=${detailGuest.id}`);
                          }
                        : undefined
                }
                onAction={action => {
                    if (reservation) desk.handleAction(reservation, action);
                }}
                onEdit={reservation ? () => desk.handleOpenEdit(reservation) : undefined}
            />

            {desk.tenantId && (
                <ReservationCreateEditDrawer
                    open={desk.isCreateEditOpen}
                    onClose={desk.handleCloseCreateEdit}
                    mode={desk.createEditMode}
                    tenantId={desk.tenantId}
                    manageableActivities={desk.manageableActivities}
                    allReservations={desk.effectiveReservations}
                    selectedReservation={desk.editingReservation ?? undefined}
                    onSuccess={desk.handleCreateEditSuccess}
                    onDateChange={desk.setFormDate}
                />
            )}
        </>
    );
}
