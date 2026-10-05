import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import type { GiroToday } from "@/utils/crm/agentsOverview";
import type { GiroItem, GiroStepNumber } from "@/utils/crm/giroSteps";
import styles from "../Agents.module.scss";

interface StepInfo {
    step: GiroStepNumber;
    title: string;
    heading: string;
    what: string;
    who: string[];
    empty: string;
}

const STEPS: readonly StepInfo[] = [
    {
        step: 1,
        title: "Arriva",
        heading: "Arriva un messaggio",
        what: "Un locale scrive su WhatsApp. Il CRM lo lega al suo lead e sveglia l'agente giusto.",
        who: ["Il lead", "WhatsApp"],
        empty: "Oggi nessun locale ha scritto."
    },
    {
        step: 2,
        title: "Scrive",
        heading: "L'agente scrive la bozza",
        what: "Prepara la risposta con le regole del brand. Chi scrive dipende dal caso: una risposta, un sollecito, una riattivazione.",
        who: ["Conversazione", "Solleciti", "Riattivazione"],
        empty: "Oggi nessuna bozza."
    },
    {
        step: 3,
        title: "Rilegge",
        heading: "Il revisore rilegge",
        what: "Controlla prezzi, promesse, tono e dati che non vanno scritti. Se qualcosa non torna ferma la bozza e dice perché.",
        who: ["Revisore"],
        empty: "Oggi niente da rileggere."
    },
    {
        step: 4,
        title: "Decidete voi",
        heading: "Decidete voi",
        what: "In prova ogni bozza aspetta il vostro sì: si manda così, si corregge o si scarta. Qui, nella scheda del lead o su Telegram.",
        who: ["Voi"],
        empty: "Niente in attesa: è tutto deciso."
    },
    {
        step: 5,
        title: "Parte",
        heading: "Parte su WhatsApp",
        what: "Il messaggio esce dal numero dedicato, dentro la fascia oraria e il tetto di invii del giorno.",
        who: ["WhatsApp"],
        empty: "Oggi nessun messaggio partito."
    }
];

function plural(n: number, one: string, many: string): string {
    return n === 1 ? one : many;
}

function tileValue(step: GiroStepNumber, giro: GiroToday | null, arrived: number | null): { value: string; sub: string } {
    if (!giro) return { value: "—", sub: "" };
    switch (step) {
        case 1:
            return {
                value: arrived === null ? "—" : String(arrived),
                sub: arrived === null ? "non si legge" : plural(arrived, "messaggio dai lead", "messaggi dai lead")
            };
        case 2:
            return { value: String(giro.written), sub: plural(giro.written, "bozza", "bozze") };
        case 3:
            return { value: String(giro.reviewed), sub: `${giro.stopped} ${plural(giro.stopped, "fermata", "fermate")}` };
        case 4:
            return { value: String(giro.waiting), sub: giro.waiting === 0 ? "niente in attesa" : `la più vecchia da ${giro.oldestWait}` };
        default:
            return { value: String(giro.sent), sub: plural(giro.sent, "inviato", "inviati") };
    }
}

const EASE = [0.2, 0.9, 0.25, 1] as const;

/**
 * Il giro di un messaggio, oggi (canvas M1, deciso da Alex il 2026-10-05): i
 * cinque passi sono tessere col numero di oggi. Cliccandone una si apre sotto
 * cosa succede, chi lo fa e i messaggi di oggi a quel passo, da aprire; al
 * passo 4 si decide lì. I passi 2 e 3 accendono anche le righe degli agenti.
 */
export function GiroStrip({
    giro,
    arrived,
    selected,
    items,
    itemsError,
    sending,
    onSelect,
    onSend
}: {
    giro: GiroToday | null;
    arrived: number | null;
    selected: GiroStepNumber | null;
    items: GiroItem[];
    itemsError: boolean;
    /** La bozza in partenza (passo 4). */
    sending: string | null;
    onSelect: (step: GiroStepNumber | null) => void;
    onSend: (item: GiroItem) => void;
}) {
    const navigate = useNavigate();
    const reduceMotion = useReducedMotion();
    const info = STEPS.find(s => s.step === selected) ?? null;

    return (
        <section className={styles.giroBox} aria-labelledby="agenti-giro">
            <div className={styles.giroHead}>
                <Text as="h2" id="agenti-giro" variant="body-sm" weight={700}>
                    Il giro di un messaggio, oggi
                </Text>
                <Text as="span" variant="caption" colorVariant="muted">
                    clicca un passo: sotto vedi cosa succede e i messaggi che ci sono adesso
                </Text>
            </div>
            <ol className={styles.giroSteps}>
                {STEPS.map(s => {
                    const { value, sub } = tileValue(s.step, giro, arrived);
                    const on = selected === s.step;
                    return (
                        <li key={s.step} className={styles.giroItem}>
                            <button
                                type="button"
                                className={styles.giroTile}
                                data-selected={on}
                                data-level={s.step === 4 && giro && giro.waiting > 0 ? giro.oldestLevel : undefined}
                                aria-expanded={on}
                                aria-controls="agenti-giro-passo"
                                onClick={() => onSelect(on ? null : s.step)}
                            >
                                <span className={styles.giroTileHead}>
                                    <span className={styles.giroNumber} aria-hidden="true">
                                        {s.step}
                                    </span>
                                    <Text as="span" variant="body-sm" weight={600} color="inherit">
                                        {s.title}
                                    </Text>
                                </span>
                                <Text as="span" variant="title-sm" weight={600} className={styles.giroValue}>
                                    {value}
                                </Text>
                                <Text as="span" variant="caption" className={styles.giroCount}>
                                    {sub}
                                </Text>
                            </button>
                        </li>
                    );
                })}
            </ol>

            <AnimatePresence initial={false}>
                {info && (
                    <motion.div
                        key="passo"
                        id="agenti-giro-passo"
                        className={styles.giroDetailWrap}
                        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, height: "auto" }}
                        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                        transition={{ duration: reduceMotion ? 0 : 0.32, ease: EASE }}
                    >
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                                key={info.step}
                                className={styles.giroDetail}
                                initial={reduceMotion ? false : { opacity: 0, y: -6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                                transition={{ duration: reduceMotion ? 0 : 0.2, ease: EASE }}
                            >
                                <div className={styles.giroWhy}>
                                    <Text as="h3" variant="body" weight={700}>
                                        {info.heading}
                                    </Text>
                                    <Text variant="body-sm" colorVariant="muted">
                                        {info.what}
                                    </Text>
                                    <Text as="span" variant="caption" colorVariant="muted">
                                        Chi lo fa
                                    </Text>
                                    <ul className={styles.giroWho}>
                                        {info.who.map(w => (
                                            <li key={w}>
                                                <Text as="span" variant="caption" weight={600} color="inherit">
                                                    {w}
                                                </Text>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className={styles.giroList}>
                                    {itemsError ? (
                                        <Text variant="body-sm" colorVariant="muted" className={styles.giroEmpty}>
                                            I messaggi di oggi non si leggono adesso. Riprova con «Aggiorna».
                                        </Text>
                                    ) : items.length === 0 ? (
                                        <Text variant="body-sm" colorVariant="muted" className={styles.giroEmpty}>
                                            {info.empty}
                                        </Text>
                                    ) : (
                                        <ul>
                                            {items.map(item => (
                                                <li key={item.key} className={styles.giroRow}>
                                                    <Text as="span" variant="caption" colorVariant="muted" className={styles.giroWhen}>
                                                        {item.when}
                                                    </Text>
                                                    <span className={styles.giroWhat}>
                                                        <Text as="span" variant="body-sm" weight={600}>
                                                            {item.venueName}
                                                        </Text>
                                                        <Text
                                                            as="span"
                                                            variant="body-sm"
                                                            colorVariant="muted"
                                                            className={styles.giroExcerpt}
                                                        >
                                                            {item.text}
                                                        </Text>
                                                    </span>
                                                    <span className={styles.giroActs}>
                                                        <Text
                                                            as="span"
                                                            variant="caption"
                                                            weight={600}
                                                            className={styles.giroTag}
                                                            data-tone={item.tone}
                                                        >
                                                            {item.tag}
                                                        </Text>
                                                        {item.draftId ? (
                                                            <>
                                                                <Button
                                                                    size="sm"
                                                                    variant="primary"
                                                                    loading={sending === item.draftId}
                                                                    disabled={sending !== null && sending !== item.draftId}
                                                                    onClick={() => onSend(item)}
                                                                >
                                                                    Inviala così
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="secondary"
                                                                    onClick={() => navigate(`/admin/lead/${item.venueId}?bozza=modifica`)}
                                                                >
                                                                    Modifica
                                                                </Button>
                                                            </>
                                                        ) : (
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => navigate(`/admin/lead/${item.venueId}`)}
                                                            >
                                                                Apri
                                                            </Button>
                                                        )}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </motion.div>
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>
        </section>
    );
}
