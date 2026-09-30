import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import {
    CLOSE_BACK_LABEL,
    closeAnswerLabel,
    closeQuestionText,
    closeQuestionTitle,
    notDeliverableReason,
    type SeatingCloseAction,
    type SeatingCloseFlow
} from "./seatingClose";
import styles from "./Reservations.module.scss";

// ── La domanda ─────────────────────────────────────────────────────────────
// «Servizio concluso» con ordini ancora aperti: il drawer (della tavolata o
// della prenotazione) CAMBIA STATO e mostra questo al posto del suo corpo.
// Non un secondo drawer, non una navigazione: è lo stesso oggetto in un
// momento diverso, e da qui si torna indietro senza aver chiuso niente.
//
// Forma delle conferme del progetto: cosa stai chiudendo · cosa succede alle
// cose collegate, con i numeri veri · le azioni. Il corpo e il footer sono
// due pezzi perché il DrawerLayout li vuole separati; la regola (`ask`,
// quali risposte) viene da `seatingClose.ts`, qui si disegna soltanto.

interface BodyProps {
    flow: Extract<SeatingCloseFlow, { kind: "ask" }>;
}

export function SeatingCloseQuestionBody({ flow }: BodyProps) {
    const deliverable = flow.options.includes("deliver");
    return (
        <div className={styles.drawerBody}>
            {/* Non un `alertdialog`: è uno stato del drawer, che è già il dialog.
                Il cambio si annuncia con la regione live. */}
            <section className={styles.drawerQuestion} aria-live="polite">
                <Text as="h3" variant="body" weight={600}>
                    {closeQuestionTitle(flow.pendingOrders)}
                </Text>
                <Text as="p" variant="body-sm" colorVariant="muted">
                    {closeQuestionText(flow.pendingOrders)}
                </Text>
                {/* «Serviti» non si disegna spento: si dice perché manca. */}
                {!deliverable && (
                    <Text as="p" variant="caption" colorVariant="muted">
                        {notDeliverableReason(flow.pendingOrders)}
                    </Text>
                )}
            </section>
        </div>
    );
}

interface FooterProps {
    flow: Extract<SeatingCloseFlow, { kind: "ask" }>;
    /** Quale risposta è in volo. `null` = nessuna. */
    busy: SeatingCloseAction | null;
    onAnswer: (action: SeatingCloseAction) => void;
    onBack: () => void;
}

export function SeatingCloseQuestionFooter({ flow, busy, onAnswer, onBack }: FooterProps) {
    const deliverable = flow.options.includes("deliver");
    return (
        <div className={styles.drawerFooter}>
            <Button variant="ghost" disabled={busy !== null} onClick={onBack}>
                {CLOSE_BACK_LABEL}
            </Button>
            <span className={styles.drawerFooterSpacer} aria-hidden />
            {/* Con entrambe le risposte, «annullati» è la secondaria e
                «serviti» la primaria: nel caso normale la gente ha mangiato.
                Con la sola «annullati», è lei la primaria: è l'unica cosa
                che si può fare, e non deve sembrare un ripiego. */}
            <Button
                variant={deliverable ? "outline" : "primary"}
                loading={busy === "cancel"}
                disabled={busy !== null}
                onClick={() => onAnswer("cancel")}
            >
                {closeAnswerLabel("cancel", flow.pendingOrders)}
            </Button>
            {deliverable && (
                <Button
                    variant="primary"
                    loading={busy === "deliver"}
                    disabled={busy !== null}
                    onClick={() => onAnswer("deliver")}
                >
                    {closeAnswerLabel("deliver", flow.pendingOrders)}
                </Button>
            )}
        </div>
    );
}
