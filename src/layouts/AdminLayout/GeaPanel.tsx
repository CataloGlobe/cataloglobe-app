import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUp, SendHorizontal, X } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import Text from "@/components/ui/Text/Text";
import { askGea, type GeaTurn } from "@/services/supabase/crmGea";
import { geaErrorMessage, geaPageCaption, geaSuggestions, type GeaWebPage } from "@/utils/crm/gea";
import styles from "./GeaPanel.module.scss";

interface GeaMessage {
    id: number;
    from: "me" | "gea";
    text: string;
    failed?: boolean;
}

/** Gli scambi che Gea ricorda, come su Telegram (GEA_MEMORY_TURNS). */
const MEMORY = 3;

/** G4: 390 × 580, allungata fino a 24 px dal bordo alto. */
const CARD_HEIGHT = 580;
const EDGE = 24;
const SHEET_HEIGHT = 640;
/** Preferenza di vista: Gea allungata resta allungata finché non la si riduce. */
const TALL_KEY = "crm.gea.alta";

/** Apertura (G1): cresce dal pulsante con un piccolo rimbalzo. */
const EASE_OPEN = [0.2, 0.9, 0.25, 1.12] as const;
const EASE_HEIGHT = [0.2, 0.9, 0.25, 1] as const;
const CARD_CLOSED = { opacity: 0, scale: 0.12, y: 40 };

function readTall(): boolean {
    try {
        return window.localStorage.getItem(TALL_KEY) === "1";
    } catch {
        return false;
    }
}

function writeTall(tall: boolean) {
    try {
        if (tall) window.localStorage.setItem(TALL_KEY, "1");
        else window.localStorage.removeItem(TALL_KEY);
    } catch {
        // Senza memoria del browser la scelta vale fino al ricarico.
    }
}

function useViewportHeight(): number {
    const [height, setHeight] = useState(() => window.innerHeight);
    useEffect(() => {
        const onResize = () => setHeight(window.innerHeight);
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);
    return height;
}

/**
 * Gea dal computer (canvas G4, deciso da Alex il 2026-10-05): il pulsante in
 * basso a destra si allarga in una chat arrotondata, con le bolle che entrano
 * e i puntini mentre Gea scrive. La freccia accanto alla X la allunga verso
 * l'alto, senza allargarla, e la scelta resta. Al telefono (G3) è un foglio
 * che sale dal basso. La pagina dietro resta usabile. Gea sa quale pagina è
 * aperta; i comandi che chiedono conferma restano su Telegram.
 */
export function GeaPanel({
    open,
    page,
    raised,
    phone,
    question,
    onQuestionTaken,
    onOpen,
    onClose
}: {
    open: boolean;
    page: GeaWebPage | null;
    /** Al telefono il pulsante sta sopra la barra in basso. */
    raised: boolean;
    /** Al telefono: foglio dal basso invece della scheda. */
    phone: boolean;
    /** Una domanda arrivata dal Cerca («Chiedi a Gea»): parte appena Gea è aperta. */
    question: string | null;
    onQuestionTaken: () => void;
    onOpen: () => void;
    onClose: () => void;
}) {
    const [messages, setMessages] = useState<GeaMessage[]>([]);
    const [history, setHistory] = useState<GeaTurn[]>([]);
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState(false);
    const [tall, setTall] = useState(readTall);
    const nextId = useRef(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const launcherRef = useRef<HTMLButtonElement>(null);
    const logRef = useRef<HTMLDivElement>(null);
    const wasOpen = useRef(open);
    const reduceMotion = useReducedMotion();
    const viewport = useViewportHeight();

    // Aperto: il cursore nel campo. Chiuso: torna sul pulsante.
    useEffect(() => {
        if (open) inputRef.current?.focus();
        else if (wasOpen.current) launcherRef.current?.focus();
        wasOpen.current = open;
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !e.defaultPrevented) onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    useEffect(() => {
        logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
    }, [messages, busy]);

    const ask = useCallback(
        async (raw: string) => {
            const text = raw.trim();
            if (!text || busy) return;
            const push = (m: Omit<GeaMessage, "id">) => setMessages(list => [...list, { ...m, id: nextId.current++ }]);
            push({ from: "me", text });
            setDraft("");
            setBusy(true);
            try {
                const answer = await askGea(text, history, page);
                push({ from: "gea", text: answer.reply, failed: answer.status === "failed" });
                if (answer.status === "answered") setHistory(h => [...h, { asked: text, replied: answer.reply }].slice(-MEMORY));
            } catch (err) {
                push({ from: "gea", text: geaErrorMessage(err), failed: true });
            } finally {
                setBusy(false);
            }
        },
        [busy, history, page]
    );

    // «Chiedi a Gea» dal Cerca: si prende la domanda una volta sola.
    useEffect(() => {
        if (!open || question === null || busy) return;
        onQuestionTaken();
        void ask(question);
    }, [open, question, busy, onQuestionTaken, ask]);

    const toggleTall = () => {
        const next = !tall;
        writeTall(next);
        setTall(next);
    };

    // Una domanda pronta già fatta non si ripropone (V9).
    const asked = new Set(messages.filter(m => m.from === "me").map(m => m.text.toLowerCase()));
    const suggestions = geaSuggestions(page).filter(s => !asked.has(s.toLowerCase()));

    const onSubmit = (e: FormEvent) => {
        e.preventDefault();
        void ask(draft);
    };

    const tallLabel = tall ? "Riduci Gea" : "Allunga Gea fino in alto";
    const maxHeight = Math.max(320, viewport - 2 * EDGE);
    const cardHeight = tall ? maxHeight : Math.min(CARD_HEIGHT, maxHeight);
    const sheetHeight = Math.min(SHEET_HEIGHT, viewport - 40);

    const avatar = (
        <span className={styles.av} aria-hidden="true">
            G<i />
        </span>
    );

    const body = (
        <>
            <div ref={logRef} className={styles.log} role="log" aria-live="polite" aria-busy={busy}>
                <div className={styles.bubble} data-from="gea">
                    <Text as="p" variant="body-sm" color="inherit">
                        Ciao. Chiedimi dei lead, dell'agenda o dei costi: rispondo come su Telegram. Le cose da confermare restano lì.
                    </Text>
                </div>
                {messages.map(m => (
                    <div key={m.id} className={styles.bubble} data-from={m.from} data-failed={m.failed || undefined}>
                        <Text as="p" variant="body-sm" color="inherit">
                            {m.text}
                        </Text>
                    </div>
                ))}
                {busy && (
                    <div className={`${styles.bubble} ${styles.typing}`} data-from="gea" role="status" aria-label="Gea sta scrivendo">
                        <span />
                        <span />
                        <span />
                    </div>
                )}
            </div>

            {suggestions.length > 0 && (
                <div className={styles.suggestions}>
                    {suggestions.map(s => (
                        <button key={s} type="button" className={styles.suggestion} disabled={busy} onClick={() => void ask(s)}>
                            <Text as="span" variant="caption" weight={500} color="inherit">
                                {s}
                            </Text>
                        </button>
                    ))}
                </div>
            )}

            <form noValidate className={styles.form} onSubmit={onSubmit}>
                <input
                    ref={inputRef}
                    className={styles.input}
                    aria-label="Domanda per Gea"
                    placeholder="Chiedi a Gea…"
                    value={draft}
                    maxLength={2000}
                    onChange={e => setDraft(e.target.value)}
                />
                <button type="submit" className={styles.send} aria-label="Invia a Gea" disabled={!draft.trim() || busy}>
                    <SendHorizontal size={18} aria-hidden="true" />
                </button>
            </form>
        </>
    );

    return (
        <>
            <button
                ref={launcherRef}
                type="button"
                className={styles.launcher}
                data-raised={raised || undefined}
                data-hidden={open || undefined}
                onClick={onOpen}
                aria-label="Chiedi a Gea"
                aria-hidden={open || undefined}
                tabIndex={open ? -1 : undefined}
            >
                {avatar}
                <Text as="span" variant="body" weight={600} color="inherit">
                    Gea
                </Text>
            </button>

            <AnimatePresence>
                {open &&
                    (phone ? (
                        <motion.section
                            key="sheet"
                            className={styles.sheet}
                            aria-label="Gea"
                            style={{ height: sheetHeight }}
                            initial={reduceMotion ? { opacity: 0 } : { y: "105%" }}
                            animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
                            exit={reduceMotion ? { opacity: 0 } : { y: "105%" }}
                            transition={{ duration: 0.42, ease: [0.2, 0.9, 0.25, 1.05] }}
                        >
                            <button type="button" className={styles.handle} onClick={onClose} aria-label="Chiudi Gea">
                                <span />
                            </button>
                            <header className={styles.sheetHead}>
                                {avatar}
                                <span className={styles.titles}>
                                    <Text as="h2" variant="body" weight={700}>
                                        Gea
                                    </Text>
                                    <Text as="span" variant="caption" colorVariant="muted">
                                        {geaPageCaption(page)}
                                    </Text>
                                </span>
                            </header>
                            {body}
                        </motion.section>
                    ) : (
                        <motion.section
                            key="card"
                            className={styles.card}
                            aria-label="Gea"
                            initial={reduceMotion ? { opacity: 0, height: cardHeight } : { ...CARD_CLOSED, height: cardHeight }}
                            animate={{ opacity: 1, scale: 1, y: 0, height: cardHeight }}
                            exit={reduceMotion ? { opacity: 0 } : CARD_CLOSED}
                            transition={{
                                duration: reduceMotion ? 0 : 0.38,
                                ease: EASE_OPEN,
                                opacity: { duration: 0.2 },
                                height: { duration: reduceMotion ? 0 : 0.36, ease: EASE_HEIGHT }
                            }}
                        >
                            <header className={styles.top}>
                                {avatar}
                                <span className={styles.titles}>
                                    <Text as="h2" variant="body" weight={700} color="inherit">
                                        Gea
                                    </Text>
                                    <Text as="span" variant="caption" className={styles.topCaption}>
                                        {geaPageCaption(page)}
                                    </Text>
                                </span>
                                <Tooltip content={tallLabel} side="top">
                                    <span className={styles.tipWrap}>
                                        <button
                                            type="button"
                                            className={styles.round}
                                            data-up={tall || undefined}
                                            onClick={toggleTall}
                                            aria-label={tallLabel}
                                        >
                                            <ArrowUp size={16} aria-hidden="true" />
                                        </button>
                                    </span>
                                </Tooltip>
                                <button type="button" className={styles.round} onClick={onClose} aria-label="Chiudi Gea">
                                    <X size={16} aria-hidden="true" />
                                </button>
                            </header>
                            {body}
                        </motion.section>
                    ))}
            </AnimatePresence>
        </>
    );
}
