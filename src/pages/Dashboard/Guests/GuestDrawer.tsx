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
// ⚠️ AMBITO DEI NUMERI. Visite e assenze sono filtrate dalla RLS sulle sedi
// del chiamante, quindi le tre metriche in cima sono parziali per i ruoli
// activity-scoped. Lì l'ambito non sta nel valore (un numero grande con
// accanto "nelle tue sedi" sarebbe illeggibile) ma nella nota di
// `visibilityFootnote` sotto la riga: una volta, per tutte e tre.
//
// Nessuna azione di invio, nessuna esportazione, nessuna eliminazione: la
// scheda si consulta e si annota, punto.

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Mail, Phone, Plus } from "lucide-react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { Chip } from "@/components/ui/Chip/Chip";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import Text from "@/components/ui/Text/Text";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { UnsavedChangesDialog } from "@/components/ui/UnsavedChangesDialog/UnsavedChangesDialog";
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

function formatVisitDateTime(date: string, time: string): string {
    const [y, m, d] = date.split("-").map(n => parseInt(n, 10));
    if (!y || !m || !d) return date;
    const label = new Intl.DateTimeFormat("it-IT", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric"
    }).format(new Date(y, m - 1, d));
    return `${label} · ${time.slice(0, 5)}`;
}

export default function GuestDrawer({
    open,
    onClose,
    guest,
    tenantId,
    activities,
    tenantWide,
    onSaved
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
    const [confirmingExit, setConfirmingExit] = useState(false);
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
        setConfirmingExit(false);
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

    // Guardia di uscita (§27, come la nuova prenotazione): chiudere con note
    // o etichette non salvate chiede prima di buttarle (C3).
    const requestClose = () => {
        if (isDirty && !isSaving) setConfirmingExit(true);
        else onClose();
    };

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
            <Button variant="secondary" onClick={requestClose}>Chiudi</Button>
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

    return (
        <SystemDrawer open={open} onClose={requestClose} size="md" autoFocusFirstInput={false} aria-labelledby={titleId}>
            <DrawerLayout title={guest.display_name} titleId={titleId} onClose={requestClose} footer={footer}>
                <div className={styles.drawerBody}>
                    {/* ── Contatti ──────────────────────────────────────── */}
                    <Card title="Contatti" flush>
                        <ListRow
                            leading={<Phone size={16} aria-hidden />}
                            title={<a href={`tel:${guest.phone_e164}`}>{formatPhoneForDisplay(guest.phone_e164)}</a>}
                        />
                        {guest.email && (
                            <ListRow
                                leading={<Mail size={16} aria-hidden />}
                                title={<a href={`mailto:${guest.email}`}>{guest.email}</a>}
                            />
                        )}
                    </Card>

                    {/* ── Le tre cose che si guardano prima del servizio ──
                         Tre righe con il valore a destra: "quante volte è
                         venuto", "quante volte non si è presentato", "da quanto
                         lo conosciamo" sono tre domande distinte. Non StatCard:
                         nessun confronto né azione (la sua stessa scheda lo
                         esclude). Le assenze si segnano solo se > 0. */}
                    <Card title="Storico in sintesi" flush>
                        <ListRow
                            title={guest.visible_visits === 1 ? "Visita" : "Visite"}
                            meta={<Text as="span" variant="body-sm" weight={600}>{guest.visible_visits}</Text>}
                            metaInline
                        />
                        <ListRow
                            title="Non presentato"
                            meta={
                                guest.visible_no_shows > 0 ? (
                                    <StatusBadge variant="warning" label={String(guest.visible_no_shows)} />
                                ) : (
                                    <Text as="span" variant="body-sm" weight={600}>0</Text>
                                )
                            }
                            metaInline
                        />
                        <ListRow
                            title="Cliente dal"
                            meta={<Text as="span" variant="body-sm" weight={600}>{formatCustomerSince(guest.first_visit_date)}</Text>}
                            metaInline
                        />
                    </Card>
                    {footnote && (
                        <Text as="p" variant="caption" colorVariant="muted">{footnote}</Text>
                    )}

                    {/* ── Note ed etichette, PER SEDE ─────────────────────
                         Una card per ogni sede visibile: la nota che un locale
                         scrive vale in quel locale. Con una sede sola la card
                         si chiama «Note del locale» (il nome sarebbe rumore). */}
                    {activities.length === 0 ? (
                        <Card title="Note del locale">
                            <Text variant="body-sm" colorVariant="muted">
                                Non puoi vedere le note di nessuna sede.
                            </Text>
                        </Card>
                    ) : notesLoading && saved.size === 0 && drafts.size === 0 ? (
                        <Card title="Note del locale">
                            <Skeleton height="96px" />
                        </Card>
                    ) : (
                        activities.map(activity => {
                            const draft = draftFor(activity.id);
                            const canManage = activity.canManage;
                            const isAddingTag = addingTagFor === activity.id;
                            const suggestedAvailable = SUGGESTED_TAGS.filter(t => !draft.tags.includes(t));
                            return (
                                <Card key={activity.id} title={activities.length > 1 ? activity.name : "Note del locale"}>
                                    <div className={styles.noteBlock}>
                                        {canManage ? (
                                            <Textarea
                                                label={activities.length > 1 ? "Note del locale" : undefined}
                                                value={draft.notes ?? ""}
                                                onChange={e => setNotes(activity.id, e.target.value)}
                                                placeholder="es. preferisce il tavolo in fondo, arriva sempre con il cane…"
                                                maxLength={1000}
                                                rows={3}
                                                aria-label={`Note del locale su questo cliente — ${activity.name}`}
                                            />
                                        ) : (
                                            <Text variant="body-sm">
                                                {draft.notes?.trim() ? draft.notes : "Nessuna nota."}
                                            </Text>
                                        )}
                                        <Text as="p" variant="caption" colorVariant="muted">
                                            Resta in questa sede e non è mai visibile al cliente. Le note scritte
                                            dal cliente restano sulla singola prenotazione.
                                        </Text>

                                        {/* Etichette: prima il contenuto (chip con la ×), poi
                                            lo strumento («aggiungi»). Il campo è chiuso di
                                            default; i suggerimenti vivono DENTRO il campo
                                            aperto: sciolti sembrerebbero etichette applicate. */}
                                        <Text as="h4" variant="body-sm" weight={600} className={styles.subTitle}>
                                            Etichette
                                        </Text>
                                        <Text as="p" variant="caption" colorVariant="muted">
                                            Ti aiutano a riconoscere il cliente quando prenota. Le vedi qui e sulle
                                            prenotazioni di questa sede.
                                        </Text>

                                        <div className={styles.tagRow}>
                                            {draft.tags.map(tag => (
                                                <Chip
                                                    key={tag}
                                                    label={tag}
                                                    onRemove={canManage ? () => toggleTag(activity.id, tag) : undefined}
                                                    removeLabel="Togli l'etichetta"
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
                                            <div className={styles.tagAdd}>
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
                                                        placeholder="es. abituale"
                                                        maxLength={40}
                                                        aria-label={`Nuova etichetta — ${activity.name}`}
                                                        // Qui l'autofocus è corretto: il campo
                                                        // esiste solo perché l'utente ha appena
                                                        // premuto «aggiungi».
                                                        autoFocus
                                                    />
                                                    <Button
                                                        variant="secondary"
                                                        onClick={addNewTag}
                                                        disabled={!newTag.trim()}
                                                    >
                                                        Aggiungi
                                                    </Button>
                                                </div>

                                                {suggestedAvailable.length > 0 && (
                                                    <div className={styles.tagRow}>
                                                        <Text as="span" variant="caption" colorVariant="muted">
                                                            oppure scegli
                                                        </Text>
                                                        {suggestedAvailable.map(tag => (
                                                            <Chip
                                                                key={tag}
                                                                label={tag}
                                                                onClick={() => {
                                                                    toggleTag(activity.id, tag);
                                                                    setAddingTagFor(null);
                                                                    setNewTag("");
                                                                }}
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </Card>
                            );
                        })
                    )}

                    {/* ── Storico visite ────────────────────────────────── */}
                    <Card title="Visite" flush={visitsLoading || visits.length > 0}>
                        {visitsLoading ? (
                            <>
                                <ListRow loading />
                                <ListRow loading />
                            </>
                        ) : visits.length === 0 ? (
                            <Text variant="body-sm" colorVariant="muted">
                                Nessuna visita visibile.
                            </Text>
                        ) : (
                            visits.map(v => {
                                const meta = statusMetaLoose(v.status);
                                return (
                                    <ListRow
                                        key={v.reservation_id}
                                        title={formatVisitDateTime(v.reservation_date, v.reservation_time)}
                                        subtitle={[
                                            `${v.party_size} ${v.party_size === 1 ? "coperto" : "coperti"}`,
                                            v.activity_name ?? "sede",
                                            v.guest_notes ? `“${v.guest_notes}”` : null
                                        ]
                                            .filter(Boolean)
                                            .join(" · ")}
                                        wrapSubtitle
                                        meta={<StatusBadge variant={meta.variant} label={meta.label} />}
                                    />
                                );
                            })
                        )}
                    </Card>
                </div>
            </DrawerLayout>
            <UnsavedChangesDialog
                isOpen={confirmingExit}
                title="Uscire senza salvare?"
                message="Note ed etichette non sono state salvate: quello che hai scritto andrà perso."
                cancelLabel="Resta"
                onCancel={() => setConfirmingExit(false)}
                onDiscard={() => {
                    setConfirmingExit(false);
                    onClose();
                }}
            />
        </SystemDrawer>
    );
}
