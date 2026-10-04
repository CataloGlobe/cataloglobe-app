import { useEffect, useMemo, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import Text from "@/components/ui/Text/Text";
import { getCrmAgendaBusy, listCrmAppointments, moveCrmCall, runCrmAgenda, scheduleCrmCall } from "@/services/supabase/crmAgenda";
import type { CrmAgendaBusy, CrmAgendaSettings, CrmAppointment, CrmTeamMember } from "@/types/crm";
import {
    callDraftFrom,
    callDraftOverlaps,
    callDraftStart,
    callDraftWarnings,
    crmAgendaErrorMessage,
    toBusyIntervals,
    validateCallDraft,
    type CallDraft,
    type CallDraftErrors
} from "@/utils/crm/agenda";
import { DEFAULT_CALL_DURATION_MINUTES, suggestCallSlots } from "@shared/crmCallSlots";
import { CallForm } from "./components/CallForm";
import styles from "./Crm.module.scss";

const FORM_ID = "crm-call-form";
const LOOKAHEAD_DAYS = 7;

type Props = {
    open: boolean;
    venueId: string;
    venueName: string;
    /** null = nuova telefonata; altrimenti quella da spostare. */
    appointment: CrmAppointment | null;
    team: CrmTeamMember[];
    settings: CrmAgendaSettings | null;
    currentUserId: string | null;
    onClose: () => void;
    onSaved: (mode: "create" | "move") => Promise<void> | void;
};

/**
 * Fissa o sposta la telefonata. Gli orari liberi vengono dalle fasce delle
 * impostazioni, tolti gli impegni del calendario Google e le altre telefonate
 * di chi chiama. Un accavallamento non blocca: chiede «Fisso comunque?».
 */
export function CallScheduleDrawer({
    open,
    venueId,
    venueName,
    appointment,
    team,
    settings,
    currentUserId,
    onClose,
    onSaved
}: Props) {
    const defaultCaller =
        team.find(m => m.user_id === currentUserId)?.user_id ?? team.find(m => m.is_default_assignee)?.user_id ?? team[0]?.user_id ?? "";
    const [draft, setDraft] = useState<CallDraft>(() =>
        callDraftFrom(appointment, { durationMinutes: DEFAULT_CALL_DURATION_MINUTES, callerUserId: defaultCaller })
    );
    const [errors, setErrors] = useState<CallDraftErrors>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [busy, setBusy] = useState<CrmAgendaBusy[] | null>(null);
    const [busyNote, setBusyNote] = useState<string | null>(null);
    const [overlapQuestion, setOverlapQuestion] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setDraft(
            callDraftFrom(appointment, {
                durationMinutes: settings?.call_duration_minutes ?? DEFAULT_CALL_DURATION_MINUTES,
                callerUserId: defaultCaller
            })
        );
        setErrors({});
        setFormError(null);
        setIsSaving(false);
        setOverlapQuestion(null);
        setBusy(null);
        setBusyNote(null);

        let cancelled = false;
        const from = new Date();
        const to = new Date(from.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60_000);
        getCrmAgendaBusy(from.toISOString(), to.toISOString())
            .then(result => {
                if (cancelled) return;
                setBusy(result.busy);
                if (result.google === "off") setBusyNote("Calendario Google non collegato: contano solo le telefonate del CRM.");
                else if (result.google === "error") setBusyNote(`${result.google_error ?? "Calendario Google non letto."} Contano solo le telefonate del CRM.`);
            })
            .catch(async () => {
                // Senza l'edge: almeno le telefonate del CRM.
                try {
                    const rows = await listCrmAppointments(from.toISOString(), to.toISOString());
                    if (cancelled) return;
                    setBusy(
                        rows
                            .filter(r => r.status === "proposed" || r.status === "confirmed")
                            .map(r => ({
                                start: r.starts_at,
                                end: r.ends_at,
                                label: `Telefonata: ${r.venue_name}`,
                                appointment_id: r.id,
                                caller_user_id: r.caller_user_id
                            }))
                    );
                    setBusyNote("Calendario non letto: contano solo le telefonate del CRM.");
                } catch {
                    if (!cancelled) {
                        setBusy([]);
                        setBusyNote("Impegni non letti: controlla tu che l'orario sia libero.");
                    }
                }
            });
        return () => {
            cancelled = true;
        };
        // Si ricarica solo all'apertura.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, appointment]);

    // Contano gli eventi del calendario (di tutti) e le telefonate di chi chiama.
    const relevantBusy = useMemo(
        () => (busy ?? []).filter(b => !b.caller_user_id || b.caller_user_id === draft.callerUserId),
        [busy, draft.callerUserId]
    );

    const slots = useMemo(() => {
        if (busy === null || !settings) return busy === null ? null : [];
        const exclude = appointment?.id ?? null;
        return suggestCallSlots({
            now: new Date(),
            windows: settings.call_windows,
            durationMinutes: Number(draft.duration) || settings.call_duration_minutes,
            minNoticeMinutes: settings.call_min_notice_minutes,
            busy: toBusyIntervals(relevantBusy.filter(b => !exclude || b.appointment_id !== exclude)),
            days: LOOKAHEAD_DAYS,
            limit: 8
        });
    }, [busy, settings, relevantBusy, draft.duration, appointment]);

    const warnings = useMemo(() => callDraftWarnings(draft, settings), [draft, settings]);

    async function save(allowOverlap: boolean): Promise<boolean> {
        const start = callDraftStart(draft);
        if (!start) return false;
        setFormError(null);
        setIsSaving(true);
        try {
            const input = {
                startsAt: start.toISOString(),
                durationMinutes: Number(draft.duration),
                callerUserId: draft.callerUserId,
                allowOverlap
            };
            if (appointment) await moveCrmCall(appointment.id, input);
            else await scheduleCrmCall(venueId, { ...input, note: draft.note.trim() || null });
            void runCrmAgenda();
            await onSaved(appointment ? "move" : "create");
            return true;
        } catch (err) {
            setIsSaving(false);
            const code = typeof err === "object" && err !== null ? (err as { code?: unknown }).code : null;
            if (code === "CL001" && !allowOverlap) {
                setOverlapQuestion(crmAgendaErrorMessage(err));
                return false;
            }
            setFormError(crmAgendaErrorMessage(err));
            return false;
        }
    }

    async function handleSubmit() {
        const found = validateCallDraft(draft);
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        const hits = callDraftOverlaps(draft, relevantBusy, appointment?.id ?? null);
        if (hits.length > 0) {
            setOverlapQuestion(`Si sovrappone con: ${hits.map(h => h.label).join(", ")}.`);
            return;
        }
        await save(false);
    }

    return (
        <SystemDrawer open={open} onClose={onClose} size="md">
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        {appointment ? `Sposta la telefonata con ${venueName}` : `Fissa la telefonata con ${venueName}`}
                    </Text>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                            Annulla
                        </Button>
                        <Button variant="primary" type="submit" form={FORM_ID} loading={isSaving}>
                            {appointment ? "Sposta" : "Fissa"}
                        </Button>
                    </>
                }
            >
                <div className={styles.drawerForm}>
                    {formError && <InlineBanner variant="error">{formError}</InlineBanner>}
                    <CallForm
                        formId={FORM_ID}
                        draft={draft}
                        errors={errors}
                        team={team}
                        slots={slots}
                        slotsNote={busyNote}
                        warnings={warnings}
                        showNote={!appointment}
                        disabled={isSaving}
                        onChange={patch => setDraft(prev => ({ ...prev, ...patch }))}
                        onSubmit={() => void handleSubmit()}
                    />
                </div>
            </DrawerLayout>

            <ConfirmDialog
                isOpen={overlapQuestion !== null}
                onClose={() => setOverlapQuestion(null)}
                title="Fisso comunque?"
                message={overlapQuestion ?? ""}
                confirmLabel={appointment ? "Sposta comunque" : "Fissa comunque"}
                confirmVariant="primary"
                isLoading={isSaving}
                error={formError}
                onConfirm={async () => {
                    const ok = await save(true);
                    if (ok) setOverlapQuestion(null);
                    return ok;
                }}
            />
        </SystemDrawer>
    );
}
