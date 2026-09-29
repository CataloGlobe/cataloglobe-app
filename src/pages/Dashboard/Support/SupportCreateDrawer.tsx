import { useEffect, useId, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { UnsavedChangesDialog } from "@/components/ui/UnsavedChangesDialog/UnsavedChangesDialog";
import { SupportTicketForm } from "./components/SupportTicketForm";
import type { V2Activity } from "@/types/activity";
import type { V2SupportTicket } from "@/types/support";

const FORM_ID = "support-ticket-form";

interface SupportCreateDrawerProps {
    open: boolean;
    tenantId: string;
    activities: V2Activity[];
    onClose: () => void;
    /** Riceve il ticket appena creato: la RPC ritorna la riga intera, quindi il
     *  chiamante può navigare al dettaglio senza una GET aggiuntiva. */
    onCreated: (ticket: V2SupportTicket) => void;
}

export function SupportCreateDrawer({
    open,
    tenantId,
    activities,
    onClose,
    onCreated
}: SupportCreateDrawerProps) {
    const [saving, setSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [confirmingExit, setConfirmingExit] = useState(false);
    const titleId = useId();

    useEffect(() => {
        if (!open) {
            setIsDirty(false);
            setConfirmingExit(false);
        }
    }, [open]);

    // Guardia di uscita (§27, come la nuova prenotazione): Esc, backdrop, la X
    // e «Annulla» chiedono prima di buttare una descrizione già scritta.
    const requestClose = () => {
        if (isDirty && !saving) setConfirmingExit(true);
        else onClose();
    };

    return (
        <SystemDrawer open={open} onClose={requestClose} size="md" aria-labelledby={titleId}>
            <DrawerLayout
                title="Nuova richiesta"
                titleId={titleId}
                onClose={requestClose}
                footer={
                    <>
                        <Button variant="secondary" onClick={requestClose} disabled={saving}>
                            Annulla
                        </Button>
                        {/* Submit fuori dal <form>, collegato via `form`: il
                            bottone vive nel footer del DrawerLayout. */}
                        <Button
                            variant="primary"
                            type="submit"
                            form={FORM_ID}
                            loading={saving}
                        >
                            Invia richiesta
                        </Button>
                    </>
                }
            >
                {/* `key` sull'open: rimonta il form a ogni apertura, così i
                    campi non conservano il testo di una richiesta precedente
                    già inviata. Più diretto di un reset in useEffect. */}
                <SupportTicketForm
                    key={open ? "aperto" : "chiuso"}
                    formId={FORM_ID}
                    tenantId={tenantId}
                    activities={activities}
                    onSuccess={onCreated}
                    onSavingChange={setSaving}
                    onDirtyChange={setIsDirty}
                />
            </DrawerLayout>
            <UnsavedChangesDialog
                isOpen={confirmingExit}
                title="Uscire senza inviare?"
                message="La richiesta non è stata inviata: quello che hai scritto andrà perso."
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
