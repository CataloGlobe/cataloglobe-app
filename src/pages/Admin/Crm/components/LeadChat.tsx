import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import Text from "@/components/ui/Text/Text";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { TextInput } from "@/components/ui/Input/TextInput";
import { useToast } from "@/context/Toast/ToastContext";
import { decideCrmDraft } from "@/services/supabase/crmAgentTrial";
import { cancelCrmMessage, retryCrmMessage, setCrmAgentHold } from "@/services/supabase/crmWhatsappAgent";
import type { CrmAgentDraftRow, CrmMessage } from "@/types/crm";
import type { VenueWait } from "@/utils/crm/crmHome";
import { chatTime, QUICK_REPLIES, type ChatItem } from "@/utils/crm/leadDetail";
import { crmShortcutLabel, isCrmShortcut, useCrmShortcutsOn } from "@/utils/crm/crmShortcuts";
import { CRM_NOT_YET_ACTIVE, crmErrorMessage, isMissingOnDatabase } from "@/utils/crm/stages";
import { messageAuthorLabel, messageStatusLine, messageText, waErrorMessage } from "@/utils/crm/waLabels";
import styles from "../LeadDetail.module.scss";

const DRAFT_MAX = 1000;

function errorText(err: unknown): string {
    return isMissingOnDatabase(err) ? CRM_NOT_YET_ACTIVE : crmErrorMessage(err);
}

/**
 * Il filo della scheda (V5, T8b): i messaggi col numero dell'agente, letti da
 * WhatsApp Web, e in mezzo i fatti (fase, telefonate). In fondo la bozza
 * dell'agente: «Inviala così» (Alt+I), «Modifica» (Alt+M, il testo si cambia qui e
 * parte quello), «Scrivo io» (la bozza si scarta e il locale passa a una
 * persona: l'agente non gli scrive più). Le risposte pronte riempiono la
 * bozza da modificare, non partono da sole.
 *
 * «Scrivi tu» apre WhatsApp col testo pronto, dal telefono di chi scrive: il
 * CRM non manda messaggi scritti a mano (resta fuori dal blocco invii).
 */
export function LeadChat({
    venueId,
    held,
    items,
    messagesError,
    draft,
    draftWait,
    now,
    canWrite,
    phone,
    onWrite,
    onChanged
}: {
    venueId: string;
    held: boolean;
    items: ChatItem[] | null;
    messagesError: string | null;
    draft: CrmAgentDraftRow | null;
    draftWait: VenueWait | undefined;
    now: Date;
    /** C'è un numero e non ha chiesto lo stop. */
    canWrite: boolean;
    /**
     * Telefono (T8b): «Scrivi tu» sempre, bottoni grandi, niente tasti né
     * risposte pronte. Scrivania (V5): «Scrivi tu» solo senza bozza.
     */
    phone: boolean;
    onWrite: (text: string) => void;
    onChanged: () => Promise<void> | void;
}) {
    const { showToast } = useToast();
    const [params, setParams] = useSearchParams();
    const threadRef = useRef<HTMLDivElement>(null);
    const [editing, setEditing] = useState<string | null>(() =>
        params.get("bozza") === "modifica" && draft ? (draft.proposed_text ?? "") : null
    );
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [writeText, setWriteText] = useState("");
    const shortcutsOn = useCrmShortcutsOn();
    const showKeys = shortcutsOn && !phone;

    // `?bozza=modifica` (dalla Home): l'editor si apre quando la bozza arriva.
    const wantsEdit = params.get("bozza") === "modifica";
    useEffect(() => {
        if (!wantsEdit || !draft) return;
        setEditing(draft.proposed_text ?? "");
        setParams(
            p => {
                p.delete("bozza");
                return p;
            },
            { replace: true }
        );
    }, [wantsEdit, draft, setParams]);

    // Il filo parte dal fondo, come una chat.
    useLayoutEffect(() => {
        const el = threadRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [items]);

    async function decide(kind: "send" | "edit" | "discard", text?: string) {
        if (!draft) return;
        setBusy(kind);
        setError(null);
        try {
            const result = await decideCrmDraft(draft.id, kind, text);
            if (kind === "discard") {
                if (!held) await setCrmAgentHold(venueId, true);
                showToast({
                    message: "Lo gestisci tu: l'agente non gli scrive più.",
                    type: "success"
                });
            } else if (!result) {
                showToast({
                    message: "Questa bozza era già stata decisa.",
                    type: "info"
                });
            } else {
                showToast({
                    message: "Messaggio in partenza dal numero dell'agente.",
                    type: "success"
                });
            }
            setEditing(null);
            await onChanged();
        } catch (err) {
            setError(errorText(err));
        } finally {
            setBusy(null);
        }
    }

    // Alt+I invia, Alt+M apre la modifica: solo con la bozza a vista e niente
    // editor aperto, e con le scorciatoie accese (`crmShortcuts.ts`).
    useEffect(() => {
        if (!draft || editing !== null || phone) return;
        function onKey(event: KeyboardEvent) {
            if (isCrmShortcut(event, "i")) {
                event.preventDefault();
                void decide("send");
            } else if (isCrmShortcut(event, "m")) {
                event.preventDefault();
                setEditing(draft?.proposed_text ?? "");
            }
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
        // `decide` legge solo la bozza, già fra le dipendenze.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft, editing, phone]);

    async function messageAction(message: CrmMessage, kind: "cancel" | "retry") {
        setBusy(message.id);
        setError(null);
        try {
            const done = kind === "cancel" ? await cancelCrmMessage(message.id) : await retryCrmMessage(message.id);
            await onChanged();
            if (!done) setError("Il messaggio è già cambiato: guarda la conversazione.");
            else
                showToast({
                    message: kind === "cancel" ? "Messaggio annullato." : "Di nuovo in coda: parte al prossimo giro.",
                    type: "success"
                });
        } catch (err) {
            setError(waErrorMessage(err));
        } finally {
            setBusy(null);
        }
    }

    function submitWrite() {
        const text = writeText.trim();
        if (!text) return;
        onWrite(text);
        setWriteText("");
    }

    const editTooLong = editing !== null && editing.length > DRAFT_MAX;
    const writeBox = canWrite && (phone || !draft);
    // `?scrivi=1` (dal Cerca, ⌘ Invio): il cursore in «Scrivi tu», se c'è.
    const writeRef = useRef<HTMLInputElement>(null);
    const wantsWrite = params.get("scrivi") === "1";
    useEffect(() => {
        if (!wantsWrite) return;
        writeRef.current?.focus();
        setParams(
            p => {
                p.delete("scrivi");
                return p;
            },
            { replace: true }
        );
    }, [wantsWrite, setParams]);
    const size = phone ? "md" : "sm";

    return (
        <div className={styles.chat}>
            <div ref={threadRef} className={styles.thread} role="log" aria-label="Conversazione">
                {messagesError && <InlineBanner variant="error">{messagesError}</InlineBanner>}
                {items === null && !messagesError && (
                    <Text variant="body-sm" colorVariant="muted" className={styles.threadNote}>
                        Caricamento…
                    </Text>
                )}
                {items !== null && items.length === 0 && (
                    <Text variant="body-sm" colorVariant="muted" className={styles.threadNote}>
                        Nessun messaggio sul numero dell'agente.
                    </Text>
                )}
                {items?.map(item =>
                    item.kind === "event" ? (
                        <Text key={item.key} as="p" variant="caption" colorVariant="muted" className={styles.threadEvent}>
                            {item.text} · {chatTime(item.at, now)}
                        </Text>
                    ) : (
                        <Bubble
                            key={item.key}
                            message={item.message}
                            at={chatTime(item.at, now)}
                            busy={busy === item.message.id}
                            onCancel={() => void messageAction(item.message, "cancel")}
                            onRetry={() => void messageAction(item.message, "retry")}
                        />
                    )
                )}
            </div>

            <div className={styles.composer}>
                {error && <InlineBanner variant="error">{error}</InlineBanner>}
                {draft && (
                    <section className={styles.draft} data-level={draftWait?.level} aria-label="Bozza dell'agente">
                        <Text as="p" variant="caption" weight={700} className={styles.draftHead}>
                            <span className={styles.draftTitle}>Bozza dell'agente</span>
                            {draftWait && (
                                <span className={styles.draftWait} data-level={draftWait.level}>
                                    aspetta da {draftWait.wait}
                                </span>
                            )}
                        </Text>
                        {editing === null ? (
                            <>
                                <Text as="p" variant="body" className={styles.draftText}>
                                    {draft.proposed_text}
                                </Text>
                                <div className={styles.draftActions}>
                                    <Button
                                        variant="primary"
                                        size={size}
                                        loading={busy === "send"}
                                        disabled={busy !== null}
                                        onClick={() => void decide("send")}
                                    >
                                        Inviala così{" "}
                                        {showKeys && <kbd className={styles.kbdOnBrand}>{crmShortcutLabel("i")}</kbd>}
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        size={size}
                                        disabled={busy !== null}
                                        onClick={() => setEditing(draft.proposed_text ?? "")}
                                    >
                                        Modifica {showKeys && <kbd>{crmShortcutLabel("m")}</kbd>}
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        size={size}
                                        loading={busy === "discard"}
                                        disabled={busy !== null}
                                        onClick={() => void decide("discard")}
                                    >
                                        Scrivo io
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <>
                                <Textarea
                                    label="Testo che parte"
                                    rows={3}
                                    value={editing}
                                    onChange={e => setEditing(e.target.value)}
                                    error={editTooLong ? `Al massimo ${DRAFT_MAX} caratteri.` : undefined}
                                    autoFocus
                                />
                                <div className={styles.draftActions}>
                                    <Button
                                        variant="primary"
                                        size={size}
                                        loading={busy === "edit"}
                                        disabled={busy !== null || !editing.trim() || editTooLong}
                                        onClick={() => void decide("edit", editing.trim())}
                                    >
                                        Invia questo testo
                                    </Button>
                                    <Button variant="secondary" size={size} disabled={busy !== null} onClick={() => setEditing(null)}>
                                        Annulla
                                    </Button>
                                </div>
                            </>
                        )}
                        {!phone && (
                            <div className={styles.quickReplies}>
                                <Text as="span" variant="caption-xs" weight={700} className={styles.quickLabel}>
                                    Risposte pronte
                                </Text>
                                {QUICK_REPLIES.map(r => (
                                    <button
                                        key={r.label}
                                        type="button"
                                        className={styles.quickReply}
                                        disabled={busy !== null}
                                        onClick={() => setEditing(r.text)}
                                    >
                                        <Text as="span" variant="caption" color="inherit">
                                            {r.label}
                                        </Text>
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>
                )}
                {writeBox && (
                    <form
                        className={styles.writeBox}
                        onSubmit={e => {
                            e.preventDefault();
                            submitWrite();
                        }}
                    >
                        <TextInput
                            ref={writeRef}
                            aria-label="Scrivi tu, si apre WhatsApp"
                            placeholder="Scrivi tu"
                            value={writeText}
                            onChange={e => setWriteText(e.target.value)}
                            containerClassName={styles.writeInput}
                        />
                        <IconButton
                            type="submit"
                            variant="primary"
                            icon={<ArrowUp size={18} />}
                            aria-label="Apri WhatsApp con questo testo"
                            disabled={!writeText.trim()}
                        />
                    </form>
                )}
            </div>
        </div>
    );
}

/** Un messaggio della conversazione: a sinistra il lead, a destra noi; in coda si annulla, non partito si riprova. */
export function Bubble({
    message,
    at,
    busy,
    onCancel,
    onRetry
}: {
    message: CrmMessage;
    at: string;
    busy: boolean;
    onCancel: () => void;
    onRetry: () => void;
}) {
    const out = message.direction === "out";
    const status = message.status && message.status !== "sent" ? messageStatusLine(message) : null;
    const meta = [at, out ? messageAuthorLabel(message) : null, status].filter(Boolean).join(" · ");
    return (
        <div className={styles.bubbleRow} data-out={out || undefined}>
            <div className={styles.bubble} data-out={out || undefined} data-status={message.status ?? undefined}>
                <Text as="p" variant="body" color="inherit" className={styles.bubbleText}>
                    {messageText(message)}
                </Text>
                <Text as="span" variant="caption-xs" color="inherit" className={styles.bubbleMeta}>
                    {meta}
                </Text>
            </div>
            {message.status === "queued" && (
                <Button variant="ghost" size="sm" loading={busy} onClick={onCancel}>
                    Annulla
                </Button>
            )}
            {message.status === "failed" && message.purpose === "first_message" && (
                <Button variant="ghost" size="sm" loading={busy} onClick={onRetry}>
                    Riprova
                </Button>
            )}
        </div>
    );
}
