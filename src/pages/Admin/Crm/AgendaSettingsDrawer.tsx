import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { NumberInput } from "@/components/ui/Input/NumberInput";
import { TextInput } from "@/components/ui/Input/TextInput";
import { TimeInput } from "@/components/ui/Input/TimeInput";
import Text from "@/components/ui/Text/Text";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { updateCrmAgendaSettings } from "@/services/supabase/crmAgenda";
import type { CrmAgendaSettings } from "@/types/crm";
import { callTemplateError, windowsFromDraft, type WindowDraft } from "@/utils/crm/agenda";
import { CALL_DAY_LABELS } from "@shared/crmCallSlots";
import styles from "./Crm.module.scss";

const FORM_ID = "crm-agenda-settings-form";
const PLACEHOLDERS = "Segnaposti: {nome} {giorno} {ora} {locale} {mittente}. Vuoto = non parte.";

type Props = {
    open: boolean;
    settings: CrmAgendaSettings | null;
    onClose: () => void;
    onSaved: () => Promise<void> | void;
};

/**
 * Impostazioni dell'agenda: fasce in cui si chiama, durata e preavviso, id
 * del calendario Google, testi di conferma e promemoria al lead. Salvataggio
 * unico col bottone del piede.
 */
export function AgendaSettingsDrawer({ open, settings, onClose, onSaved }: Props) {
    const [windows, setWindows] = useState<WindowDraft[]>([]);
    const [duration, setDuration] = useState("10");
    const [notice, setNotice] = useState("60");
    const [calendarId, setCalendarId] = useState("");
    const [confirmText, setConfirmText] = useState("");
    const [reminderText, setReminderText] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!open || !settings) return;
        setWindows(settings.call_windows.map(w => ({ ...w, days: [...w.days] })));
        setDuration(String(settings.call_duration_minutes));
        setNotice(String(settings.call_min_notice_minutes));
        setCalendarId(settings.google_calendar_id ?? "");
        setConfirmText(settings.call_confirm_message ?? "");
        setReminderText(settings.call_reminder_message ?? "");
        setError(null);
        setIsSaving(false);
    }, [open, settings]);

    const confirmError = callTemplateError(confirmText);
    const reminderError = callTemplateError(reminderText);

    function patchWindow(index: number, patch: Partial<WindowDraft>) {
        setWindows(prev => prev.map((w, i) => (i === index ? { ...w, ...patch } : w)));
    }

    function toggleDay(index: number, day: number) {
        const w = windows[index];
        patchWindow(index, { days: w.days.includes(day) ? w.days.filter(d => d !== day) : [...w.days, day] });
    }

    async function handleSubmit() {
        const parsedWindows = windowsFromDraft(windows);
        if (!parsedWindows.ok) {
            setError(parsedWindows.error);
            return;
        }
        const d = Number(duration);
        const n = Number(notice);
        if (!Number.isInteger(d) || d < 5 || d > 120) {
            setError("La durata va da 5 a 120 minuti.");
            return;
        }
        if (!Number.isInteger(n) || n < 0 || n > 1440) {
            setError("Il preavviso va da 0 a 1440 minuti.");
            return;
        }
        if (confirmError || reminderError) {
            setError("Controlla i testi al lead.");
            return;
        }
        const cal = calendarId.trim();
        if (cal && (cal.length < 3 || cal.length > 200)) {
            setError("L'id del calendario non sembra giusto.");
            return;
        }
        setError(null);
        setIsSaving(true);
        try {
            await updateCrmAgendaSettings({
                call_windows: parsedWindows.value,
                call_duration_minutes: d,
                call_min_notice_minutes: n,
                google_calendar_id: cal || null,
                call_confirm_message: confirmText.trim() || null,
                call_reminder_message: reminderText.trim() || null
            });
            await onSaved();
        } catch {
            setError("Non sono riuscito a salvare. Riprova.");
            setIsSaving(false);
        }
    }

    return (
        <SystemDrawer open={open} onClose={onClose} size="md">
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Impostazioni dell'agenda
                    </Text>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                            Annulla
                        </Button>
                        <Button variant="primary" type="submit" form={FORM_ID} loading={isSaving}>
                            Salva
                        </Button>
                    </>
                }
            >
                <form
                    id={FORM_ID}
                    className={styles.drawerForm}
                    noValidate
                    onSubmit={e => {
                        e.preventDefault();
                        void handleSubmit();
                    }}
                >
                    {error && <InlineBanner variant="error">{error}</InlineBanner>}

                    <div className={styles.venueNameForm}>
                        <Text variant="body-sm" weight={600}>
                            Fasce in cui si chiama
                        </Text>
                        <Text variant="caption" colorVariant="muted">
                            Servono per gli orari liberi proposti e per l'avviso «fuori fascia». Ora di Roma.
                        </Text>
                        {windows.map((w, index) => (
                            <div key={index} className={styles.venueNameForm}>
                                <div className={styles.choiceActions} role="group" aria-label={`Giorni della fascia ${index + 1}`}>
                                    {CALL_DAY_LABELS.map((label, i) => (
                                        <Button
                                            key={label}
                                            type="button"
                                            size="sm"
                                            variant={w.days.includes(i + 1) ? "primary" : "secondary"}
                                            aria-pressed={w.days.includes(i + 1)}
                                            onClick={() => toggleDay(index, i + 1)}
                                            disabled={isSaving}
                                        >
                                            {label}
                                        </Button>
                                    ))}
                                </div>
                                <div className={styles.capFields}>
                                    <TimeInput
                                        label="Dalle"
                                        value={w.start}
                                        step={300}
                                        onChange={e => patchWindow(index, { start: e.target.value })}
                                        disabled={isSaving}
                                    />
                                    <TimeInput
                                        label="Alle"
                                        value={w.end}
                                        step={300}
                                        onChange={e => patchWindow(index, { end: e.target.value })}
                                        disabled={isSaving}
                                    />
                                </div>
                                <div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setWindows(prev => prev.filter((_, i) => i !== index))}
                                        disabled={isSaving}
                                    >
                                        <Trash2 size={16} /> Togli la fascia
                                    </Button>
                                </div>
                            </div>
                        ))}
                        <div>
                            <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => setWindows(prev => [...prev, { days: [1, 2, 3, 4, 5], start: "09:00", end: "11:00" }])}
                                disabled={isSaving || windows.length >= 12}
                            >
                                <Plus size={16} /> Aggiungi una fascia
                            </Button>
                        </div>
                    </div>

                    <div className={styles.capFields}>
                        <NumberInput
                            label="Durata (minuti)"
                            min={5}
                            max={120}
                            step={5}
                            value={duration}
                            onChange={e => setDuration(e.target.value)}
                            disabled={isSaving}
                        />
                        <NumberInput
                            label="Preavviso minimo (minuti)"
                            min={0}
                            max={1440}
                            step={15}
                            value={notice}
                            onChange={e => setNotice(e.target.value)}
                            disabled={isSaving}
                        />
                    </div>

                    <TextInput
                        label="Calendario Google (id)"
                        placeholder="Per esempio …@group.calendar.google.com"
                        maxLength={200}
                        value={calendarId}
                        onChange={e => setCalendarId(e.target.value)}
                        helperText="Il calendario va condiviso con l'email dell'account di servizio, con «Apportare modifiche agli eventi». Vuoto = niente Google."
                        disabled={isSaving}
                    />

                    <Textarea
                        label="Conferma al lead, appena fissata"
                        rows={3}
                        maxLength={1000}
                        value={confirmText}
                        onChange={e => setConfirmText(e.target.value)}
                        helperText={confirmError ?? PLACEHOLDERS}
                        disabled={isSaving}
                    />
                    <Textarea
                        label="Promemoria al lead, il giorno prima alle 18"
                        rows={3}
                        maxLength={1000}
                        value={reminderText}
                        onChange={e => setReminderText(e.target.value)}
                        helperText={reminderError ?? `${PLACEHOLDERS} Non parte se la telefonata è fissata dopo le 18 del giorno prima.`}
                        disabled={isSaving}
                    />
                </form>
            </DrawerLayout>
        </SystemDrawer>
    );
}
