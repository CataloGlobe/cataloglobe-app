import { useEffect, useState } from "react";
import { Armchair, Clock, Users } from "lucide-react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { SeatsInput } from "@/components/ui/SeatsInput/SeatsInput";
import { TableMultiSelect } from "@/components/ui/TableMultiSelect/TableMultiSelect";
import { formatTableLabels } from "@/components/ui/TableAssignmentBadge/formatTableLabels";
import type { V2Table } from "@/types/orders";
import type { SeatingWithState } from "@/types/seating";
import {
    canEditSeating,
    formatCovers,
    formatOpenFor,
    seatingDrawerActionsFor,
    walkinTitle,
    type SeatingDrawerActionKey
} from "./seatingDrawer";
import { seatingCloseFlowFor, type SeatingCloseAction } from "./seatingClose";
import { SeatingCloseQuestionBody, SeatingCloseQuestionFooter } from "./SeatingCloseQuestion";
import styles from "./Reservations.module.scss";

// ── Il drawer della tavolata ──────────────────────────────────────────────
// Per le tavolate SENZA prenotazione. Finora ogni gesto viaggiava sulla
// prenotazione, e la tavolata era un dettaglio dentro il suo drawer; un
// walk-in non ha una prenotazione, e senza un posto suo la riga in sala non
// si poteva né correggere né chiudere. È il completamento del modello della
// 2.1: la tavolata è l'unità della sala, e funziona anche dove non esiste
// nessuna prenotazione.
//
// Le tavolate CON prenotazione continuano ad aprire il drawer della
// prenotazione (`seatingDrawerFor`): due drawer, un criterio — si apre quello
// dell'entità che ha più da dire.
//
// Fuori da questa fase, per scelta:
//   - collegare a posteriori un walk-in a una prenotazione ("avevamo
//     prenotato a un altro nome"): raro, e richiede di decidere cosa succede
//     ai coperti e allo stato della prenotazione. Si progetta a parte.
//
// Dalla 2.8: una tavolata chiusa dal cron di fine servizio
// (`closed_reason = 'auto'`) non mostra un orario di chiusura — il suo
// `closed_at` è l'ora della passata, non un fatto di sala.
//
// Dalla 3.2: «Servizio concluso» con ordini ancora aperti NON chiama subito.
// Il drawer cambia stato (`asking`) e fa la domanda — serviti o annullati?
// — nella forma di `SeatingCloseQuestion`; da lì si torna indietro senza
// aver chiuso niente. La regola (chiedere o no, quali risposte) è
// `seatingCloseFlowFor`, letta dalla view.

interface Props {
    open: boolean;
    onClose: () => void;
    /** La tavolata, come la vede la sala. `null` = nessuna selezionata. */
    seating: SeatingWithState | null;
    /** Tavoli della sede per "Cambia tavolo". `undefined` = non caricati. */
    tables?: V2Table[];
    /** table_id → chi lo occupa ADESSO (le altre tavolate aperte). */
    tableOccupancy?: ReadonlyMap<string, string>;
    /** `canDoOnActivity(perms, 'seatings.manage', activityId)`. */
    canManageSeatings: boolean;
    /**
     * Gesti, tutti immediati (RPC → il parent ricarica e mostra il toast).
     * Ritornano true se riusciti. Assenti = nessun bottone.
     */
    onSetTables?: (tableIds: string[]) => Promise<boolean>;
    onSetPartySize?: (partySize: number) => Promise<boolean>;
    /** `action` solo quando la domanda è stata fatta e risposta. */
    onComplete?: (action?: SeatingCloseAction) => Promise<boolean>;
    onUndo?: () => Promise<boolean>;
}

export default function SeatingDetailDrawer({
    open,
    onClose,
    seating,
    tables,
    tableOccupancy,
    canManageSeatings,
    onSetTables,
    onSetPartySize,
    onComplete,
    onUndo
}: Props) {
    // "da 45 min" resta vero anche senza eventi: un tick al minuto.
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        if (!open) return;
        setNow(new Date());
        const id = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(id);
    }, [open]);

    // Picker tavoli inline, come nel drawer della prenotazione: un secondo
    // SystemDrawer sopra il primo romperebbe il pattern.
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerIds, setPickerIds] = useState<string[]>([]);
    const [savingTables, setSavingTables] = useState(false);

    // Coperti inline: stepper + conferma. Lo stepper parte dal valore attuale
    // o da 2 se non indicato — un default per iniziare a contare, non un dato.
    const [coversOpen, setCoversOpen] = useState(false);
    const [coversDraft, setCoversDraft] = useState(2);
    const [savingCovers, setSavingCovers] = useState(false);

    const [busy, setBusy] = useState<SeatingDrawerActionKey | null>(null);

    // La domanda di «Servizio concluso»: uno stato del drawer, non un altro
    // drawer. `answering` = quale risposta è in volo.
    const [asking, setAsking] = useState(false);
    const [answering, setAnswering] = useState<SeatingCloseAction | null>(null);

    const seatingId = seating?.id ?? null;
    useEffect(() => {
        setPickerOpen(false);
        setCoversOpen(false);
        setBusy(null);
        setAsking(false);
        setAnswering(null);
    }, [seatingId, open]);

    if (!seating) {
        // Il drawer era aperto su una riga che ora non c'è più: un collega
        // l'ha annullata dall'altro tablet. Non "nessuna selezionata" — una
        // l'aveva selezionata eccome, e stava per agirci sopra: gli si dice
        // cos'è successo. Nessun auto-close: un drawer che si chiude da solo
        // sotto le mani è peggio.
        return (
            <SystemDrawer open={open} onClose={onClose} width={520}>
                <DrawerLayout
                    header={<Text variant="title-sm" weight={600}>Tavolata</Text>}
                    footer={
                        <div className={styles.drawerFooter}>
                            <Button variant="secondary" onClick={onClose}>
                                Chiudi
                            </Button>
                        </div>
                    }
                >
                    <div className={styles.drawerBody}>
                        <Text variant="body" colorVariant="muted">
                            Questa tavolata è stata annullata.
                        </Text>
                    </div>
                </DrawerLayout>
            </SystemDrawer>
        );
    }

    const editable = canEditSeating({ status: seating.status, canManageSeatings });
    const actions = seatingDrawerActionsFor({ status: seating.status, canManageSeatings });
    const showComplete = actions.includes("complete") && onComplete !== undefined;
    const showUndo = actions.includes("undo") && onUndo !== undefined;
    const isOpen = seating.status === "open";

    const title = walkinTitle(seating);
    const covers = formatCovers(seating.party_size);

    const openPicker = () => {
        setPickerIds(seating.tables.map(t => t.table_id));
        setPickerOpen(true);
    };

    const handleConfirmTables = async () => {
        if (!onSetTables) return;
        setSavingTables(true);
        const ok = await onSetTables(pickerIds);
        setSavingTables(false);
        if (ok) setPickerOpen(false);
    };

    const openCovers = () => {
        setCoversDraft(seating.party_size ?? 2);
        setCoversOpen(true);
    };

    const handleConfirmCovers = async () => {
        if (!onSetPartySize) return;
        setSavingCovers(true);
        const ok = await onSetPartySize(coversDraft);
        setSavingCovers(false);
        if (ok) setCoversOpen(false);
    };

    const run = async (key: SeatingDrawerActionKey, handler?: () => Promise<boolean>) => {
        if (!handler || busy !== null) return;
        setBusy(key);
        const ok = await handler();
        setBusy(null);
        if (ok) onClose();
    };

    // «Servizio concluso»: chiede solo se c'è qualcosa da decidere.
    const closeFlow = seatingCloseFlowFor(seating);
    const handleCompleteClick = () => {
        if (closeFlow.kind === "ask") {
            setAsking(true);
            return;
        }
        void run("complete", onComplete);
    };
    const handleAnswer = async (action: SeatingCloseAction) => {
        if (!onComplete || answering !== null) return;
        setAnswering(action);
        const ok = await onComplete(action);
        setAnswering(null);
        if (ok) onClose();
        // Se non è riuscita il parent ha già mostrato il toast; si resta
        // sulla domanda, che è ancora quella giusta.
    };

    const footer = (
        <div className={styles.drawerFooter}>
            {!canManageSeatings ? (
                <p className={styles.drawerFooterHint}>
                    Non hai i permessi per gestire questa tavolata.
                </p>
            ) : isOpen ? (
                <>
                    {/* "Annulla apertura" e "Servizio concluso" dicono cose opposte —
                        "non è successo" contro "è finito" — e la prima
                        cancella mentre la seconda conserva. Lo spazio in
                        mezzo dice che non sono due varianti dello stesso
                        gesto. Stessa disposizione del drawer della
                        prenotazione. */}
                    {showUndo && (
                        <Button
                            variant="ghost"
                            loading={busy === "undo"}
                            disabled={busy !== null}
                            onClick={() => void run("undo", onUndo)}
                        >
                            Annulla apertura
                        </Button>
                    )}
                    <span className={styles.drawerFooterSpacer} aria-hidden />
                    {showComplete && (
                        <Button
                            variant="primary"
                            loading={busy === "complete"}
                            disabled={busy !== null}
                            onClick={handleCompleteClick}
                        >
                            Servizio concluso
                        </Button>
                    )}
                </>
            ) : (
                <Button variant="secondary" onClick={onClose}>
                    Chiudi
                </Button>
            )}
        </div>
    );

    const header = (
        <div className={styles.drawerHeaderTitle}>
            <Text variant="title-sm" weight={600}>
                Tavolata
            </Text>
            <span className={styles.serviceWalkinMark}>Senza prenotazione</span>
        </div>
    );

    if (asking && closeFlow.kind === "ask") {
        return (
            <SystemDrawer open={open} onClose={onClose} width={520}>
                <DrawerLayout
                    header={header}
                    footer={
                        <SeatingCloseQuestionFooter
                            flow={closeFlow}
                            busy={answering}
                            onAnswer={action => void handleAnswer(action)}
                            onBack={() => setAsking(false)}
                        />
                    }
                >
                    <SeatingCloseQuestionBody flow={closeFlow} />
                </DrawerLayout>
            </SystemDrawer>
        );
    }

    return (
        <SystemDrawer open={open} onClose={onClose} width={520}>
            <DrawerLayout header={header} footer={footer}>
                <div className={styles.drawerBody}>
                    {/* ── Hero: i tavoli sono il nome ───────────────── */}
                    <section className={styles.drawerHero}>
                        <div className={styles.drawerHeroDate}>
                            <Armchair
                                size={18}
                                strokeWidth={2}
                                aria-hidden
                                className={styles.drawerHeroDateIcon}
                            />
                            <span className={styles.drawerHeroDateText}>
                                {title ?? "Nessun tavolo"}
                            </span>
                        </div>
                        <div className={styles.drawerHeroMeta}>
                            <span className={styles.drawerHeroMetaItem}>
                                <Users size={15} strokeWidth={2} aria-hidden />
                                {covers ?? "coperti non indicati"}
                            </span>
                            <span className={styles.drawerHeroMetaDot} aria-hidden>
                                ·
                            </span>
                            <span className={styles.drawerHeroMetaItem}>
                                <Clock size={15} strokeWidth={2} aria-hidden />
                                {isOpen
                                    ? `aperta ${formatOpenFor(seating.opened_at, now)}`
                                    : seating.closed_reason === "auto"
                                      // Chiusa dal cron di fine servizio: il
                                      // `closed_at` è l'ora della passata, non
                                      // quella in cui il tavolo si è liberato.
                                      // Si dice che il dato non c'è, invece
                                      // di mostrarne uno inventato.
                                      ? "chiusa automaticamente a fine servizio"
                                      : seating.closed_at
                                      // Soggetto: la tavolata ("aperta da" /
                                      // "conclusa alle"). "liberato" è del
                                      // tavolo e vive sul board.
                                      ? `conclusa alle ${new Intl.DateTimeFormat("it-IT", {
                                            hour: "2-digit",
                                            minute: "2-digit"
                                        }).format(new Date(seating.closed_at))}`
                                      : "conclusa"}
                            </span>
                        </div>
                    </section>

                    {/* ── Tavolo: il fatto, modificabile solo da aperta ── */}
                    <section className={styles.drawerSection}>
                        <div className={styles.drawerSectionHead}>
                            <h3 className={styles.drawerSectionTitle}>
                                {seating.tables.length > 1 ? "Tavoli" : "Tavolo"}
                            </h3>
                            {editable && onSetTables && !pickerOpen && (
                                <div className={styles.drawerTableActions}>
                                    <Button variant="secondary" size="sm" onClick={openPicker}>
                                        {seating.tables.length > 0
                                            ? "Cambia tavolo"
                                            : "Scegli tavolo"}
                                    </Button>
                                </div>
                            )}
                        </div>

                        {pickerOpen ? (
                            <div className={styles.drawerTablePicker}>
                                {tables === undefined ? (
                                    <p className={styles.drawerTableHint}>
                                        Caricamento dei tavoli…
                                    </p>
                                ) : (
                                    <TableMultiSelect
                                        tables={tables}
                                        value={pickerIds}
                                        onChange={setPickerIds}
                                        occupiedBy={tableOccupancy}
                                        disabled={savingTables}
                                    />
                                )}
                                <div className={styles.drawerTablePickerActions}>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={savingTables}
                                        onClick={() => setPickerOpen(false)}
                                    >
                                        Annulla
                                    </Button>
                                    {/* Zero tavoli AMMESSO qui, a differenza del
                                        piano: una tavolata senza tavoli è come
                                        nasce un walk-in, e "togliere il tavolo"
                                        è un gesto vero in sala. */}
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        loading={savingTables}
                                        disabled={tables === undefined}
                                        onClick={handleConfirmTables}
                                    >
                                        Conferma
                                    </Button>
                                </div>
                            </div>
                        ) : seating.tables.length > 0 ? (
                            <>
                                <ul className={styles.drawerTableList}>
                                    {seating.tables.map(t => (
                                        <li key={t.table_id} className={styles.drawerTableRow}>
                                            <Armchair
                                                size={15}
                                                strokeWidth={2}
                                                aria-hidden
                                                className={styles.drawerTableIcon}
                                            />
                                            <span className={styles.drawerTableLabel}>
                                                {formatTableLabels([t.label])}
                                            </span>
                                            {t.zone_name && (
                                                <span className={styles.drawerTableZone}>
                                                    {t.zone_name}
                                                </span>
                                            )}
                                            {t.deleted_at && (
                                                <span className={styles.drawerTableRemoved}>
                                                    rimosso dalla sala
                                                </span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                                {/* La frase spiega cosa farà "Cambia tavolo":
                                    senza bottone (chiusa) non spiega niente, e
                                    l'hero dice già che il servizio è concluso. */}
                                {isOpen && (
                                    <p className={styles.drawerTableHint}>Tavolo occupato adesso.</p>
                                )}
                            </>
                        ) : (
                            <p className={styles.drawerTableHint}>Nessun tavolo assegnato.</p>
                        )}
                    </section>

                    {/* ── Coperti: il fatto, modificabile solo da aperta ── */}
                    <section className={styles.drawerSection}>
                        <div className={styles.drawerSectionHead}>
                            <h3 className={styles.drawerSectionTitle}>Coperti</h3>
                            {editable && onSetPartySize && !coversOpen && (
                                <div className={styles.drawerTableActions}>
                                    <Button variant="secondary" size="sm" onClick={openCovers}>
                                        {seating.party_size === null
                                            ? "Indica i coperti"
                                            : "Correggi i coperti"}
                                    </Button>
                                </div>
                            )}
                        </div>
                        {coversOpen ? (
                            <div className={styles.drawerTablePicker}>
                                <SeatsInput
                                    value={coversDraft}
                                    onChange={setCoversDraft}
                                    min={1}
                                    max={99}
                                    disabled={savingCovers}
                                />
                                <div className={styles.drawerTablePickerActions}>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={savingCovers}
                                        onClick={() => setCoversOpen(false)}
                                    >
                                        Annulla
                                    </Button>
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        loading={savingCovers}
                                        onClick={handleConfirmCovers}
                                    >
                                        Conferma
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <p className={styles.drawerTableHint}>{covers ?? "Non indicati"}</p>
                        )}
                    </section>
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
