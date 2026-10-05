import { useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { DateInput } from "@/components/ui/Input/DateInput";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Select } from "@/components/ui/Select/Select";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { addCrmNote } from "@/services/supabase/crm";
import { clearCrmNextStep, setCrmNextStep } from "@/services/supabase/crmNextSteps";
import type { CrmContact, CrmEvent, CrmLead, CrmNextStep, CrmTeamMember } from "@/types/crm";
import { formatDateTimeIt } from "@/utils/formatDateTime";
import { leadAnswerRows } from "@/utils/crm/leadAnswers";
import { chatTime, describeEvent, nextStepDue, nextStepOverdue } from "@/utils/crm/leadDetail";
import { CRM_EVENT_LABEL, CRM_NOT_YET_ACTIVE, CRM_SOURCE_LABEL, crmErrorMessage, isMissingOnDatabase } from "@/utils/crm/stages";
import { FactSection } from "./FactSection";
import styles from "../LeadDetail.module.scss";

const STEP_MAX = 200;
const NOTES_SHOWN = 3;

function errorText(err: unknown): string {
    return isMissingOnDatabase(err) ? CRM_NOT_YET_ACTIVE : crmErrorMessage(err);
}

/**
 * Il prossimo passo (V5): cosa, entro quando, chi. «Cambia» apre il modulo
 * sul posto, «Fatto» lo toglie e lascia una nota nella storia.
 */
export function NextStepSection({
    venueId,
    step,
    loadError,
    team,
    userId,
    teamName,
    now,
    onChanged
}: {
    venueId: string;
    step: CrmNextStep | null | undefined;
    loadError: string | null;
    team: CrmTeamMember[];
    userId: string | null;
    teamName: (id: string | null) => string;
    now: Date;
    onChanged: () => Promise<void> | void;
}) {
    const { showToast } = useToast();
    const [form, setForm] = useState<{ step: string; dueOn: string; owner: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function openForm() {
        setError(null);
        setForm({ step: step?.step ?? "", dueOn: step?.due_on ?? "", owner: step?.owner_user_id ?? userId ?? "" });
    }

    async function save() {
        if (!form || !userId) return;
        setBusy(true);
        setError(null);
        try {
            await setCrmNextStep(venueId, { step: form.step, dueOn: form.dueOn || null, ownerUserId: form.owner || null }, userId);
            setForm(null);
            await onChanged();
            showToast({ message: "Prossimo passo salvato.", type: "success" });
        } catch (err) {
            setError(errorText(err));
        } finally {
            setBusy(false);
        }
    }

    async function done() {
        if (!step) return;
        setBusy(true);
        setError(null);
        try {
            await clearCrmNextStep(venueId);
            // La storia ricorda il passo fatto; se la nota non parte, il passo è comunque chiuso.
            await addCrmNote(venueId, `Fatto: ${step.step}`).catch(() => undefined);
            await onChanged();
            showToast({ message: "Passo fatto.", type: "success" });
        } catch (err) {
            setError(errorText(err));
        } finally {
            setBusy(false);
        }
    }

    const overdue = nextStepOverdue(step ?? null, now);
    const stepTooLong = (form?.step.length ?? 0) > STEP_MAX;

    return (
        <FactSection title="Prossimo passo" badge={overdue ? <StatusBadge variant="warning" label="Scaduto" /> : undefined}>
            {loadError && (
                <Text variant="body-sm" colorVariant="muted">
                    {loadError}
                </Text>
            )}
            {error && <InlineBanner variant="error">{error}</InlineBanner>}
            {!loadError && step === undefined && (
                <Text variant="body-sm" colorVariant="muted">
                    Caricamento…
                </Text>
            )}
            {!loadError && step !== undefined && form === null && (
                <>
                    {step ? (
                        <>
                            <Text as="p" variant="body-sm" weight={700}>
                                {step.step}
                            </Text>
                            <Text as="p" variant="body-sm" colorVariant="muted">
                                {[step.due_on ? nextStepDue(step.due_on, now) : null, step.owner_user_id ? teamName(step.owner_user_id) : null]
                                    .filter(Boolean)
                                    .join(" · ") || "Senza scadenza"}
                            </Text>
                        </>
                    ) : (
                        <Text as="p" variant="body-sm" colorVariant="muted">
                            Nessun passo fissato.
                        </Text>
                    )}
                    <div className={styles.factButtons}>
                        <Button variant="secondary" size="sm" onClick={openForm} disabled={busy || !userId}>
                            {step ? "Cambia" : "Fissa il passo"}
                        </Button>
                        {step && (
                            <Button variant="ghost" size="sm" onClick={() => void done()} loading={busy}>
                                Fatto
                            </Button>
                        )}
                    </div>
                </>
            )}
            {form && (
                <form
                    className={styles.stepForm}
                    onSubmit={e => {
                        e.preventDefault();
                        void save();
                    }}
                >
                    <TextInput
                        label="Cosa"
                        value={form.step}
                        onChange={e => setForm({ ...form, step: e.target.value })}
                        error={stepTooLong ? `Al massimo ${STEP_MAX} caratteri.` : undefined}
                        autoFocus
                    />
                    <DateInput label="Entro" value={form.dueOn} onChange={e => setForm({ ...form, dueOn: e.target.value })} />
                    <Select
                        label="Chi"
                        value={form.owner}
                        onChange={e => setForm({ ...form, owner: e.target.value })}
                        options={[{ value: "", label: "Nessuno" }, ...team.map(m => ({ value: m.user_id, label: m.display_name }))]}
                    />
                    <div className={styles.factButtons}>
                        <Button type="submit" variant="primary" size="sm" loading={busy} disabled={!form.step.trim() || stepTooLong}>
                            Salva
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setForm(null)} disabled={busy}>
                            Annulla
                        </Button>
                    </div>
                </form>
            )}
        </FactSection>
    );
}

/** Contatti (V5): referente, telefono con «copia», email, da dove è arrivato. */
export function ContactsSection({ contacts, leads }: { contacts: CrmContact[]; leads: CrmLead[] }) {
    const { showToast } = useToast();
    const first = leads[leads.length - 1] ?? leads[0];
    function copy(phone: string) {
        navigator.clipboard
            .writeText(phone)
            .then(() => showToast({ message: "Numero copiato.", type: "success" }))
            .catch(() => showToast({ message: "Non riesco a copiare: selezionalo a mano.", type: "warning" }));
    }
    return (
        <FactSection title="Contatti">
            <dl className={styles.facts}>
                {contacts.map(c => (
                    <div key={c.id} className={styles.factGroup}>
                        <div className={styles.factRow}>
                            <Text as="dt" variant="body-sm" colorVariant="muted">
                                Referente
                            </Text>
                            <Text as="dd" variant="body-sm">
                                {c.name || "—"}
                            </Text>
                        </div>
                        {c.phone_e164 && (
                            <div className={styles.factRow}>
                                <Text as="dt" variant="body-sm" colorVariant="muted">
                                    Telefono
                                </Text>
                                <Text as="dd" variant="body-sm">
                                    <a href={`tel:${c.phone_e164}`} className={styles.phoneNumber}>
                                        {c.phone_e164}
                                    </a>{" "}
                                    <button type="button" className={styles.linkButton} onClick={() => copy(c.phone_e164 ?? "")}>
                                        copia
                                    </button>
                                </Text>
                            </div>
                        )}
                        {c.email && (
                            <div className={styles.factRow}>
                                <Text as="dt" variant="body-sm" colorVariant="muted">
                                    Email
                                </Text>
                                <Text as="dd" variant="body-sm" className={styles.breakAll}>
                                    {c.email}
                                </Text>
                            </div>
                        )}
                    </div>
                ))}
                {first && (
                    <div className={styles.factRow}>
                        <Text as="dt" variant="body-sm" colorVariant="muted">
                            Da dove
                        </Text>
                        <Text as="dd" variant="body-sm">
                            {CRM_SOURCE_LABEL[first.source]}
                            {first.ad_name ? ` · ${first.ad_name}` : ""}
                        </Text>
                    </div>
                )}
            </dl>
        </FactSection>
    );
}

/** Richieste (V5): cosa ha scritto nel modulo, una richiesta dopo l'altra. */
export function RequestsSection({ leads }: { leads: CrmLead[] }) {
    return (
        <FactSection title={leads.length > 1 ? `Richieste (${leads.length})` : "Richieste"}>
            {leads.length === 0 && (
                <Text variant="body-sm" colorVariant="muted">
                    Nessuna richiesta: inserito a mano.
                </Text>
            )}
            {leads.map(lead => {
                const answers = leadAnswerRows(lead);
                return (
                    <div key={lead.id} className={styles.request}>
                        {leads.length > 1 && (
                            <Text as="p" variant="caption" weight={600} colorVariant="muted">
                                {CRM_SOURCE_LABEL[lead.source]} · {formatDateTimeIt(lead.received_at)}
                            </Text>
                        )}
                        <dl className={styles.facts}>
                            {answers.map(row => (
                                <div key={row.label} className={styles.factRow}>
                                    <Text as="dt" variant="body-sm" colorVariant="muted">
                                        {row.label === "Interessi" ? "Vuole" : row.label}
                                    </Text>
                                    <Text as="dd" variant="body-sm">
                                        {row.value}
                                    </Text>
                                </div>
                            ))}
                        </dl>
                        {lead.consent_text && (
                            <Text as="p" variant="caption" colorVariant="muted">
                                Consenso: {lead.consent_text}
                                {lead.consent_at ? ` (${formatDateTimeIt(lead.consent_at)})` : ""}
                            </Text>
                        )}
                    </div>
                );
            })}
        </FactSection>
    );
}

/** Note (V5): le ultime, poi «+ nota veloce» che si salva con Invio. */
export function NotesSection({
    venueId,
    events,
    teamName,
    now,
    onChanged
}: {
    venueId: string;
    events: CrmEvent[];
    teamName: (id: string | null) => string;
    now: Date;
    onChanged: () => Promise<void> | void;
}) {
    const [text, setText] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [all, setAll] = useState(false);
    const notes = events.filter(e => e.type === "note");
    const shown = all ? notes : notes.slice(0, NOTES_SHOWN);

    async function save() {
        const note = text.trim();
        if (!note) return;
        setSaving(true);
        setError(null);
        try {
            await addCrmNote(venueId, note);
            setText("");
            await onChanged();
        } catch (err) {
            setError(crmErrorMessage(err));
        } finally {
            setSaving(false);
        }
    }

    return (
        <FactSection title="Note">
            {error && <InlineBanner variant="error">{error}</InlineBanner>}
            {shown.map(n => (
                <div key={n.id} className={styles.note}>
                    <Text as="p" variant="body-sm" className={styles.preWrap}>
                        {String(n.payload.text ?? "")}
                    </Text>
                    <Text as="p" variant="caption" colorVariant="muted">
                        {teamName(n.actor_user_id)} · {chatTime(n.created_at, now)}
                    </Text>
                </div>
            ))}
            {notes.length > NOTES_SHOWN && !all && (
                <button type="button" className={styles.linkButton} onClick={() => setAll(true)}>
                    Tutte le note ({notes.length})
                </button>
            )}
            <form
                onSubmit={e => {
                    e.preventDefault();
                    void save();
                }}
            >
                <TextInput
                    aria-label="Nota veloce, Invio per salvarla"
                    placeholder="+ nota veloce"
                    value={text}
                    maxLength={4000}
                    onChange={e => setText(e.target.value)}
                    disabled={saving}
                    containerClassName={styles.quickNote}
                />
            </form>
        </FactSection>
    );
}

/** La storia intera (scheda Storia al telefono): ogni fatto con chi e quando. */
export function History({ events, teamName }: { events: CrmEvent[]; teamName: (id: string | null) => string }) {
    return (
        <ul className={styles.history}>
            {events.map(event => (
                <li key={event.id}>
                    <ListRow
                        dense
                        title={CRM_EVENT_LABEL[event.type]}
                        subtitle={describeEvent(event, teamName) || undefined}
                        wrapSubtitle
                        meta={`${formatDateTimeIt(event.created_at)} · ${event.actor_user_id ? teamName(event.actor_user_id) : "Sistema"}`}
                    />
                </li>
            ))}
        </ul>
    );
}
