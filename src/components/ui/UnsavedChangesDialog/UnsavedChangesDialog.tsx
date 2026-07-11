import { useState } from "react";
import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutFooter,
    ModalLayoutHeader,
} from "@/components/ui/ModalLayout/ModalLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";

type Props = {
    isOpen: boolean;
    /** Resta dove sei (anche backdrop/ESC). Le modifiche restano intatte. */
    onCancel: () => void;
    /** Scarta le modifiche e procedi. */
    onDiscard: () => void;
    /**
     * Salva (STESSA funzione di salvataggio della pagina — un solo percorso)
     * e procedi. Deve restituire true se il salvataggio è riuscito.
     */
    onSaveAndExit: () => Promise<boolean>;
    title?: string;
    message?: string;
};

/**
 * Dialog a 3 opzioni per guard su uscita con modifiche non salvate
 * (es. cambio tab intercettato — non è una route-nav). Costruito su
 * ModalLayout, stesso pattern di ConfirmDialog.
 */
export function UnsavedChangesDialog({
    isOpen,
    onCancel,
    onDiscard,
    onSaveAndExit,
    title = "Modifiche non salvate",
    message = "Hai modifiche non salvate. Cosa vuoi fare?",
}: Props) {
    const [saving, setSaving] = useState(false);

    const handleSaveAndExit = async () => {
        setSaving(true);
        // Su successo è il parent a procedere (e chiudere il dialog); su errore
        // il toast arriva dalla funzione di salvataggio e il dialog resta
        // aperto, così l'utente può riprovare o uscire senza salvare.
        await onSaveAndExit();
        setSaving(false);
    };

    return (
        <ModalLayout isOpen={isOpen} onClose={onCancel} width="sm" height="fit">
            <ModalLayoutHeader>
                <Text variant="title-sm" weight={600}>
                    {title}
                </Text>
            </ModalLayoutHeader>
            <ModalLayoutContent>
                <Text variant="body-sm" colorVariant="muted">
                    {message}
                </Text>
            </ModalLayoutContent>
            <ModalLayoutFooter>
                <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
                    Annulla
                </Button>
                <Button variant="secondary" size="sm" onClick={onDiscard} disabled={saving}>
                    Esci senza salvare
                </Button>
                <Button variant="primary" size="sm" onClick={handleSaveAndExit} loading={saving}>
                    Salva ed esci
                </Button>
            </ModalLayoutFooter>
        </ModalLayout>
    );
}
