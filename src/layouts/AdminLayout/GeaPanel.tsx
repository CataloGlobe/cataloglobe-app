import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { SendHorizontal, X } from "lucide-react";
import { IconButton } from "@/components/ui/Button/IconButton";
import { TextInput } from "@/components/ui/Input/TextInput";
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

/**
 * Gea dal computer (canvas V9): un pulsante in basso a destra e un pannello
 * laterale che non blocca la pagina. Gea sa quale pagina è aperta (sulla
 * scheda di un lead, quale locale). Il pannello vive nel layout: cambiando
 * pagina la conversazione resta. I comandi che chiedono conferma restano su
 * Telegram, dove ci sono i pulsanti Sì e No.
 */
export function GeaPanel({
    open,
    page,
    raised,
    onOpen,
    onClose
}: {
    open: boolean;
    page: GeaWebPage | null;
    /** Al telefono il pulsante sta sopra la barra in basso. */
    raised: boolean;
    onOpen: () => void;
    onClose: () => void;
}) {
    const [messages, setMessages] = useState<GeaMessage[]>([]);
    const [history, setHistory] = useState<GeaTurn[]>([]);
    const [draft, setDraft] = useState("");
    const [busy, setBusy] = useState(false);
    const nextId = useRef(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const launcherRef = useRef<HTMLButtonElement>(null);
    const logRef = useRef<HTMLDivElement>(null);
    const wasOpen = useRef(open);

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

    // Una domanda pronta già fatta non si ripropone (V9).
    const asked = new Set(messages.filter(m => m.from === "me").map(m => m.text.toLowerCase()));
    const suggestions = geaSuggestions(page).filter(s => !asked.has(s.toLowerCase()));

    const onSubmit = (e: FormEvent) => {
        e.preventDefault();
        void ask(draft);
    };

    if (!open) {
        return (
            <button
                ref={launcherRef}
                type="button"
                className={styles.launcher}
                data-raised={raised || undefined}
                onClick={onOpen}
                aria-label="Chiedi a Gea"
            >
                <span className={styles.mark} aria-hidden="true">
                    G
                </span>
                <Text as="span" variant="body-sm" weight={600} color="inherit">
                    Gea
                </Text>
            </button>
        );
    }

    return (
        <aside className={styles.panel} aria-label="Gea">
            <header className={styles.head}>
                <span className={styles.mark} aria-hidden="true">
                    G
                </span>
                <Text as="h2" variant="body" weight={700}>
                    Gea
                </Text>
                <Text as="span" variant="caption" colorVariant="muted" className={styles.caption}>
                    {geaPageCaption(page)}
                </Text>
                <IconButton icon={<X size={16} />} aria-label="Chiudi Gea" variant="secondary" size="sm" onClick={onClose} />
            </header>

            <div ref={logRef} className={styles.log} role="log" aria-live="polite" aria-busy={busy}>
                {messages.length === 0 && (
                    <Text variant="body-sm" colorVariant="muted" className={styles.intro}>
                        Chiedimi dei lead, dell'agenda o dei costi: rispondo come su Telegram. Le cose da confermare restano lì.
                    </Text>
                )}
                {messages.map(m => (
                    <div key={m.id} className={styles.bubble} data-from={m.from} data-failed={m.failed || undefined}>
                        <Text as="p" variant="body-sm" color="inherit">
                            {m.text}
                        </Text>
                    </div>
                ))}
                {busy && (
                    <div className={styles.bubble} data-from="gea" data-thinking>
                        <Text as="p" variant="body-sm" colorVariant="muted">
                            Gea ci pensa…
                        </Text>
                    </div>
                )}
            </div>

            {suggestions.length > 0 && (
                <div className={styles.suggestions}>
                    {suggestions.map(s => (
                        <button key={s} type="button" className={styles.suggestion} disabled={busy} onClick={() => void ask(s)}>
                            <Text as="span" variant="caption" weight={600} color="inherit">
                                {s}
                            </Text>
                        </button>
                    ))}
                </div>
            )}

            <form className={styles.form} onSubmit={onSubmit}>
                <TextInput
                    ref={inputRef}
                    aria-label="Domanda per Gea"
                    placeholder="Chiedi a Gea…"
                    value={draft}
                    maxLength={2000}
                    onChange={e => setDraft(e.target.value)}
                    containerClassName={styles.field}
                    endAdornment={<SendHorizontal size={16} />}
                    endAdornmentAriaLabel="Invia a Gea"
                    onEndAdornmentClick={() => void ask(draft)}
                />
            </form>
        </aside>
    );
}
