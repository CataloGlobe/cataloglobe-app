import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type KeyboardEvent as ReactKeyboardEvent,
    type ReactNode
} from "react";
import { Check } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { Logo } from "@/components/ui/Logo/Logo";
import styles from "./SetupShell.module.scss";

export type SetupStepDefinition = {
    id: string;
    /** Voce dello stepper. */
    label: string;
    /** Riga di supporto sotto la voce, nello stepper. */
    hint: string;
};

type SetupShellProps = {
    steps: SetupStepDefinition[];
    /** Indice 0-based del passo mostrato. I precedenti risultano completati. */
    currentIndex: number;
    title: string;
    subtitle: string;
    children: ReactNode;
    /**
     * Quando valorizzato, il bottone primario è `type="submit"` collegato al
     * form via attributo `form` — stesso meccanismo del footer di DrawerLayout,
     * così il form non contiene bottoni di submit.
     */
    formId?: string;
    primaryLabel: string;
    primaryDisabled?: boolean;
    primaryLoading?: boolean;
    /** Usato solo quando `formId` è assente (passo senza form). */
    onPrimaryClick?: () => void;
    /**
     * Il passo monta un componente che porta intestazione e azioni proprie (il
     * pannello di import AI): la shell cede la cornice invece di raddoppiarla.
     * Spariscono titolo, sottotitolo e footer; l'area contenuto perde padding e
     * gap e cede lo scroll al figlio, che riceve così tutta l'altezza del
     * dialogo. `title` resta richiesto: diventa l'etichetta accessibile del
     * dialogo, che senza intestazione visibile non avrebbe più un nome.
     */
    chromeless?: boolean;
    /**
     * Testo di supporto nella colonna sinistra, sotto lo stepper. Serve alle
     * note di contesto del passo che nell'area destra finirebbero in coda al
     * form, dove nessuno le legge, mentre la colonna sinistra resta vuota.
     */
    sidebarNote?: ReactNode;
    /**
     * Il passo 1 ha campi compilati non ancora salvati. Al passo 1 nulla
     * raggiunge il DB prima del submit: senza campi compilati un'uscita non
     * perde niente.
     */
    isStepOneDirty?: boolean;
    /**
     * La sede esiste su DB. Deriva dalla sede, non dall'indice del passo: se
     * `createActivity` riesce e l'upload della copertina fallisce, la sede c'è
     * ma il passo non è avanzato — ed è la sede a dire la verità su cosa è
     * stato salvato.
     */
    hasCreatedActivity?: boolean;
    /** Azione secondaria a sinistra del primario (es. "Indietro"). */
    secondaryLabel?: string;
    onSecondaryClick?: () => void;
    /**
     * Riga aggiuntiva nella conferma di chiusura, per un lavoro in corso che
     * chiudendo andrebbe perso. Assente → la conferma resta quella standard.
     */
    closeWarning?: string;
    /** Uscita confermata: il chiamante decide dove portare l'utente. */
    onExit: () => void;
};

export function SetupShell({
    steps,
    currentIndex,
    title,
    subtitle,
    children,
    formId,
    primaryLabel,
    primaryDisabled = false,
    primaryLoading = false,
    onPrimaryClick,
    chromeless = false,
    sidebarNote,
    isStepOneDirty = false,
    hasCreatedActivity = false,
    secondaryLabel,
    onSecondaryClick,
    closeWarning,
    onExit
}: SetupShellProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const confirmRef = useRef<HTMLDivElement>(null);
    const confirmPrimaryRef = useRef<HTMLButtonElement>(null);
    // Elemento a fuoco nel momento in cui la conferma si apre: il link "Chiudi
    // il setup" se l'apertura arriva da lì, il dialogo esterno se arriva da Esc.
    const confirmOpenerRef = useRef<HTMLElement | null>(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);

    useEffect(() => {
        dialogRef.current?.focus();
    }, []);

    // ---------------------------------------------------------------
    // Predicato di uscita — fonte unica per link, Esc e riga in sidebar.
    //
    // Confermare un'uscita ha senso solo se c'è qualcosa da dire: dati del
    // passo 1 che andrebbero persi, oppure una sede ormai creata che rende
    // questa procedura non ripetibile. Senza nessuno dei due l'uscita è
    // innocua e la conferma sarebbe solo un ostacolo.
    //
    // `closeWarning` (analisi del menù in corso) ha precedenza: è l'unico caso
    // in cui si perde un lavoro già avviato, quindi impone la conferma anche
    // dove altrimenti non servirebbe e prende il posto del corpo della
    // variante.
    // ---------------------------------------------------------------
    const confirmCopy = hasCreatedActivity
        ? {
              title: "Vuoi chiudere il setup?",
              body: "La tua sede è stata creata. Menù e pubblicazione li completi dalla Panoramica: questa procedura guidata non ripartirà.",
              exitLabel: "Vai alla Panoramica"
          }
        : {
              title: "Vuoi uscire dal setup?",
              body: "I dati di questo passaggio non sono ancora salvati: chiudendo ora andranno persi.",
              exitLabel: "Esci senza salvare"
          };

    const needsConfirm = Boolean(closeWarning) || hasCreatedActivity || isStepOneDirty;

    const requestClose = useCallback(() => {
        if (!needsConfirm) {
            onExit();
            return;
        }
        // Letto qui e non nel ramo di apertura: è l'ultimo istante in cui il
        // fuoco è ancora sull'elemento che ha chiesto la chiusura.
        confirmOpenerRef.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setIsConfirmOpen(true);
    }, [needsConfirm, onExit]);

    // Il dialogo di conferma prende il fuoco all'apertura e lo restituisce alla
    // chiusura: senza, il fuoco resterebbe dietro la conferma, su comandi che
    // nel frattempo sono inerti.
    useEffect(() => {
        if (!isConfirmOpen) return;

        confirmPrimaryRef.current?.focus();

        // Copiato ora: il dialogo del wizard resta lo stesso per tutta la vita
        // della conferma, e il cleanup non deve rileggere il ref.
        const wizardDialog = dialogRef.current;

        return () => {
            const opener = confirmOpenerRef.current;
            // L'apertura da Esc non ha un elemento sensato a cui tornare, e
            // dopo l'uscita l'opener può non essere più nel documento: in
            // entrambi i casi il fuoco torna al dialogo del wizard.
            const target = opener && document.contains(opener) ? opener : wizardDialog;
            target?.focus();
            confirmOpenerRef.current = null;
        };
    }, [isConfirmOpen]);

    // Tab confinato alla conferma finché è aperta: è un `alertdialog`, dietro
    // non c'è nulla di raggiungibile.
    const handleConfirmKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
        if (e.key !== "Tab") return;

        const focusables = confirmRef.current?.querySelectorAll<HTMLElement>(
            "button:not([disabled])"
        );
        if (!focusables || focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;

        if (e.shiftKey && active === first) {
            e.preventDefault();
            last.focus();
            return;
        }
        if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
        }
    }, []);

    // Esc segue la stessa regola del link: chiede conferma solo dove serve,
    // altrimenti esce. A conferma aperta chiude solo quella.
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            if (isConfirmOpen) {
                setIsConfirmOpen(false);
                return;
            }
            requestClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [isConfirmOpen, requestClose]);

    const stepCounter = `Passo ${currentIndex + 1} di ${steps.length}`;

    return (
        <div className={styles.backdrop}>
            <div
                ref={dialogRef}
                className={styles.dialog}
                // Il pannello di import porta la propria cornice a tutta altezza:
                // lì il dialogo resta di altezza fissa come prima, l'adattiva
                // vale per i passi con cornice della shell.
                data-chromeless={chromeless || undefined}
                role="dialog"
                aria-modal="true"
                // Senza intestazione visibile non c'è un elemento da referenziare:
                // il nome del dialogo passa dal titolo del passo.
                aria-labelledby={chromeless ? undefined : "setup-step-title"}
                aria-label={chromeless ? title : undefined}
                tabIndex={-1}
            >
                <aside className={styles.sidebar}>
                    <div className={styles.brand}>
                        <Logo variant="lockup-horizontal" color="auto" size={26} />
                    </div>

                    <ol className={styles.stepper}>
                        {steps.map((step, index) => {
                            const state =
                                index < currentIndex
                                    ? "done"
                                    : index === currentIndex
                                      ? "current"
                                      : "todo";

                            return (
                                <li
                                    key={step.id}
                                    className={styles.step}
                                    data-state={state}
                                    aria-current={state === "current" ? "step" : undefined}
                                >
                                    <span className={styles.stepMarker} aria-hidden>
                                        {state === "done" ? <Check size={14} /> : index + 1}
                                    </span>
                                    <span className={styles.stepText}>
                                        <Text variant="body-sm" weight={600}>
                                            {step.label}
                                        </Text>
                                        <Text variant="caption" colorVariant="muted">
                                            {step.hint}
                                        </Text>
                                    </span>
                                </li>
                            );
                        })}
                    </ol>

                    {sidebarNote && <div className={styles.sidebarNote}>{sidebarNote}</div>}

                    <div className={styles.sidebarFooter}>
                        {/* Fino alla creazione della sede il progresso NON è
                            salvato: dirlo qui evita di prometterlo. */}
                        <Text variant="caption" colorVariant="muted">
                            {hasCreatedActivity
                                ? "La tua sede è salvata. Puoi chiudere quando vuoi."
                                : "I dati di questo passaggio vengono salvati quando premi Continua."}
                        </Text>
                        <button type="button" className={styles.closeLink} onClick={requestClose}>
                            Chiudi il setup
                        </button>
                    </div>
                </aside>

                <div className={styles.main}>
                    {/* Fuori dall'area che scorre: scorrendo il form del passo 1
                        il titolo spariva e non si sapeva più a che passo si era.
                        Scorre solo il contenuto; intestazione e footer restano. */}
                    {!chromeless && (
                        <header className={styles.contentHeader}>
                            <Text as="h1" id="setup-step-title" variant="title-md" weight={700}>
                                {title}
                            </Text>
                            <Text variant="body-sm" colorVariant="muted">
                                {subtitle}
                            </Text>
                        </header>
                    )}

                    <div className={styles.content} data-chromeless={chromeless || undefined}>
                        {children}
                    </div>

                    {!chromeless && (
                        <footer className={styles.footer}>
                            <Text variant="caption" colorVariant="muted">
                                {stepCounter}
                            </Text>
                            <div className={styles.footerActions}>
                                {secondaryLabel && (
                                    <Button variant="secondary" onClick={onSecondaryClick}>
                                        {secondaryLabel}
                                    </Button>
                                )}
                                {formId ? (
                                    <Button
                                        variant="primary"
                                        type="submit"
                                        form={formId}
                                        loading={primaryLoading}
                                        disabled={primaryDisabled}
                                    >
                                        {primaryLabel}
                                    </Button>
                                ) : (
                                    <Button
                                        variant="primary"
                                        onClick={onPrimaryClick}
                                        loading={primaryLoading}
                                        disabled={primaryDisabled}
                                    >
                                        {primaryLabel}
                                    </Button>
                                )}
                            </div>
                        </footer>
                    )}
                </div>

                {isConfirmOpen && (
                    <div className={styles.confirmBackdrop}>
                        <div
                            ref={confirmRef}
                            className={styles.confirm}
                            role="alertdialog"
                            aria-modal="true"
                            aria-labelledby="setup-confirm-title"
                            onKeyDown={handleConfirmKeyDown}
                        >
                            <Text
                                as="h2"
                                id="setup-confirm-title"
                                variant="title-sm"
                                weight={700}
                            >
                                {confirmCopy.title}
                            </Text>
                            {/* Il lavoro in corso prevale: descrive una perdita
                                più immediata di quella della variante. */}
                            {closeWarning ? (
                                <Text variant="body-sm" colorVariant="warning">
                                    {closeWarning}
                                </Text>
                            ) : (
                                <Text variant="body-sm" colorVariant="muted">
                                    {confirmCopy.body}
                                </Text>
                            )}
                            {/* Restare nel setup è l'esito atteso: è quello il
                                primario, in testa alla pila. L'uscita resta a
                                portata di mano, ma non è l'azione suggerita. */}
                            <div className={styles.confirmActions}>
                                <Button
                                    ref={confirmPrimaryRef}
                                    variant="primary"
                                    fullWidth
                                    onClick={() => setIsConfirmOpen(false)}
                                >
                                    Continua il setup
                                </Button>
                                {/* Quieta, senza riempimento: resta a portata
                                    di mano senza competere con il primario. */}
                                <Button variant="ghost" fullWidth onClick={onExit}>
                                    {confirmCopy.exitLabel}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
