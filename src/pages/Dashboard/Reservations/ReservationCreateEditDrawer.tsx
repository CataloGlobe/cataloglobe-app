import { useEffect, useId, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { UnsavedChangesDialog } from "@/components/ui/UnsavedChangesDialog/UnsavedChangesDialog";
import styles from "./Reservations.module.scss";
import { ReservationForm } from "./ReservationForm";
import type { V2Reservation } from "@/types/reservation";
import type { V2Activity } from "@/types/activity";

const FORM_ID = "reservation-form";

export interface ManageableActivityCapacity
    extends Pick<
        V2Activity,
        | "id"
        | "name"
        // Il pacing serve al form per l'avviso non bloccante: senza questi
        // campi l'host inserirebbe sopra il tetto senza saperlo.
        | "reservation_pacing_slot_minutes"
        | "reservation_pacing_max_covers"
        | "reservation_pacing_max_bookings"
    > {
    reservation_capacity: number | null;
    reservation_duration_minutes: number;
}

interface Props {
    open: boolean;
    onClose: () => void;
    mode: "create" | "edit";
    tenantId: string;
    /** Sedi gestibili dal caller (filtrate da `reservations.manage`),
     *  arricchite con i campi capacità per il warning over-capacity. */
    manageableActivities: ManageableActivityCapacity[];
    /** Prenotazioni correnti del tenant (per calcolare il picco). */
    allReservations: V2Reservation[];
    /** Riga corrente in edit mode. */
    selectedReservation?: V2Reservation;
    onSuccess: () => void | Promise<void>;
    /** Passa al form: la data che sta guardando, per caricarne il giorno. */
    onDateChange?: (iso: string | null) => void;
}

export default function ReservationCreateEditDrawer({
    open,
    onClose,
    mode,
    tenantId,
    manageableActivities,
    allReservations,
    selectedReservation,
    onSuccess,
    onDateChange
}: Props) {
    const [isSaving, setIsSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [confirmingExit, setConfirmingExit] = useState(false);
    const titleId = useId();

    useEffect(() => {
        if (!open) {
            setIsDirty(false);
            setConfirmingExit(false);
        }
    }, [open]);

    // Guardia di uscita (§27): Esc, backdrop, la X e «Annulla» chiedono prima
    // di buttare quello che si è scritto. Dopo un salvataggio si chiude e basta.
    const requestClose = () => {
        if (isDirty && !isSaving) setConfirmingExit(true);
        else onClose();
    };

    const handleSuccess = async () => {
        await onSuccess();
        onClose();
    };

    return (
        <SystemDrawer open={open} onClose={requestClose} size="md" aria-labelledby={titleId}>
            <DrawerLayout
                title={mode === "create" ? "Nuova prenotazione" : "Modifica prenotazione"}
                titleId={titleId}
                onClose={requestClose}
                footer={
                    <>
                        <Button variant="secondary" onClick={requestClose} disabled={isSaving}>
                            Annulla
                        </Button>
                        <Button
                            variant="primary"
                            type="submit"
                            form={FORM_ID}
                            loading={isSaving}
                        >
                            {mode === "create" ? "Crea prenotazione" : "Salva modifiche"}
                        </Button>
                    </>
                }
            >
                <Text as="p" variant="body-sm" colorVariant="muted" className={styles.drawerLead}>
                    {mode === "create"
                        ? "Inserisci una prenotazione telefonica o walk-in. Sarà confermata da subito."
                        : "Aggiorna i dettagli della prenotazione. Lo stato non viene modificato."}
                </Text>
                <ReservationForm
                    formId={FORM_ID}
                    mode={mode}
                    tenantId={tenantId}
                    manageableActivities={manageableActivities}
                    allReservations={allReservations}
                    entityData={selectedReservation}
                    onSuccess={handleSuccess}
                    onSavingChange={setIsSaving}
                    onDateChange={onDateChange}
                    onDirtyChange={setIsDirty}
                />
            </DrawerLayout>
            <UnsavedChangesDialog
                isOpen={confirmingExit}
                title="Uscire senza salvare?"
                message="La prenotazione non è stata salvata: quello che hai scritto andrà perso."
                cancelLabel="Resta"
                onCancel={() => setConfirmingExit(false)}
                onDiscard={() => {
                    setConfirmingExit(false);
                    onClose();
                }}
            />
        </SystemDrawer>
    );
}
