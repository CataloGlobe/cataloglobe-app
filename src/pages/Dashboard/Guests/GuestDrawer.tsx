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

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Mail, MapPin, Phone, Plus, Users, X } from "lucide-react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { useToast } from "@/context/Toast/ToastContext";
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
    guest: ReservationGuestSummary | null;
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

    const guestId = guest?.id ?? null;

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
    }, [guest, tenantId, activities, draftFor, saved, loadNotes, onSaved, showToast]);

    if (!guest) {
        return (
            <SystemDrawer open={open} onClose={onClose} width={560} autoFocusFirstInput={false}>
                <DrawerLayout header={<Text variant="title-sm" weight={600}>Cliente</Text>}>
                    <div className={styles.drawerBody}>
                        <Text variant="body" colorVariant="muted">
                            Nessun cliente selezionato.
                        </Text>
                    </div>
                </DrawerLayout>
            </SystemDrawer>
        );
    }

    const footer = (
        <div className={styles.drawerFooter}>
            {!canManageAny && (
                // Si dice cosa non si può fare, non quale permesso manca: la
                // rubrica si consulta durante il servizio, quindi è sala e non
                // amministrazione. Il nome del permesso vive nella schermata
                // Team, dove serve a chi lo assegna.
                <p className={styles.drawerFooterHint}>
                    Non hai i permessi per modificare note ed etichette di questo cliente.
                </p>
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
        </div>
    );

    return (
        <SystemDrawer open={open} onClose={onClose} width={560} autoFocusFirstInput={false}>
            <DrawerLayout
                header={
                    <div className={styles.drawerHeaderTitle}>
                        <Text variant="title-sm" weight={600}>{guest.display_name}</Text>
                    </div>
                }
                footer={footer}
            >
                <div className={styles.drawerBody}>
                    {/* ── Contatti ──────────────────────────────────────── */}
                    <section className={styles.drawerSection}>
                        <h3 className={styles.drawerSectionTitle}>Contatti</h3>
                        <ul className={styles.contactList}>
                            <li className={styles.contactItem}>
                                <Phone size={14} strokeWidth={2} aria-hidden className={styles.contactIcon} />
                                <a className={styles.contactLink} href={`tel:${guest.phone_e164}`}>
                                    {guest.phone_e164}
                                </a>
                            </li>
                            {guest.email && (
                                <li className={styles.contactItem}>
                                    <Mail size={14} strokeWidth={2} aria-hidden className={styles.contactIcon} />
                                    <a className={styles.contactLink} href={`mailto:${guest.email}`}>
                                        {guest.email}
                                    </a>
                                </li>
                            )}
                        </ul>
                    </section>

                    {/* ── Le tre cose che si guardano prima del servizio ──
                         Tre metriche affiancate invece di una frase in linea:
                         "quante volte è venuto", "quante volte non si è
                         presentato", "da quanto lo conosciamo" sono tre
                         domande distinte e vanno lette separatamente.
                         Il valore delle assenze si colora solo se > 0. */}
                    <section className={styles.drawerSection}>
                        <h3 className={styles.drawerSectionTitle}>Storico in sintesi</h3>
                        <div className={styles.metricRow}>
                            <div className={styles.metric}>
                                <span className={styles.metricValue}>{guest.visible_visits}</span>
                                <span className={styles.metricLabel}>
                                    {guest.visible_visits === 1 ? "Visita" : "Visite"}
                                </span>
                            </div>
                            <div className={styles.metric}>
                                <span
                                    className={
                                        guest.visible_no_shows > 0
                                            ? styles.metricValueAlert
                                            : styles.metricValue
                                    }
                                >
                                    {guest.visible_no_shows}
                                </span>
                                <span className={styles.metricLabel}>Non presentato</span>
                            </div>
                            <div className={styles.metric}>
                                <span className={styles.metricValueSmall}>
                                    {formatCustomerSince(guest.first_visit_date)}
                                </span>
                                <span className={styles.metricLabel}>Cliente dal</span>
                            </div>
                        </div>
                        {footnote && <p className={styles.guestsFootnote}>{footnote}</p>}
                    </section>

                    {/* ── Note ed etichette, PER SEDE ─────────────────────
                         Un blocco per ogni sede visibile: la nota che un
                         locale scrive vale in quel locale. Con una sede sola
                         il blocco non ha intestazione (sarebbe rumore). */}
                    {activities.length === 0 ? (
                        <section className={styles.drawerSection}>
                            <h3 className={styles.drawerSectionTitle}>Note del locale</h3>
                            <Text variant="body" colorVariant="muted">
                                Non puoi vedere le note di nessuna sede.
                            </Text>
                        </section>
                    ) : notesLoading && saved.size === 0 && drafts.size === 0 ? (
                        <section className={styles.drawerSection}>
                            <h3 className={styles.drawerSectionTitle}>Note del locale</h3>
                            <div className={styles.skeleton} />
                        </section>
                    ) : (
                        activities.map(activity => {
                            const draft = draftFor(activity.id);
                            const canManage = activity.canManage;
                            const isAddingTag = addingTagFor === activity.id;
                            const suggestedAvailable = SUGGESTED_TAGS.filter(t => !draft.tags.includes(t));
                            return (
                                <section key={activity.id} className={styles.drawerSection}>
                                    {activities.length > 1 && (
                                        <h3 className={styles.drawerSectionTitle}>
                                            <MapPin size={14} strokeWidth={2} aria-hidden className={styles.contactIcon} />
                                            {activity.name}
                                        </h3>
                                    )}

                                    <h4 className={activities.length > 1 ? styles.drawerSubTitle : styles.drawerSectionTitle}>
                                        Note del locale
                                    </h4>
                                    {canManage ? (
                                        // Componente standard del progetto: stesso bordo,
                                        // stesso focus ring e stessa altezza di tutti gli
                                        // altri campi. Un'area di testo senza bordo non si
                                        // legge come un campo compilabile.
                                        <Textarea
                                            value={draft.notes ?? ""}
                                            onChange={e => setNotes(activity.id, e.target.value)}
                                            placeholder="es. preferisce il tavolo in fondo, arriva sempre con il cane…"
                                            maxLength={1000}
                                            rows={3}
                                            aria-label={`Note del locale su questo cliente — ${activity.name}`}
                                        />
                                    ) : (
                                        <div className={styles.drawerNotes}>
                                            {draft.notes?.trim() ? draft.notes : "Nessuna nota."}
                                        </div>
                                    )}
                                    <p className={styles.guestsFootnote}>
                                        Resta in questa sede e non è mai visibile al cliente. Le note scritte
                                        dal cliente restano sulla singola prenotazione.
                                    </p>

                                    {/* Etichette: prima il contenuto (pill piene con la x),
                                        poi lo strumento ("+ aggiungi"). Il campo di
                                        inserimento è chiuso di default; i suggerimenti
                                        vivono DENTRO il campo aperto, non come pill sciolte
                                        sotto — sciolte sembrerebbero etichette già applicate. */}
                                    <h4 className={styles.drawerSubTitle}>Etichette</h4>
                                    <p className={styles.sectionSubtitle}>
                                        Ti aiutano a riconoscere il cliente quando prenota. Le vedi qui e sulle
                                        prenotazioni di questa sede.
                                    </p>

                                    <div className={styles.guestTagsEditor}>
                                        {draft.tags.map(tag => (
                                            <span key={tag} className={styles.tagPill}>
                                                {tag}
                                                {canManage && (
                                                    <button
                                                        type="button"
                                                        className={styles.tagPillRemove}
                                                        onClick={() => toggleTag(activity.id, tag)}
                                                        aria-label={`Togli l'etichetta ${tag}`}
                                                    >
                                                        <X size={12} strokeWidth={2.5} aria-hidden />
                                                    </button>
                                                )}
                                            </span>
                                        ))}

                                        {canManage && !isAddingTag && (
                                            <button
                                                type="button"
                                                className={styles.tagPillAdd}
                                                onClick={() => {
                                                    setNewTag("");
                                                    setAddingTagFor(activity.id);
                                                }}
                                            >
                                                <Plus size={12} strokeWidth={2.5} aria-hidden />
                                                aggiungi
                                            </button>
                                        )}

                                        {draft.tags.length === 0 && !canManage && (
                                            <Text variant="body" colorVariant="muted">
                                                Nessuna etichetta.
                                            </Text>
                                        )}
                                    </div>

                                    {canManage && isAddingTag && (
                                        <div className={styles.tagAddBox}>
                                            <div className={styles.guestTagAddRow}>
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
                                                    // premuto "+ aggiungi".
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
                                                <div className={styles.tagSuggestions}>
                                                    <span className={styles.tagSuggestionsLabel}>
                                                        oppure scegli
                                                    </span>
                                                    {suggestedAvailable.map(tag => (
                                                        <button
                                                            key={tag}
                                                            type="button"
                                                            className={styles.tagSuggestion}
                                                            onClick={() => {
                                                                toggleTag(activity.id, tag);
                                                                setAddingTagFor(null);
                                                                setNewTag("");
                                                            }}
                                                        >
                                                            {tag}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </section>
                            );
                        })
                    )}

                    {/* ── Storico visite ────────────────────────────────── */}
                    <section className={styles.drawerSection}>
                        <h3 className={styles.drawerSectionTitle}>Visite</h3>
                        {visitsLoading ? (
                            <div className={styles.skeleton} />
                        ) : visits.length === 0 ? (
                            <Text variant="body" colorVariant="muted">
                                Nessuna visita visibile.
                            </Text>
                        ) : (
                            // Contenitore unico con righe divise, come
                            // l'elenco: le visite sono una serie omogenea, e
                            // una card per visita spezzerebbe la lettura
                            // verticale della sequenza.
                            <ul className={styles.guestVisitList}>
                                {visits.map(v => {
                                    const meta = statusMetaLoose(v.status);
                                    return (
                                        <li key={v.reservation_id} className={styles.guestVisitRow}>
                                            <span className={styles.guestVisitDate}>
                                                <CalendarDays size={14} strokeWidth={2} aria-hidden />
                                                {formatVisitDateTime(v.reservation_date, v.reservation_time)}
                                            </span>
                                            <span className={styles.guestVisitMeta}>
                                                <span className={styles.guestVisitMetaItem}>
                                                    <Users size={13} strokeWidth={2} aria-hidden />
                                                    {v.party_size}
                                                </span>
                                                <span className={styles.guestVisitMetaItem}>
                                                    <MapPin size={13} strokeWidth={2} aria-hidden />
                                                    {v.activity_name ?? "sede"}
                                                </span>
                                                <StatusBadge variant={meta.variant} label={meta.label} />
                                            </span>
                                            {v.guest_notes && (
                                                <span className={styles.guestVisitNotes}>
                                                    “{v.guest_notes}”
                                                </span>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </section>
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
