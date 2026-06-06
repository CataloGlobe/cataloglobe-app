import { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { ReservationForm } from "./ReservationForm";
import type { V2Reservation } from "@/types/reservation";
import type { V2Activity } from "@/types/activity";

const FORM_ID = "reservation-form";

interface Props {
    open: boolean;
    onClose: () => void;
    mode: "create" | "edit";
    tenantId: string;
    /** Sedi gestibili dal caller (filtrate da `reservations.manage`). */
    manageableActivities: Array<Pick<V2Activity, "id" | "name">>;
    /** Riga corrente in edit mode. */
    selectedReservation?: V2Reservation;
    onSuccess: () => void | Promise<void>;
}

export default function ReservationCreateEditDrawer({
    open,
    onClose,
    mode,
    tenantId,
    manageableActivities,
    selectedReservation,
    onSuccess
}: Props) {
    const [isSaving, setIsSaving] = useState(false);

    const handleSuccess = async () => {
        await onSuccess();
        onClose();
    };

    return (
        <SystemDrawer open={open} onClose={onClose} width={520}>
            <DrawerLayout
                header={
                    <div>
                        <Text variant="title-sm" weight={600}>
                            {mode === "create"
                                ? "Nuova prenotazione"
                                : "Modifica prenotazione"}
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            {mode === "create"
                                ? "Inserisci una prenotazione telefonica o walk-in. Sarà confermata da subito."
                                : "Aggiorna i dettagli della prenotazione. Lo stato non viene modificato."}
                        </Text>
                    </div>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isSaving}>
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
                <ReservationForm
                    formId={FORM_ID}
                    mode={mode}
                    tenantId={tenantId}
                    manageableActivities={manageableActivities}
                    entityData={selectedReservation}
                    onSuccess={handleSuccess}
                    onSavingChange={setIsSaving}
                />
            </DrawerLayout>
        </SystemDrawer>
    );
}
