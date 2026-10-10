// Rubrica clienti — scheda del singolo cliente.
//
// Contiene le sole due cose che il locale scrive a mano: note e tag. Tutto il
// resto (nome, contatti, visite) è derivato dalle prenotazioni e non è
// editabile qui — riscriverlo a mano lo farebbe divergere al primo arrivo.
//
// NOTE E TAG SONO PER SEDE (FASE 5.3). I fatti sono dell'azienda, i giudizi
// sono della sede: la scheda mostra un blocco per ogni sede su cui chi guarda
// ha `guests.read`, e si scrive solo dove ha `guests.manage`. Un tenant con
// una sede vede un blocco solo, senza intestazione — uguale a prima. La
// pagina Clienti non ha una sede «attiva», quindi la sede non si sceglie: si
// vedono tutte le proprie, una sotto l'altra.
//
// Compatta (Clienti A, D154): telefono e numeri in due righe, i pallini dei
// 12 mesi, note ed etichette per sede, le visite in una tabella.
//
// ⚠️ AMBITO DEI NUMERI. Visite e assenze sono filtrate dalla RLS sulle sedi
// del chiamante, quindi i numeri in cima sono parziali per i ruoli
// activity-scoped. Lì l'ambito non sta nel valore ma nella nota di
// `visibilityFootnote` sotto la riga: una volta, per tutti.
//
// Nessuna azione di invio, nessuna esportazione, nessuna eliminazione: la
// scheda si consulta e si annota, punto.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { DetailPane } from "@/components/layout/DetailPane/DetailPane";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { Chip } from "@/components/ui/Chip/Chip";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import Text from "@/components/ui/Text/Text";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { useUnsavedChangesGuard } from "@/components/ui/UnsavedChangesBar/useUnsavedChangesGuard";
import { useToast } from "@/context/Toast/ToastContext";
import { useEnsureActive } from "@/hooks/useEnsureActive";
import {
    listReservationGuestNotes,
    listReservationGuestVisits,
    saveReservationGuestNote
} from "@/services/supabase/reservationGuests";
import type {
    ReservationGuestNoteInput,
    ReservationGuestSummary,
    ReservationGuestVisit,
    V2ReservationGuestNote
} from "@/types/reservationGuest";
import { statusMetaLoose } from "@/utils/reservationStatusMeta";
import { formatCustomerSince, visibilityFootnote } from "@/utils/guestVisibilityCopy";
import styles from "./Guests.module.scss";
import { formatPhoneForDisplay } from "./guestFormat";
import type { GuestActivity } from "./guestActivity";
import { MonthDots } from "./MonthDots";

/** Etichette proposte. Restano suggerimenti: il campo libero resta il vero
 *  strumento, queste servono solo a evitare dieci grafie di "abituale".
 *  Niente dati sanitari fra i suggerimenti: il ristoratore può sempre
 *  scriverseli a mano sul singolo cliente, ma non li proponiamo come
 *  categoria standard applicabile a chiunque. */
const SUGGESTED_TAGS = ["abituale", "VIP", "tavolo tranquillo"];

/** Una sede su cui chi guarda ha `guests.read`, con il suo diritto di scrittura. */
export interface GuestNoteActivity {
    id: string;
    name: string;
    /** `guests.manage` su QUESTA sede. */
    canManage: boolean;
}

interface Props {
    open: boolean;
    onClose: () => void;
    guest: ReservationGuestSummary;
    tenantId: string;
    /**
     * Le sedi di cui mostrare nota ed etichette: quelle con `guests.read`.
     * L'ordine è quello di visualizzazione.
     */
    activities: GuestNoteActivity[];
    /** `isTenantWide(permissions)`. */
    tenantWide: boolean;
    /** Note/tag salvati: il parent ricarica le etichette dell'elenco. */
    onSaved: () => void;
    /** Le frecce ↑ ↓: il cliente prima e dopo nell'elenco mostrato. */
    onPrev?: () => void;
    onNext?: () => void;
    /** «2 di 5» fra le frecce (D141). */
    position?: { index: number; total: number };
    /** I pallini dei 12 mesi e le sedi, dall'elenco; fuori elenco non ci sono. */
    activity?: GuestActivity;
}

const EMPTY_DRAFT: ReservationGuestNoteInput = { notes: "", tags: [] };

function sameDraft(a: ReservationGuestNoteInput, b: ReservationGuestNoteInput): boolean {
    return (
        (a.notes ?? "") === (b.notes ?? "") &&
        a.tags.length === b.tags.length &&
        a.tags.every((t, i) => t === b.tags[i])
    );
}

function draftFromRow(row: V2ReservationGuestNote | undefined): ReservationGuestNoteInput {
    return row ? { notes: row.notes ?? "", tags: row.tags } : EMPTY_DRAFT;
}

/** «20 set 2026, 20:30»: quando, nella tabella delle visite. */
function formatVisitDateTime(date: string, time: string): string {
    const [y, m, d] = date.split("-").map(n => parseInt(n, 10));
    if (!y || !m || !d) return date;
    const label = new Intl.DateTimeFormat("it-IT", {
        day: "numeric",
        month: "short",
        year: "numeric"
    }).format(new Date(y, m - 1, d));
    return `${label}, ${time.slice(0, 5)}`;
}

export default function GuestDrawer({
    open,
    onClose,
    guest,
    tenantId,
    activities,
    tenantWide,
    onSaved,
    onPrev,
    onNext,
    position,
    activity
}: Props) {
    const { showToast } = useToast();
    const { ensureActive } = useEnsureActive();

    const [visits, setVisits] = useState<ReservationGuestVisit[]>([]);
    const [visitsLoading, setVisitsLoading] = useState(false);

    // Draft locale di note e tag PER SEDE: l'operatore scrive, poi salva.
    // Nessun autosave con debounce (pattern vietato in questo progetto).
    // `saved` è ciò che sta nel DB (una riga per sede, o niente); `drafts`
    // ciò che c'è a schermo. Sporco = differiscono in almeno una sede.
    const [saved, setSaved] = useState<Map<string, V2ReservationGuestNote>>(new Map());
    const [drafts, setDrafts] = useState<Map<string, ReservationGuestNoteInput>>(new Map());
    const [notesLoading, setNotesLoading] = useState(false);
    // Il campo «nuova etichetta» compare solo dopo "+ aggiungi", e in una
    // sede sola alla volta: tenerlo sempre aperto suggerirebbe che marcare
    // sia un passaggio obbligato, mentre la maggior parte delle schede non
    // ne ha nessuna.
    const [addingTagFor, setAddingTagFor] = useState<string | null>(null);
    const [newTag, setNewTag] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const titleId = useId();

    const guestId = guest.id;

    const loadNotes = useCallback(async () => {
        if (!guestId || !tenantId) {
            setSaved(new Map());
            setDrafts(new Map());
            return;
        }
        const rows = await listReservationGuestNotes(guestId, tenantId);
        const byActivity = new Map(rows.map(r => [r.activity_id, r]));
        setSaved(byActivity);
        setDrafts(new Map(activities.map(a => [a.id, draftFromRow(byActivity.get(a.id))])));
    }, [guestId, tenantId, activities]);

    useEffect(() => {
        setNewTag("");
        setAddingTagFor(null);
        if (!open) return;
        let alive = true;
        setNotesLoading(true);
        loadNotes()
            .catch(() => {
                if (alive) showToast({ message: "Errore nel caricamento delle note.", type: "error" });
            })
            .finally(() => { if (alive) setNotesLoading(false); });
        return () => { alive = false; };
    }, [open, loadNotes, showToast]);

    useEffect(() => {
        if (!open || !guestId || !tenantId) {
            setVisits([]);
            return;
        }
        let alive = true;
        setVisitsLoading(true);
        listReservationGuestVisits(guestId, tenantId)
            .then(rows => { if (alive) setVisits(rows); })
            .catch(() => {
                if (alive) {
                    setVisits([]);
                    showToast({ message: "Errore nel caricamento dello storico.", type: "error" });
                }
            })
            .finally(() => { if (alive) setVisitsLoading(false); });
        return () => { alive = false; };
    }, [open, guestId, tenantId, showToast]);

    const draftFor = useCallback(
        (activityId: string) => drafts.get(activityId) ?? EMPTY_DRAFT,
        [drafts]
    );

    const isDirty = useMemo(
        () => activities.some(a => !sameDraft(draftFor(a.id), draftFromRow(saved.get(a.id)))),
        [activities, draftFor, saved]
    );

    const canManageAny = activities.some(a => a.canManage);

    const footnote = visibilityFootnote(tenantWide);

    const setNotes = useCallback((activityId: string, notes: string) => {
        setDrafts(prev => {
            const next = new Map(prev);
            next.set(activityId, { ...(prev.get(activityId) ?? EMPTY_DRAFT), notes });
            return next;
        });
    }, []);

    const toggleTag = useCallback((activityId: string, tag: string) => {
        setDrafts(prev => {
            const next = new Map(prev);
            const cur = prev.get(activityId) ?? EMPTY_DRAFT;
            next.set(activityId, {
                ...cur,
                tags: cur.tags.includes(tag) ? cur.tags.filter(t => t !== tag) : [...cur.tags, tag]
            });
            return next;
        });
    }, []);

    const addNewTag = useCallback(() => {
        const t = newTag.trim();
        if (!t || !addingTagFor) return;
        setDrafts(prev => {
            const next = new Map(prev);
            const cur = prev.get(addingTagFor) ?? EMPTY_DRAFT;
            if (!cur.tags.includes(t)) next.set(addingTagFor, { ...cur, tags: [...cur.tags, t] });
            return next;
        });
        setNewTag("");
        setAddingTagFor(null);
    }, [newTag, addingTagFor]);

    const handleSave = useCallback(async () => {
        if (!guest || !tenantId) return;
        // Solo le sedi cambiate: una scrittura per sede toccata, non una per
        // sede visibile. Chi non ha `guests.manage` su una sede non ha il
        // campo, quindi non può averla sporcata.
        const changed = activities.filter(
            a => a.canManage && !sameDraft(draftFor(a.id), draftFromRow(saved.get(a.id)))
        );
        if (changed.length === 0) return;
        // Le note si scrivono solo con l'abbonamento attivo, come ogni altra
        // scrittura del pannello (#729).
        if (!ensureActive()) return;
        setIsSaving(true);
        try {
            await Promise.all(
                changed.map(a => saveReservationGuestNote(tenantId, a.id, guest.id, draftFor(a.id)))
            );
            await loadNotes();
            onSaved();
            showToast({ message: "Scheda cliente aggiornata.", type: "success" });
        } catch (err: unknown) {
            const code = (err as { code?: string }).code;
            showToast({
                message:
                    code === "42501"
                        ? "Non puoi modificare le note di questa sede."
                        : "Errore durante il salvataggio.",
                type: "error"
            });
        } finally {
            setIsSaving(false);
        }
    }, [guest, tenantId, activities, draftFor, saved, ensureActive, loadNotes, onSaved, showToast]);

    // Guardia di uscita (§27, C3): note o etichette non salvate. Il cliente è
    // nell'indirizzo, quindi chiudere, le frecce, il clic su un'altra riga e
    // l'indietro del browser cambiano tutti `?guest=`: li ferma la guardia
    // del layout, una sola.
    useUnsavedChangesGuard(open && isDirty && !isSaving, { search: true });

    const footer = (
        <>
            {!canManageAny && (
                // Si dice cosa non si può fare, non quale permesso manca: la
                // rubrica si consulta durante il servizio, quindi è sala e non
                // amministrazione. Il nome del permesso vive nella schermata
                // Team, dove serve a chi lo assegna.
                <Text as="p" variant="caption" colorVariant="muted" className={styles.footerHint}>
                    Non hai i permessi per modificare note ed etichette di questo cliente.
                </Text>
            )}
            <Button variant="secondary" onClick={onClose}>Chiudi</Button>
            {canManageAny && (
                <Button
                    variant="primary"
                    onClick={handleSave}
                    disabled={!isDirty || isSaving}
                    loading={isSaving}
                >
                    Salva
                </Button>
            )}
        </>
    );

    // «Copia»: il numero da incollare nel telefono o in un messaggio. Se il
    // browser non lo permette, il numero resta selezionato da copiare a mano.
    const phoneRef = useRef<HTMLAnchorElement>(null);
    const copyPhone = useCallback(() => {
        navigator.clipboard
            .writeText(guest.phone_e164)
            .then(() => showToast({ message: "Numero copiato.", type: "success" }))
            .catch(() => {
                const el = phoneRef.current;
                const sel = window.getSelection();
                if (!el || !sel) return;
                const range = document.createRange();
                range.selectNodeContents(el);
                sel.removeAllRanges();
                sel.addRange(range);
            });
    }, [guest.phone_e164, showToast]);

    const sedi = activity?.sedi.map(s => s.name).join(" · ");
    const summary = [
        `${guest.visible_visits} ${guest.visible_visits === 1 ? "visita" : "visite"}`,
        guest.visible_no_shows > 0
            ? `${guest.visible_no_shows} ${guest.visible_no_shows === 1 ? "assenza" : "assenze"}`
            : null,
        guest.first_visit_date ? `cliente da ${formatCustomerSince(guest.first_visit_date)}` : null,
        sedi ? `passato da ${sedi}` : null
    ]
        .filter(Boolean)
        .join(" · ");

    return (
        <DetailPane
            open={open}
            onClose={onClose}
            aria-labelledby={titleId}
            backLabel="Clienti"
            onPrev={onPrev}
            onNext={onNext}
            position={position}
        >
            <DrawerLayout title={guest.display_name} titleId={titleId} onClose={onClose} footer={footer}>
                <div className={styles.drawerBody}>
                    {/* ── Telefono, e i numeri in una riga ─────────────── */}
                    <div className={styles.contact}>
                        <p className={styles.contactLine}>
                            <a ref={phoneRef} href={`tel:${guest.phone_e164}`}>{formatPhoneForDisplay(guest.phone_e164)}</a>
                            <button type="button" className={styles.linkButton} onClick={copyPhone}>
                                Copia
                            </button>
                        </p>
                        {guest.email && (
                            <p className={styles.contactLine}>
                                <a href={`mailto:${guest.email}`}>{guest.email}</a>
                            </p>
                        )}
                        <p className={styles.summary}>{summary}</p>
                        {footnote && (
                            <Text as="p" variant="caption" colorVariant="muted">{footnote}</Text>
                        )}
                    </div>

                    {activity && (
                        <section className={styles.section} aria-label="Ultimi 12 mesi">
                            <h3 className={styles.kicker}>Ultimi 12 mesi</h3>
                            <MonthDots months={activity.months} />
                        </section>
                    )}

                    {/* ── Note ed etichette, PER SEDE ─────────────────────
                         Una parte per ogni sede visibile: la nota che un locale
                         scrive vale in quel locale. */}
                    {activities.length === 0 ? (
                        <section className={styles.section}>
                            <h3 className={styles.kicker}>Note</h3>
                            <Text variant="body-sm" colorVariant="muted">
                                Non puoi vedere le note di nessuna sede.
                            </Text>
                        </section>
                    ) : notesLoading && saved.size === 0 && drafts.size === 0 ? (
                        <section className={styles.section}>
                            <h3 className={styles.kicker}>Note</h3>
                            <Skeleton height="96px" />
                        </section>
                    ) : (
                        activities.map(activity => {
                            const draft = draftFor(activity.id);
                            const canManage = activity.canManage;
                            const isAddingTag = addingTagFor === activity.id;
                            const suggestedAvailable = SUGGESTED_TAGS.filter(t => !draft.tags.includes(t));
                            return (
                                <section key={activity.id} className={styles.section}>
                                    <h3 className={styles.kicker}>Note · {activity.name}</h3>
                                    {canManage ? (
                                        <Textarea
                                            value={draft.notes ?? ""}
                                            onChange={e => setNotes(activity.id, e.target.value)}
                                            placeholder="Scrivi una nota per il locale…"
                                            maxLength={1000}
                                            rows={2}
                                            aria-label={`Note del locale su questo cliente — ${activity.name}`}
                                        />
                                    ) : (
                                        <Text variant="body-sm">
                                            {draft.notes?.trim() ? draft.notes : "Nessuna nota."}
                                        </Text>
                                    )}

                                    {/* Etichette: quelle messe, poi le proposte con «+»,
                                        poi «aggiungi» per scriverne una. */}
                                    <div className={styles.tagRow}>
                                        {draft.tags.map(tag => (
                                            <Chip
                                                key={tag}
                                                label={tag}
                                                selected
                                                onRemove={canManage ? () => toggleTag(activity.id, tag) : undefined}
                                                removeLabel="Togli l'etichetta"
                                            />
                                        ))}
                                        {canManage &&
                                            suggestedAvailable.map(tag => (
                                                <Chip
                                                    key={tag}
                                                    label={`+ ${tag}`}
                                                    ariaLabel={`Aggiungi l'etichetta ${tag}`}
                                                    onClick={() => toggleTag(activity.id, tag)}
                                                />
                                            ))}
                                        {canManage && !isAddingTag && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                leftIcon={<Plus size={14} aria-hidden />}
                                                onClick={() => {
                                                    setNewTag("");
                                                    setAddingTagFor(activity.id);
                                                }}
                                            >
                                                aggiungi
                                            </Button>
                                        )}
                                        {draft.tags.length === 0 && !canManage && (
                                            <Text variant="body-sm" colorVariant="muted">
                                                Nessuna etichetta.
                                            </Text>
                                        )}
                                    </div>

                                    {canManage && isAddingTag && (
                                        <div className={styles.tagAddRow}>
                                            <TextInput
                                                value={newTag}
                                                onChange={e => setNewTag(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === "Enter") {
                                                        e.preventDefault();
                                                        addNewTag();
                                                    }
                                                    if (e.key === "Escape") {
                                                        setAddingTagFor(null);
                                                        setNewTag("");
                                                    }
                                                }}
                                                placeholder="es. vegetariano"
                                                maxLength={40}
                                                aria-label={`Nuova etichetta — ${activity.name}`}
                                                // Qui l'autofocus è corretto: il campo
                                                // esiste solo perché l'utente ha appena
                                                // premuto «aggiungi».
                                                autoFocus
                                            />
                                            <Button variant="secondary" onClick={addNewTag} disabled={!newTag.trim()}>
                                                Aggiungi
                                            </Button>
                                        </div>
                                    )}
                                    <Text as="p" variant="caption" colorVariant="muted">
                                        Resta in questa sede e il cliente non la vede mai.
                                    </Text>
                                </section>
                            );
                        })
                    )}

                    {/* ── Le visite ─────────────────────────────────────── */}
                    <section className={styles.section}>
                        <h3 className={styles.kicker}>Le visite</h3>
                        {visitsLoading ? (
                            <Skeleton height="72px" />
                        ) : visits.length === 0 ? (
                            <Text variant="body-sm" colorVariant="muted">
                                Nessuna visita visibile.
                            </Text>
                        ) : (
                            <table className={styles.visits}>
                                <thead>
                                    <tr>
                                        <th scope="col">Quando</th>
                                        <th scope="col">Sede</th>
                                        <th scope="col">Persone</th>
                                        <th scope="col">
                                            <span className={styles.srOnly}>Com'è andata</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visits.map(v => {
                                        const meta = statusMetaLoose(v.status);
                                        return (
                                            <tr key={v.reservation_id}>
                                                <td>
                                                    {formatVisitDateTime(v.reservation_date, v.reservation_time)}
                                                    {v.guest_notes && <span className={styles.visitNote}>“{v.guest_notes}”</span>}
                                                </td>
                                                <td>{v.activity_name ?? "sede"}</td>
                                                <td>{v.party_size}</td>
                                                <td>
                                                    <StatusBadge variant={meta.variant} label={meta.label} />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </section>
                </div>
            </DrawerLayout>
        </DetailPane>
    );
}
