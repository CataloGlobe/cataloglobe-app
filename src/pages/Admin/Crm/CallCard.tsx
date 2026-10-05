import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { useToast } from "@/context/Toast/ToastContext";
import {
    answerCrmCall,
    cancelCrmCall,
    getCrmAgendaSettings,
    listCrmVenueAppointments,
    runCrmAgenda,
    setCrmCallOutcome
} from "@/services/supabase/crmAgenda";
import type { CrmAgendaSettings, CrmAppointment, CrmCallOutcome, CrmTeamMember } from "@/types/crm";
import {
    CRM_APPOINTMENT_STATUS_LABEL,
    CRM_APPOINTMENT_STATUS_VARIANT,
    CRM_CALL_OUTCOME_LABEL,
    crmAgendaErrorMessage,
    describeCallTime,
    describeLeadMessages,
    isActiveAppointment
} from "@/utils/crm/agenda";
import { CallScheduleDrawer } from "./CallScheduleDrawer";
import { FactSection } from "./components/FactSection";
import styles from "./Crm.module.scss";

type Props = {
    venueId: string;
    venueName: string;
    /** Locale in Perso: niente telefonate nuove. */
    lost: boolean;
    team: CrmTeamMember[];
    currentUserId: string | null;
    teamName: (userId: string | null) => string;
    /** Dopo un cambio: la scheda ricarica fase e storia. */
    onChanged: () => Promise<void> | void;
    /** Sezione piatta della colonna a destra (V5) invece della card. */
    flat?: boolean;
    /** Il drawer «Fissa» aperto da fuori (tasto «Fissa telefonata» della testata). */
    scheduleOpen?: boolean;
    onScheduleOpenChange?: (open: boolean) => void;
    /** La telefonata attiva, per la testata della scheda. */
    onActiveChange?: (active: CrmAppointment | null) => void;
};

const OUTCOMES: CrmCallOutcome[] = ["done", "no_show", "postponed"];

/**
 * Card «Telefonata» della scheda (F1-4a): la telefonata attiva, chi chiama,
 * cosa parte al lead e l'evento su Google; Fissa, Sposta, Annulla; «Confermo»
 * per chi deve chiamare; l'esito dopo l'orario.
 */
export function CallCard({
    venueId,
    venueName,
    lost,
    team,
    currentUserId,
    teamName,
    onChanged,
    flat,
    scheduleOpen,
    onScheduleOpenChange,
    onActiveChange
}: Props) {
    const { showToast } = useToast();
    const [appointments, setAppointments] = useState<CrmAppointment[] | null>(null);
    const [settings, setSettings] = useState<CrmAgendaSettings | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [ownDrawerOpen, setOwnDrawerOpen] = useState(false);
    const drawerOpen = scheduleOpen ?? ownDrawerOpen;
    const setDrawerOpen = onScheduleOpenChange ?? setOwnDrawerOpen;
    const [cancelOpen, setCancelOpen] = useState(false);
    const [cancelReason, setCancelReason] = useState("");
    const [busyAction, setBusyAction] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const [rows, agenda] = await Promise.all([
                listCrmVenueAppointments(venueId),
                getCrmAgendaSettings().catch(() => null)
            ]);
            setAppointments(rows);
            setSettings(agenda);
            onActiveChange?.(rows.find(isActiveAppointment) ?? null);
            setLoadError(null);
        } catch {
            setLoadError("Non riesco a leggere le telefonate.");
        }
        // `onActiveChange` è della pagina: conta solo il locale.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [venueId]);

    useEffect(() => {
        void load();
    }, [load]);

    const active = appointments?.find(isActiveAppointment) ?? null;
    const last = appointments?.find(a => !isActiveAppointment(a)) ?? null;

    const afterChange = useCallback(
        async (message: string) => {
            await Promise.all([load(), onChanged()]);
            showToast({ message, type: "success" });
        },
        [load, onChanged, showToast]
    );

    async function run(action: string, fn: () => Promise<unknown>, message: string) {
        setBusyAction(action);
        setActionError(null);
        try {
            await fn();
            void runCrmAgenda();
            await afterChange(message);
        } catch (err) {
            setActionError(crmAgendaErrorMessage(err));
        } finally {
            setBusyAction(null);
        }
    }

    const started = active ? new Date(active.starts_at).getTime() <= Date.now() : false;
    const isCaller = active?.caller_user_id === currentUserId;

    const actions = active ? (
        <div className={styles.headerActions}>
            <Button variant="secondary" size="sm" onClick={() => setDrawerOpen(true)} disabled={busyAction !== null}>
                Sposta
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setCancelOpen(true)} disabled={busyAction !== null}>
                Annulla
            </Button>
        </div>
    ) : !lost && appointments !== null && !onScheduleOpenChange ? (
        <Button variant="primary" size="sm" onClick={() => setDrawerOpen(true)}>
            Fissa la telefonata
        </Button>
    ) : undefined;

    const Box = flat ? FactSection : Card;
    return (
        <Box
            title="Telefonata"
            badge={
                active ? (
                    <StatusBadge
                        variant={CRM_APPOINTMENT_STATUS_VARIANT[active.status]}
                        label={CRM_APPOINTMENT_STATUS_LABEL[active.status]}
                    />
                ) : undefined
            }
            actions={actions}
        >
            <div className={styles.venueNameForm}>
                {loadError && <InlineBanner variant="error">{loadError}</InlineBanner>}
                {actionError && <InlineBanner variant="error">{actionError}</InlineBanner>}

                {appointments === null && !loadError && (
                    <Text variant="body-sm" colorVariant="muted">
                        Caricamento…
                    </Text>
                )}

                {active && (
                    <>
                        <Text variant="body" weight={600}>
                            {describeCallTime(active)}
                        </Text>
                        <Text variant="body-sm">
                            Chiama {teamName(active.caller_user_id)}
                            {active.status === "proposed" ? ", deve ancora dire sì (gli arriva su Telegram)." : "."}
                        </Text>
                        {active.note && <Text variant="body-sm">Nota: {active.note}</Text>}
                        <Text variant="caption" colorVariant="muted">
                            {describeLeadMessages(active, settings)}
                        </Text>
                        {active.google_sync === "error" && (
                            <Text variant="caption" colorVariant="warning">
                                Calendario Google: {active.google_error ?? "non scritto."}
                            </Text>
                        )}
                        {active.google_sync === "pending" && (
                            <Text variant="caption" colorVariant="muted">
                                Calendario Google: in scrittura.
                            </Text>
                        )}

                        {active.status === "proposed" && isCaller && (
                            <div className={styles.choiceActions}>
                                <Button
                                    size="sm"
                                    variant="primary"
                                    loading={busyAction === "accept"}
                                    disabled={busyAction !== null}
                                    onClick={() => void run("accept", () => answerCrmCall(active.id, true), "Confermata: la fai tu.")}
                                >
                                    Sì, chiamo io
                                </Button>
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    loading={busyAction === "decline"}
                                    disabled={busyAction !== null}
                                    onClick={() => void run("decline", () => answerCrmCall(active.id, false), "Annullata.")}
                                >
                                    No, non posso
                                </Button>
                            </div>
                        )}

                        {active.status === "confirmed" && started && (
                            <>
                                <Text variant="body-sm" weight={600}>
                                    Com'è andata?
                                </Text>
                                <div className={styles.choiceActions}>
                                    {OUTCOMES.map(outcome => (
                                        <Button
                                            key={outcome}
                                            size="sm"
                                            variant={outcome === "done" ? "primary" : "secondary"}
                                            loading={busyAction === outcome}
                                            disabled={busyAction !== null}
                                            onClick={() =>
                                                void run(
                                                    outcome,
                                                    () => setCrmCallOutcome(active.id, outcome),
                                                    `Segnata: ${CRM_CALL_OUTCOME_LABEL[outcome].toLowerCase()}.`
                                                )
                                            }
                                        >
                                            {CRM_CALL_OUTCOME_LABEL[outcome]}
                                        </Button>
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                )}

                {!active && appointments !== null && (
                    <Text variant="body-sm" colorVariant="muted">
                        {last
                            ? `Ultima: ${describeCallTime(last)}, ${CRM_APPOINTMENT_STATUS_LABEL[last.status].toLowerCase()}${
                                  last.status_reason ? ` (${last.status_reason})` : ""
                              }.`
                            : lost
                              ? "Locale in Perso: niente telefonate."
                              : "Nessuna telefonata fissata."}
                    </Text>
                )}
            </div>

            <CallScheduleDrawer
                open={drawerOpen}
                venueId={venueId}
                venueName={venueName}
                appointment={active}
                team={team}
                settings={settings}
                currentUserId={currentUserId}
                onClose={() => setDrawerOpen(false)}
                onSaved={async mode => {
                    setDrawerOpen(false);
                    await afterChange(mode === "move" ? "Telefonata spostata." : "Telefonata fissata.");
                }}
            />

            <ConfirmDialog
                isOpen={cancelOpen}
                onClose={() => {
                    setCancelOpen(false);
                    setCancelReason("");
                }}
                title="Annullare la telefonata?"
                message="Si toglie dal calendario e non partono più conferma e promemoria. La fase del locale resta dov'è."
                confirmLabel="Annulla la telefonata"
                cancelLabel="Tienila"
                confirmVariant="danger"
                isLoading={busyAction === "cancel"}
                onConfirm={async () => {
                    if (!active) return true;
                    await run("cancel", () => cancelCrmCall(active.id, cancelReason.trim() || null), "Telefonata annullata.");
                    setCancelReason("");
                    return true;
                }}
            >
                <Textarea
                    label="Perché (facoltativo)"
                    rows={2}
                    maxLength={300}
                    value={cancelReason}
                    onChange={e => setCancelReason(e.target.value)}
                />
            </ConfirmDialog>
        </Box>
    );
}
