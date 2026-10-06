import { useNavigate, useParams } from "react-router-dom";
import ReservationDetailDrawer from "./ReservationDetailDrawer";
import ReservationCreateEditDrawer from "./ReservationCreateEditDrawer";
import type { ReservationDesk } from "./hooks/useReservationDesk";

/**
 * I due drawer della prenotazione (dettaglio, crea/modifica), legati a un
 * banco (`useReservationDesk`). Li montano Prenotazioni e l'Elenco di
 * Servizio: gli stessi gesti, gli stessi testi, da tutte e due le pagine.
 */
export default function ReservationDrawers({ desk }: { desk: ReservationDesk }) {
    const navigate = useNavigate();
    const { businessId = "" } = useParams<{ businessId: string }>();
    const {
        selectedReservation: reservation,
        selectedActivity,
        detailSeating,
        detailGuest
    } = desk;

    return (
        <>
            <ReservationDetailDrawer
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
                              // sola implementazione.
                              desk.handleCloseDrawer();
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
