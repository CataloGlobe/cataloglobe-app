import { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
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

    return (
        <SystemDrawer open={open} onClose={onClose} width={520}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Nuova richiesta
                    </Text>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={saving}>
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
                />
            </DrawerLayout>
        </SystemDrawer>
    );
}
