import { useEffect, useState, type FormEvent } from "react";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { Select } from "@/components/ui/Select/Select";
import { createTicket } from "@/services/supabase/support";
import type { V2Activity } from "@/types/activity";
import type { V2SupportTicket } from "@/types/support";
import styles from "../Support.module.scss";

/**
 * Form puro della nuova richiesta. Nessuna logica di drawer: il submit vive nel
 * footer del `DrawerLayout` e arriva qui via `form={formId}`.
 */
interface SupportTicketFormProps {
    formId: string;
    tenantId: string;
    activities: V2Activity[];
    onSuccess: (ticket: V2SupportTicket) => void;
    onSavingChange: (saving: boolean) => void;
}

export function SupportTicketForm({
    formId,
    tenantId,
    activities,
    onSuccess,
    onSavingChange
}: SupportTicketFormProps) {
    const [subject, setSubject] = useState("");
    const [activityId, setActivityId] = useState("");
    const [message, setMessage] = useState("");
    // Errori per campo (prop `error` di TextInput/Textarea) invece di un unico
    // messaggio in fondo: dice QUALE campo manca senza far cercare all'utente.
    const [subjectError, setSubjectError] = useState<string | null>(null);
    const [messageError, setMessageError] = useState<string | null>(null);
    // Errore di invio: non appartiene a un campo, è un fallimento della
    // richiesta nel suo insieme.
    const [submitError, setSubmitError] = useState<string | null>(null);

    useEffect(() => {
        onSavingChange(false);
    }, [onSavingChange]);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        const trimmedSubject = subject.trim();
        const trimmedMessage = message.trim();

        // Validazione qui e non a DB: `subject` e `body` sono NOT NULL ma la
        // stringa vuota li soddisfa. Un ticket senza oggetto o senza testo è
        // rumore per chi risponde, non un errore di integrità.
        //
        // Entrambi i campi valutati prima di uscire: segnalarne uno per volta
        // costringerebbe a due tentativi per scoprire che ne mancavano due.
        const nextSubjectError = trimmedSubject ? null : "Indica l'oggetto della richiesta.";
        const nextMessageError = trimmedMessage
            ? null
            : "Descrivi il problema: senza testo non possiamo aiutarti.";
        setSubjectError(nextSubjectError);
        setMessageError(nextMessageError);
        if (nextSubjectError || nextMessageError) return;

        setSubmitError(null);
        onSavingChange(true);
        try {
            const ticket = await createTicket(tenantId, {
                subject: trimmedSubject,
                // Stringa vuota = "nessuna sede": la RPC vuole null esplicito.
                activityId: activityId || null,
                firstMessage: trimmedMessage
            });
            onSuccess(ticket);
        } catch (err) {
            onSavingChange(false);
            setSubmitError(
                err instanceof Error && err.message === "SUPPORT_NOT_ALLOWED"
                    ? "Non hai i permessi per aprire una richiesta."
                    : "Non è stato possibile inviare la richiesta. Riprova."
            );
        }
    }

    return (
        <form id={formId} onSubmit={handleSubmit} className={styles.form}>
            <TextInput
                label="Oggetto"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Es. Il QR del tavolo 4 non funziona"
                maxLength={120}
                error={subjectError ?? undefined}
            />

            <Select
                label="Sede (facoltativo)"
                value={activityId}
                onChange={e => setActivityId(e.target.value)}
                options={[
                    { value: "", label: "Nessuna sede specifica" },
                    ...activities.map(a => ({ value: a.id, label: a.name }))
                ]}
            />

            <Textarea
                label="Descrizione"
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Raccontaci cosa succede, e cosa avevi provato a fare."
                rows={7}
                error={messageError ?? undefined}
            />

            {submitError && <p className={styles.formError}>{submitError}</p>}
        </form>
    );
}
