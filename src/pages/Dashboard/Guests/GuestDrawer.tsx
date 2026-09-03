// Rubrica clienti — scheda del singolo cliente.
//
// Contiene le sole due cose che il locale scrive a mano: note e tag. Tutto il
// resto (nome, contatti, visite) è derivato dalle prenotazioni e non è
// editabile qui — riscriverlo a mano lo farebbe divergere al primo arrivo.
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
    listReservationGuestVisits,
    updateReservationGuestNotes
} from "@/services/supabase/reservationGuests";
import type {
    ReservationGuestSummary,
    ReservationGuestVisit
} from "@/types/reservationGuest";
import { statusMetaLoose } from "@/utils/reservationStatusMeta";
import { formatCustomerSince, visibilityFootnote } from "@/utils/guestVisibilityCopy";
import styles from "./Guests.module.scss";

/** Marcature proposte. Restano suggerimenti: il campo libero resta il vero
 *  strumento, queste servono solo a evitare dieci grafie di "abituale".
 *  Niente dati sanitari fra i suggerimenti: il ristoratore può sempre
 *  scriverseli a mano sul singolo cliente, ma non li proponiamo come
 *  categoria standard applicabile a chiunque. */
const SUGGESTED_TAGS = ["abituale", "VIP", "tavolo tranquillo"];

interface Props {
    open: boolean;
    onClose: () => void;
    guest: ReservationGuestSummary | null;
    tenantId: string;
    /** `guests.manage` su almeno una sede: abilita note e tag. */
    canManage: boolean;
    /** `isTenantWide(permissions)`. */
    tenantWide: boolean;
    /** Notifica il parent che note/tag sono cambiati (per ricaricare l'elenco). */
    onSaved: (updated: { venue_notes: string | null; tags: string[] }) => void;
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
    canManage,
    tenantWide,
    onSaved
}: Props) {
    const { showToast } = useToast();

    const [visits, setVisits] = useState<ReservationGuestVisit[]>([]);
    const [visitsLoading, setVisitsLoading] = useState(false);

    // Draft locale di note e tag: l'operatore scrive, poi salva. Nessun
    // autosave con debounce (pattern vietato in questo progetto).
    const [notesDraft, setNotesDraft] = useState("");
    const [tagsDraft, setTagsDraft] = useState<string[]>([]);
    const [newTag, setNewTag] = useState("");
    // Il campo compare solo dopo "+ aggiungi": tenerlo sempre aperto
    // suggerirebbe che marcare sia un passaggio obbligato, mentre la maggior
    // parte delle schede non ne ha nessuna.
    const [isAddingTag, setIsAddingTag] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const guestId = guest?.id ?? null;

    useEffect(() => {
        setNotesDraft(guest?.venue_notes ?? "");
        setTagsDraft(guest?.tags ?? []);
        setNewTag("");
        setIsAddingTag(false);
    }, [guest]);

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

    // Suggerimenti ancora disponibili: quelli già applicati stanno sopra come
    // pill, riproporli sarebbe un doppione.
    const suggestedAvailable = useMemo(
        () => SUGGESTED_TAGS.filter(t => !tagsDraft.includes(t)),
        [tagsDraft]
    );

    const isDirty = useMemo(() => {
        if (!guest) return false;
        const sameNotes = (guest.venue_notes ?? "") === notesDraft;
        const sameTags =
            guest.tags.length === tagsDraft.length &&
            guest.tags.every((t, i) => t === tagsDraft[i]);
        return !sameNotes || !sameTags;
    }, [guest, notesDraft, tagsDraft]);

    const footnote = visibilityFootnote(tenantWide);

    const toggleTag = useCallback((tag: string) => {
        setTagsDraft(prev =>
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
        );
    }, []);

    const addNewTag = useCallback(() => {
        const t = newTag.trim();
        if (!t) return;
        setTagsDraft(prev => (prev.includes(t) ? prev : [...prev, t]));
        setNewTag("");
        setIsAddingTag(false);
    }, [newTag]);

    const handleSave = useCallback(async () => {
        if (!guest || !tenantId) return;
        setIsSaving(true);
        try {
            const payload = {
                venue_notes: notesDraft.trim() ? notesDraft.trim() : null,
                tags: tagsDraft
            };
            await updateReservationGuestNotes(guest.id, tenantId, payload);
            onSaved(payload);
            showToast({ message: "Scheda cliente aggiornata.", type: "success" });
        } catch (err: unknown) {
            const code = (err as { code?: string }).code;
            showToast({
                message:
                    code === "42501"
                        ? "Permesso negato: non puoi modificare le schede cliente."
                        : "Errore durante il salvataggio.",
                type: "error"
            });
        } finally {
            setIsSaving(false);
        }
    }, [guest, tenantId, notesDraft, tagsDraft, onSaved, showToast]);

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
            {!canManage && (
                <p className={styles.drawerFooterHint}>
                    Solo chi ha il permesso "Gestione clienti" può modificare note e marcature.
                </p>
            )}
            <Button variant="secondary" onClick={onClose}>Chiudi</Button>
            {canManage && (
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

                    {/* ── Note del locale ───────────────────────────────── */}
                    <section className={styles.drawerSection}>
                        <h3 className={styles.drawerSectionTitle}>Note del locale</h3>
                        {canManage ? (
                            // Componente standard del progetto: stesso bordo,
                            // stesso focus ring e stessa altezza di tutti gli
                            // altri campi. Un'area di testo senza bordo non si
                            // legge come un campo compilabile.
                            <Textarea
                                value={notesDraft}
                                onChange={e => setNotesDraft(e.target.value)}
                                placeholder="es. preferisce il tavolo in fondo, arriva sempre con il cane…"
                                maxLength={1000}
                                rows={3}
                                aria-label="Note del locale su questo cliente"
                            />
                        ) : (
                            <div className={styles.drawerNotes}>
                                {guest.venue_notes ?? "Nessuna nota."}
                            </div>
                        )}
                        <p className={styles.guestsFootnote}>
                            Non visibili al cliente. Le note che scrive lui restano sulla
                            singola prenotazione.
                        </p>
                    </section>

                    {/* ── Marcature ──────────────────────────────────────
                         Prima il contenuto, poi lo strumento: le marcature
                         applicate stanno in cima (pill piene, con la x per
                         toglierle), e solo dopo la pill tratteggiata
                         "+ aggiungi".
                         Il campo di inserimento è chiuso di default e si apre
                         da quella pill; i suggerimenti vivono DENTRO il campo
                         aperto, non come pill sciolte sotto — sciolte
                         sembrerebbero marcature già applicate. */}
                    <section className={styles.drawerSection}>
                        <h3 className={styles.drawerSectionTitle}>Marcature</h3>
                        <p className={styles.sectionSubtitle}>
                            Etichette per ricordarti chi è: le vedi qui e sulla prenotazione.
                        </p>

                        <div className={styles.guestTagsEditor}>
                            {tagsDraft.map(tag => (
                                <span key={tag} className={styles.tagPill}>
                                    {tag}
                                    {canManage && (
                                        <button
                                            type="button"
                                            className={styles.tagPillRemove}
                                            onClick={() => toggleTag(tag)}
                                            aria-label={`Togli la marcatura ${tag}`}
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
                                    onClick={() => setIsAddingTag(true)}
                                >
                                    <Plus size={12} strokeWidth={2.5} aria-hidden />
                                    aggiungi
                                </button>
                            )}

                            {tagsDraft.length === 0 && !canManage && (
                                <Text variant="body" colorVariant="muted">
                                    Nessuna marcatura.
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
                                                setIsAddingTag(false);
                                                setNewTag("");
                                            }
                                        }}
                                        placeholder="es. abituale"
                                        maxLength={40}
                                        aria-label="Nuova marcatura"
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

                                {/* Suggerimenti dentro il box: sono scorciatoie
                                    per compilare il campo, non marcature già
                                    messe. Mostrati solo quelli non applicati. */}
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
                                                    toggleTag(tag);
                                                    setIsAddingTag(false);
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
