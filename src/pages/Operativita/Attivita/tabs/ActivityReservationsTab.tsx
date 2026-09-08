import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Lock, Plus } from "lucide-react";
import { usePlanFeatures } from "@/lib/planFeatures";
import { Button, Card, InlineBanner, MultiEmailInput } from "@/components/ui";
import { Switch } from "@/components/ui/Switch/Switch";
import { NumberInput } from "@/components/ui/Input/NumberInput";
import { TextInput } from "@/components/ui/Input/TextInput";
import { UnsavedChangesBar } from "@/components/ui/UnsavedChangesBar/UnsavedChangesBar";
import { Menu } from "@/components/ui/Menu";
import { ConfigAccordionSection } from "./components/ConfigAccordionSection";
import { updateActivity } from "@/services/supabase/activities";
import { listTenantMembers } from "@/services/supabase/team";
import type { TenantMemberRow } from "@/types/team";
import { usePermissions } from "@/context/PermissionsContext";
import { canDoOnTenant } from "@/lib/permissions";
import { useToast } from "@/context/Toast/ToastContext";
import { useTenant } from "@/context/useTenant";
import type { V2Activity } from "@/types/activity";
import type { V2ActivityHours } from "@/types/activity-hours";
// Card, accordion e classi della card Prenotazioni vivono nel modulo di
// Impostazioni (stesso precedente di Orari e Ordinazioni).
import styles from "./ActivitySettingsTab.module.scss";
import ownStyles from "./ActivityReservationsTab.module.scss";

interface ActivityReservationsTabProps {
    activity: V2Activity;
    tenantId: string;
    onReload: () => Promise<void>;
    /** `activity.manage` sulla sede: senza, il toggle si vede ma non si tocca. */
    canWrite?: boolean;
    /** Orari caricati dalla pagina: servono alla nota "mancano gli orari". */
    hours: V2ActivityHours[];
    isHoursLoading: boolean;
}

/**
 * Tab "Prenotazioni": toggle, promemoria, email avvisi/privacy, capacità e
 * ritmo degli arrivi. Card spostata intera da Impostazioni (FASE 6 passo 4);
 * lo split capienza/durata verso Sala è il passo 5.
 */
export const ActivityReservationsTab: React.FC<ActivityReservationsTabProps> = ({
    activity,
    tenantId,
    onReload,
    canWrite = true,
    hours,
    isHoursLoading
}) => {
    const { showToast } = useToast();
    const { selectedTenant } = useTenant();
    const { permissions } = usePermissions();
    const canReadTeam = permissions ? canDoOnTenant(permissions, "team.read") : false;

    // Feature gating solo UX: il toggle resta visibile e disabilitato, il
    // valore salvato non viene mutato. Enforcement server-side.
    const { hasFeature } = usePlanFeatures();
    const isReservationsLocked = !hasFeature("table_reservation");

    // ── Reservation alert recipients state ──────────────────────────────────
    const reservationEmails: string[] =
        activity.reservation_notification_emails ?? [];
    const [isUpdatingEmails, setIsUpdatingEmails] = useState(false);

    // ── Privacy contact email draft state ───────────────────────────────────
    // Campo singolo, quindi draft + UnsavedChangesBar invece del save-immediato
    // usato dagli avvisi: un indirizzo si scrive un carattere alla volta e
    // salvare a ogni tasto pubblicherebbe "mari", "mario", "mario@" in sequenza
    // dentro un'informativa privacy.
    // `tenants.legal_name` è nullable e appartiene ai dati di fatturazione:
    // senza, l'informativa privacy prenotazioni non si genera affatto.
    const hasLegalName = (selectedTenant?.legal_name ?? "").trim().length > 0;

    const savedPrivacyEmail = activity.reservation_privacy_contact_email ?? "";
    const [privacyEmailDraft, setPrivacyEmailDraft] = useState(savedPrivacyEmail);
    const [privacyEmailError, setPrivacyEmailError] = useState<string | null>(null);
    const [isSavingPrivacyEmail, setIsSavingPrivacyEmail] = useState(false);
    const lastSavedPrivacyEmailRef = useRef(savedPrivacyEmail);

    // Re-sync sul reload del parent preservando il draft sporco. Stesso pattern
    // di capacità / pagamenti / servizi.
    useEffect(() => {
        const prevSaved = lastSavedPrivacyEmailRef.current;
        if (savedPrivacyEmail === prevSaved) return;
        setPrivacyEmailDraft(prev => (prev === prevSaved ? savedPrivacyEmail : prev));
        lastSavedPrivacyEmailRef.current = savedPrivacyEmail;
    }, [savedPrivacyEmail]);

    const isPrivacyEmailDirty = privacyEmailDraft.trim() !== savedPrivacyEmail;

    // ── Regole di accettazione (draft) ───────────────────────────────────────
    // Capienza e durata vivono in Sala (FASE 6 passo 5): qui restano solo
    // le regole. Questo draft scrive SOLO i suoi cinque campi, mai
    // `reservation_capacity` / `reservation_duration_minutes`.
    // La capienza si LEGGE dalla riga sede (`activity.reservation_capacity`),
    // ricaricata dalla pagina dopo ogni salvataggio in Sala.
    const hasCapacity = activity.reservation_capacity != null;
    type CapacityDraft = {
        overbookingForm: "hard" | "soft";
        confirmationMode: "manuale" | "auto";
        // Pacing: stringa vuota = nessun limite, coerente con `capacity`.
        // Mai "0" — il CHECK a schema lo rifiuterebbe, ed è voluto.
        pacingSlotMinutes: string;
        pacingMaxCovers: string;
        pacingMaxBookings: string;
    };
    const savedCapacity: CapacityDraft = useMemo(() => ({
        overbookingForm: activity.reservation_overbooking_form ?? "hard",
        confirmationMode: activity.reservation_confirmation_mode ?? "manuale",
        pacingSlotMinutes: String(activity.reservation_pacing_slot_minutes ?? 15),
        pacingMaxCovers: activity.reservation_pacing_max_covers == null
            ? ""
            : String(activity.reservation_pacing_max_covers),
        pacingMaxBookings: activity.reservation_pacing_max_bookings == null
            ? ""
            : String(activity.reservation_pacing_max_bookings)
    }), [
        activity.reservation_overbooking_form,
        activity.reservation_confirmation_mode,
        activity.reservation_pacing_slot_minutes,
        activity.reservation_pacing_max_covers,
        activity.reservation_pacing_max_bookings
    ]);
    const [capacityDraft, setCapacityDraft] = useState<CapacityDraft>(savedCapacity);
    // Default open: the rest-state has no fill, so a closed header reads as a
    // plain title rather than an interactive control. Opening by default
    // surfaces the fields immediately; user can still toggle it shut.
    const [isCapacityOpen, setIsCapacityOpen] = useState(true);
    const [isSavingCapacity, setIsSavingCapacity] = useState(false);
    const lastSavedCapacityRef = useRef<CapacityDraft>(savedCapacity);

    // Re-sync draft when the saved row changes externally (parent reload),
    // but preserve the user's dirty draft. Same pattern as payments/services.
    useEffect(() => {
        const newSaved = savedCapacity;
        const prevSaved = lastSavedCapacityRef.current;
        if (
            newSaved.overbookingForm === prevSaved.overbookingForm &&
            newSaved.confirmationMode === prevSaved.confirmationMode &&
            newSaved.pacingSlotMinutes === prevSaved.pacingSlotMinutes &&
            newSaved.pacingMaxCovers === prevSaved.pacingMaxCovers &&
            newSaved.pacingMaxBookings === prevSaved.pacingMaxBookings
        ) {
            return;
        }
        setCapacityDraft(prev => {
            const isDraftEqualToOldSaved =
                prev.overbookingForm === prevSaved.overbookingForm &&
                prev.confirmationMode === prevSaved.confirmationMode &&
                prev.pacingSlotMinutes === prevSaved.pacingSlotMinutes &&
                prev.pacingMaxCovers === prevSaved.pacingMaxCovers &&
                prev.pacingMaxBookings === prevSaved.pacingMaxBookings;
            return isDraftEqualToOldSaved ? newSaved : prev;
        });
        lastSavedCapacityRef.current = newSaved;
    }, [savedCapacity]);

    const isCapacityDirty =
        capacityDraft.overbookingForm !== savedCapacity.overbookingForm ||
        capacityDraft.confirmationMode !== savedCapacity.confirmationMode ||
        capacityDraft.pacingSlotMinutes !== savedCapacity.pacingSlotMinutes ||
        capacityDraft.pacingMaxCovers !== savedCapacity.pacingMaxCovers ||
        capacityDraft.pacingMaxBookings !== savedCapacity.pacingMaxBookings;
    // Team members loaded lazily (only when reservations are enabled AND the
    // user holds `team.read`). Owner email surfaces here for the auto-fill
    // on toggle-activation and for the "+ Aggiungi dal team" quick-pick.
    const [teamMembers, setTeamMembers] = useState<TenantMemberRow[]>([]);
    const [ownerEmail, setOwnerEmail] = useState<string | null>(null);


    // Lazy fetch team members for the reservations email field. Gated on
    // `team.read` (scoped roles without that permission see no quick-pick
    // and no auto-fill). Only runs when reservations are enabled so we
    // avoid an unnecessary RPC on every settings page load.
    useEffect(() => {
        if (!canReadTeam || !activity.enable_reservations) {
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const rows = await listTenantMembers(tenantId);
                if (cancelled) return;
                setTeamMembers(rows);
                const owner = rows.find(r => r.effective_role === "owner");
                setOwnerEmail(owner?.email ?? null);
            } catch {
                // Silent — quick-pick + auto-fill simply stay hidden.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [canReadTeam, activity.enable_reservations, tenantId]);


    const handleReservationEmailsChange = useCallback(
        async (next: string[]) => {
            const before = activity.reservation_notification_emails ?? [];
            // Skip no-op writes (chip removal that produced no change, etc.).
            if (next.length === before.length && next.every((v, i) => v === before[i])) {
                return;
            }
            setIsUpdatingEmails(true);
            try {
                await updateActivity(activity.id, tenantId, {
                    reservation_notification_emails: next
                });
                await onReload();
            } catch {
                showToast({
                    message: "Impossibile aggiornare i destinatari degli avvisi.",
                    type: "error"
                });
            } finally {
                setIsUpdatingEmails(false);
            }
        },
        [
            activity.id,
            activity.reservation_notification_emails,
            tenantId,
            onReload,
            showToast
        ]
    );

    const savePrivacyEmail = useCallback(async () => {
        const trimmed = privacyEmailDraft.trim();
        // Vuoto = "torna al fallback owner", non un errore da correggere.
        if (trimmed !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
            setPrivacyEmailError("Inserisci un indirizzo email valido.");
            return;
        }
        setPrivacyEmailError(null);
        setIsSavingPrivacyEmail(true);
        try {
            await updateActivity(activity.id, tenantId, {
                reservation_privacy_contact_email: trimmed === "" ? null : trimmed
            });
            await onReload();
            showToast({ message: "Email per le richieste sui dati aggiornata.", type: "success" });
        } catch {
            showToast({
                message: "Impossibile aggiornare l'email per le richieste sui dati.",
                type: "error"
            });
        } finally {
            setIsSavingPrivacyEmail(false);
        }
    }, [activity.id, tenantId, privacyEmailDraft, onReload, showToast]);

    const cancelPrivacyEmail = useCallback(() => {
        setPrivacyEmailDraft(savedPrivacyEmail);
        setPrivacyEmailError(null);
    }, [savedPrivacyEmail]);

    const saveCapacity = useCallback(async () => {
        // Rete di sicurezza: la regola "auto richiede capienza" è dichiarata
        // nella UI (radio disabilitato + spiegazione); qui si intercetta solo
        // un draft rimasto su "auto" mentre la capienza veniva svuotata in Sala.
        if (capacityDraft.confirmationMode === "auto" && !hasCapacity) {
            showToast({
                message: "La conferma automatica richiede una capienza impostata.",
                type: "error"
            });
            return;
        }
        // Pacing: campo vuoto → NULL (nessun limite). Lo zero non è un modo
        // per disattivare — il CHECK a schema lo rifiuta — quindi va
        // intercettato qui con un messaggio che spiega come si disattiva.
        const parsePacingCap = (raw: string, label: string): number | null | "error" => {
            const trimmed = raw.trim();
            if (trimmed.length === 0) return null;
            const parsed = parseInt(trimmed, 10);
            if (!Number.isFinite(parsed) || parsed <= 0) {
                showToast({
                    message: `${label}: inserisci un numero maggiore di zero, oppure lascia il campo vuoto per non avere limiti.`,
                    type: "error"
                });
                return "error";
            }
            return parsed;
        };
        const pacingCoversValue = parsePacingCap(
            capacityDraft.pacingMaxCovers,
            "Persone per fascia"
        );
        if (pacingCoversValue === "error") return;
        const pacingBookingsValue = parsePacingCap(
            capacityDraft.pacingMaxBookings,
            "Tavoli per fascia"
        );
        if (pacingBookingsValue === "error") return;
        const pacingSlotParsed = parseInt(capacityDraft.pacingSlotMinutes, 10);
        if (![15, 30, 60].includes(pacingSlotParsed)) {
            showToast({
                message: "L'ampiezza della fascia deve essere 15, 30 o 60 minuti.",
                type: "error"
            });
            return;
        }
        setIsSavingCapacity(true);
        try {
            await updateActivity(activity.id, tenantId, {
                reservation_overbooking_form: capacityDraft.overbookingForm,
                reservation_confirmation_mode: capacityDraft.confirmationMode,
                reservation_pacing_slot_minutes: pacingSlotParsed,
                reservation_pacing_max_covers: pacingCoversValue,
                reservation_pacing_max_bookings: pacingBookingsValue
            });
            await onReload();
            showToast({ message: "Regole di prenotazione salvate.", type: "success" });
        } catch {
            showToast({
                message: "Impossibile salvare le regole di prenotazione.",
                type: "error"
            });
        } finally {
            setIsSavingCapacity(false);
        }
    }, [activity.id, tenantId, capacityDraft, hasCapacity, onReload, showToast]);

    const cancelCapacity = useCallback(() => {
        setCapacityDraft(savedCapacity);
    }, [savedCapacity]);

    const handleEnableReservationsToggle = useCallback(
        async (checked: boolean) => {
            try {
                // No auto-fill: leaving the column empty keeps the backend
                // resolver pointed at the CURRENT owner of the tenant. The
                // UI surfaces the resolved owner email in the empty-state
                // note instead of freezing it into the row.
                await updateActivity(activity.id, tenantId, {
                    enable_reservations: checked
                });
                showToast({
                    message: checked
                        ? "Prenotazioni attivate."
                        : "Prenotazioni disattivate.",
                    type: "success"
                });
                await onReload();
            } catch {
                showToast({
                    message: "Impossibile aggiornare lo stato delle prenotazioni.",
                    type: "error"
                });
            }
        },
        [activity.id, tenantId, onReload, showToast]
    );

    const handleReservationReminderToggle = useCallback(
        async (checked: boolean) => {
            try {
                await updateActivity(activity.id, tenantId, {
                    reservation_reminder_enabled: checked
                });
                showToast({
                    message: checked
                        ? "Promemoria attivato."
                        : "Promemoria disattivato.",
                    type: "success"
                });
                await onReload();
            } catch {
                showToast({
                    message: "Impossibile aggiornare il promemoria.",
                    type: "error"
                });
            }
        },
        [activity.id, tenantId, onReload, showToast]
    );


    return (
        <div className={styles.layout}>
                {/* ── Row 2c: Prenotazioni toggle (full width) ──────────────── */}
                <Card className={styles.card}>
                    <div className={styles.cardHeader}>
                        <div className={styles.cardHeaderText}>
                            <h3 className={styles.cardTitle}>Prenotazioni</h3>
                            <p className={styles.cardSubtitle}>
                                Abilita il modulo di prenotazione tavolo sulla pagina pubblica della sede.
                            </p>
                        </div>
                    </div>
                    <div className={styles.cardBodyFlat} style={{ padding: "16px 24px" }}>
                        <Switch
                            checked={activity.enable_reservations}
                            onChange={handleEnableReservationsToggle}
                            disabled={isReservationsLocked || !canWrite}
                            label="Accetta prenotazioni"
                            description={
                                activity.enable_reservations
                                    ? "I clienti possono richiedere una prenotazione dalla pagina pubblica della sede."
                                    : "Il modulo di prenotazione e' nascosto dalla pagina pubblica. Riattiva quando vuoi tornare a ricevere richieste."
                            }
                        />
                        {isReservationsLocked && (
                            <div className={styles.lockedFeatureCaption}>
                                <Lock size={14} strokeWidth={1.5} />
                                <span>Disponibile con il piano Pro</span>
                            </div>
                        )}
                        {activity.enable_reservations &&
                            !isHoursLoading &&
                            !hours.some(h => !h.is_closed && h.opens_at && h.closes_at) && (
                                <div className={styles.reservationsHoursNote}>
                                    <InlineBanner variant="info">
                                        Questa sede non ha fasce orarie di apertura configurate: imposta gli orari di apertura per gestire e filtrare correttamente le richieste di prenotazione.
                                    </InlineBanner>
                                </div>
                            )}

                        {/* Promemoria: sotto l'interruttore principale e
                            visibile solo quando le prenotazioni sono attive —
                            un promemoria per prenotazioni che non si ricevono
                            non vuol dire niente. */}
                        {activity.enable_reservations && (
                            <div className={styles.reservationsReminderField}>
                                <Switch
                                    checked={activity.reservation_reminder_enabled}
                                    onChange={handleReservationReminderToggle}
                                    label="Promemoria il giorno prima"
                                    description="Alle 18:00 del giorno prima, chi ha una prenotazione confermata riceve un'email che gliela ricorda, con un pulsante per confermare che verrà e il link per disdire."
                                />
                            </div>
                        )}

                        {activity.enable_reservations && (
                            <div className={styles.reservationsEmailsField}>
                                <div className={styles.reservationsEmailsHeader}>
                                    <label
                                        htmlFor="reservation-alert-emails"
                                        className={styles.reservationsEmailsLabel}
                                    >
                                        Email per gli avvisi di prenotazione
                                    </label>
                                    {canReadTeam && teamMembers.length > 0 && (() => {
                                        const taken = new Set(
                                            reservationEmails.map(e => e.toLowerCase())
                                        );
                                        const pickable = teamMembers.filter(
                                            m => m.email && !taken.has(m.email.toLowerCase())
                                        );
                                        if (pickable.length === 0) return null;
                                        return (
                                            <Menu
                                                trigger={
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        leftIcon={<Plus size={14} />}
                                                        disabled={isUpdatingEmails}
                                                    >
                                                        Aggiungi dal team
                                                    </Button>
                                                }
                                                align="end"
                                            >
                                                {pickable.map(m => (
                                                    <Menu.Item
                                                        key={m.membership_id}
                                                        onSelect={() =>
                                                            handleReservationEmailsChange([
                                                                ...reservationEmails,
                                                                m.email.trim().toLowerCase()
                                                            ])
                                                        }
                                                    >
                                                        {m.email}
                                                    </Menu.Item>
                                                ))}
                                            </Menu>
                                        );
                                    })()}
                                </div>
                                <MultiEmailInput
                                    id="reservation-alert-emails"
                                    value={reservationEmails}
                                    onChange={handleReservationEmailsChange}
                                    placeholder="email@esempio.it"
                                    disabled={isUpdatingEmails}
                                />
                                {reservationEmails.length === 0 && (
                                    <p className={styles.reservationsEmailsNote}>
                                        {ownerEmail
                                            ? `Se lasci vuoto, gli avvisi andranno a ${ownerEmail} (proprietario dell'azienda).`
                                            : "Se lasci vuoto, gli avvisi andranno all'email del proprietario dell'azienda."}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Senza ragione sociale l'informativa non si genera, e
                            il cliente che apre il link dal form trova un
                            messaggio invece del documento. Il tono NON è "hai
                            dimenticato qualcosa": `legal_name` si compila coi
                            dati di fatturazione, cioè sottoscrivendo
                            l'abbonamento, quindi chi vede questo avviso è quasi
                            sempre in prova — per lui è un prerequisito, non una
                            distrazione. */}
                        {activity.enable_reservations && !hasLegalName && (
                            <div className={styles.privacyNoticeAlert}>
                                <InlineBanner variant="warning">
                                    Per pubblicare l'informativa privacy delle prenotazioni serve
                                    la ragione sociale della tua azienda: la inserisci con i dati
                                    di fatturazione, sottoscrivendo l'abbonamento. Finché manca,
                                    chi apre l'informativa dal modulo di prenotazione trova un
                                    avviso che lo invita a contattarti.{" "}
                                    <Link
                                        to={`/business/${tenantId}/subscription`}
                                        className={styles.privacyNoticeAlertLink}
                                    >
                                        Vai ad Abbonamento
                                    </Link>
                                </InlineBanner>
                            </div>
                        )}

                        {/* Informativa privacy: il titolare del trattamento dei
                            dati di chi prenota è la sede, non CataloGlobe, e
                            l'informativa pubblica deve dire a chi scrivere. */}
                        {activity.enable_reservations && (
                            <div className={styles.privacyEmailField}>
                                <TextInput
                                    id="reservation-privacy-email"
                                    type="email"
                                    label="Email per le richieste sui dati personali"
                                    helperText="Viene pubblicato nell'informativa privacy delle prenotazioni, che chiunque può leggere: è l'indirizzo a cui i clienti scrivono se vogliono sapere quali dati hai su di loro o chiederne la cancellazione."
                                    placeholder="privacy@esempio.it"
                                    value={privacyEmailDraft}
                                    onChange={e => {
                                        setPrivacyEmailDraft(e.target.value);
                                        setPrivacyEmailError(null);
                                    }}
                                    error={privacyEmailError ?? undefined}
                                    disabled={isSavingPrivacyEmail}
                                />
                                {privacyEmailDraft.trim() === "" && (
                                    <p className={styles.privacyEmailNote}>
                                        {/* Il fallback pubblica l'email personale
                                            dell'owner, che non l'ha scelta per
                                            questo: dirlo qui è l'unico punto in
                                            cui può accorgersene prima. */}
                                        {ownerEmail
                                            ? `Se lasci vuoto, nell'informativa comparirà ${ownerEmail} (titolare dell'account).`
                                            : "Se lasci vuoto, nell'informativa comparirà l'email del titolare dell'account."}
                                    </p>
                                )}
                                {isPrivacyEmailDirty && (
                                    <UnsavedChangesBar
                                        isSaving={isSavingPrivacyEmail}
                                        onCancel={cancelPrivacyEmail}
                                        onSave={() => {
                                            void savePrivacyEmail();
                                        }}
                                    />
                                )}
                            </div>
                        )}

                        {activity.enable_reservations && (
                            <div className={styles.capacityAccordionWrap}>
                                <ConfigAccordionSection
                                    title="Regole di accettazione"
                                    isOpen={isCapacityOpen}
                                    onToggle={() => setIsCapacityOpen(open => !open)}
                                    isLast
                                    draft={{
                                        isDirty: isCapacityDirty,
                                        onSave: saveCapacity,
                                        onCancel: cancelCapacity,
                                        isSaving: isSavingCapacity
                                    }}
                                >
                                    <div className={styles.capacityField}>
                                        <span className={styles.capacityLabel}>
                                            Quando è pieno
                                        </span>
                                        <div className={styles.capacityRadioGroup}>
                                            <label
                                                className={`${styles.capacityRadio} ${
                                                    capacityDraft.overbookingForm === "hard"
                                                        ? styles.capacityRadioSelected
                                                        : ""
                                                }`}
                                            >
                                                <input
                                                    type="radio"
                                                    name="reservation_overbooking_form"
                                                    value="hard"
                                                    className={styles.capacityRadioInput}
                                                    checked={capacityDraft.overbookingForm === "hard"}
                                                    onChange={() =>
                                                        setCapacityDraft(d => ({
                                                            ...d,
                                                            overbookingForm: "hard"
                                                        }))
                                                    }
                                                    disabled={isSavingCapacity}
                                                />
                                                <span className={styles.capacityRadioText}>
                                                    <span className={styles.capacityRadioLabel}>
                                                        Blocca nuove prenotazioni online
                                                    </span>
                                                    <span className={styles.capacityRadioDescription}>
                                                        Il modulo rifiuta gli orari saturi. L'admin può comunque inserirle a mano.
                                                    </span>
                                                </span>
                                            </label>
                                            <label
                                                className={`${styles.capacityRadio} ${
                                                    capacityDraft.overbookingForm === "soft"
                                                        ? styles.capacityRadioSelected
                                                        : ""
                                                }`}
                                            >
                                                <input
                                                    type="radio"
                                                    name="reservation_overbooking_form"
                                                    value="soft"
                                                    className={styles.capacityRadioInput}
                                                    checked={capacityDraft.overbookingForm === "soft"}
                                                    onChange={() =>
                                                        setCapacityDraft(d => ({
                                                            ...d,
                                                            overbookingForm: "soft"
                                                        }))
                                                    }
                                                    disabled={isSavingCapacity}
                                                />
                                                <span className={styles.capacityRadioText}>
                                                    <span className={styles.capacityRadioLabel}>
                                                        Accetta come richiesta da approvare
                                                    </span>
                                                    <span className={styles.capacityRadioDescription}>
                                                        Le richieste oltre la capienza arrivano comunque, in attesa.
                                                    </span>
                                                </span>
                                            </label>
                                        </div>
                                    </div>
                                    {(() => {
                                        // Condizione dichiarata, non errore al salvataggio:
                                        // senza capienza non esiste un "entro capienza".
                                        const autoDisabled = !hasCapacity;
                                        return (
                                            <div className={styles.capacityField}>
                                                <span className={styles.capacityLabel}>
                                                    Modalità di conferma
                                                </span>
                                                <div className={styles.capacityRadioGroup}>
                                                    <label
                                                        className={`${styles.capacityRadio} ${
                                                            capacityDraft.confirmationMode === "manuale"
                                                                ? styles.capacityRadioSelected
                                                                : ""
                                                        }`}
                                                    >
                                                        <input
                                                            type="radio"
                                                            name="reservation_confirmation_mode"
                                                            value="manuale"
                                                            className={styles.capacityRadioInput}
                                                            checked={capacityDraft.confirmationMode === "manuale"}
                                                            onChange={() =>
                                                                setCapacityDraft(d => ({
                                                                    ...d,
                                                                    confirmationMode: "manuale"
                                                                }))
                                                            }
                                                            disabled={isSavingCapacity}
                                                        />
                                                        <span className={styles.capacityRadioText}>
                                                            <span className={styles.capacityRadioLabel}>
                                                                Conferma manuale
                                                            </span>
                                                            <span className={styles.capacityRadioDescription}>
                                                                Le richieste arrivano come "Da gestire" e tu le confermi una per una.
                                                            </span>
                                                        </span>
                                                    </label>
                                                    <label
                                                        className={`${styles.capacityRadio} ${
                                                            capacityDraft.confirmationMode === "auto"
                                                                ? styles.capacityRadioSelected
                                                                : ""
                                                        } ${autoDisabled ? styles.capacityRadioDisabled : ""}`}
                                                    >
                                                        <input
                                                            type="radio"
                                                            name="reservation_confirmation_mode"
                                                            value="auto"
                                                            className={styles.capacityRadioInput}
                                                            checked={capacityDraft.confirmationMode === "auto"}
                                                            onChange={() =>
                                                                setCapacityDraft(d => ({
                                                                    ...d,
                                                                    confirmationMode: "auto"
                                                                }))
                                                            }
                                                            disabled={isSavingCapacity || autoDisabled}
                                                        />
                                                        <span className={styles.capacityRadioText}>
                                                            <span className={styles.capacityRadioLabel}>
                                                                Conferma automatica entro capienza
                                                            </span>
                                                            <span className={styles.capacityRadioDescription}>
                                                                {autoDisabled ? (
                                                                    <>
                                                                        Serve la capienza della sala: senza, non c'è un "entro capienza".{" "}
                                                                        <Link
                                                                            to={`/business/${tenantId}/locations/${activity.id}?tab=sala`}
                                                                            className={ownStyles.inlineLink}
                                                                        >
                                                                            Impostala in Sala
                                                                        </Link>
                                                                    </>
                                                                ) : (
                                                                    "Le prenotazioni online entro la capienza vengono confermate subito."
                                                                )}
                                                            </span>
                                                        </span>
                                                    </label>
                                                </div>
                                                {capacityDraft.confirmationMode === "auto" && !autoDisabled && (
                                                    <div className={styles.capacityAutoWarning} role="note">
                                                        <strong>Attenzione.</strong> Con la conferma automatica
                                                        attiva, per non sforare la capienza devi inserire in
                                                        CataloGlobe <strong>tutte</strong> le prenotazioni —
                                                        comprese quelle telefoniche e i walk-in. Se mancano
                                                        prenotazioni dal sistema, il calcolo della capienza
                                                        è sbagliato e i clienti potrebbero confermare
                                                        automaticamente oltre i posti realmente disponibili.
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {/* ── Pacing per fascia oraria ─────────────────
                                        Leva distinta dalla capienza e va detto in
                                        chiaro: chi non coglie la differenza ne
                                        imposta uno a caso. Ogni campo dichiara cosa
                                        succede da vuoto, altrimenti sembrano
                                        obbligatori. */}
                                    <div className={styles.capacityField}>
                                        <span className={styles.capacityLabel}>
                                            Ritmo degli arrivi
                                        </span>
                                        <p className={styles.capacityHint}>
                                            La capienza limita quante persone stanno nel
                                            locale. Questo limita quante ne{" "}
                                            <strong>arrivano insieme</strong>: quattro
                                            tavoli tutti alle 20:00 mandano in coda la
                                            cucina anche a sala mezza vuota. Lascia i
                                            campi vuoti per non avere limiti.
                                        </p>
                                    </div>

                                    <div className={styles.capacityField}>
                                        <span className={styles.capacityLabel}>
                                            Ampiezza della fascia
                                        </span>
                                        <div className={styles.capacityRadioGroup}>
                                            {([15, 30, 60] as const).map(minutes => (
                                                <label
                                                    key={minutes}
                                                    className={`${styles.capacityRadio} ${
                                                        capacityDraft.pacingSlotMinutes === String(minutes)
                                                            ? styles.capacityRadioSelected
                                                            : ""
                                                    }`}
                                                >
                                                    <input
                                                        type="radio"
                                                        name="reservation_pacing_slot_minutes"
                                                        value={minutes}
                                                        className={styles.capacityRadioInput}
                                                        checked={
                                                            capacityDraft.pacingSlotMinutes === String(minutes)
                                                        }
                                                        onChange={() =>
                                                            setCapacityDraft(d => ({
                                                                ...d,
                                                                pacingSlotMinutes: String(minutes)
                                                            }))
                                                        }
                                                        disabled={isSavingCapacity}
                                                    />
                                                    <span className={styles.capacityRadioText}>
                                                        <span className={styles.capacityRadioLabel}>
                                                            {minutes} minuti
                                                        </span>
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                        <p className={styles.capacityHint}>
                                            I limiti qui sotto valgono per ogni fascia di
                                            questa ampiezza. Con 30 minuti, una
                                            prenotazione alle 20:15 rientra nella fascia
                                            20:00–20:30.
                                        </p>
                                    </div>

                                    <div className={styles.capacityRow}>
                                        <div className={styles.capacityField}>
                                            <NumberInput
                                                label="Persone per fascia"
                                                placeholder="Nessun limite"
                                                min={1}
                                                value={capacityDraft.pacingMaxCovers}
                                                onChange={e =>
                                                    setCapacityDraft(d => ({
                                                        ...d,
                                                        pacingMaxCovers: e.target.value
                                                    }))
                                                }
                                                disabled={isSavingCapacity}
                                            />
                                            <p className={styles.capacityHint}>
                                                Quanti coperti al massimo possono arrivare
                                                nella stessa fascia. Vuoto: nessun limite.
                                            </p>
                                        </div>
                                        <div className={styles.capacityField}>
                                            <NumberInput
                                                label="Tavoli per fascia"
                                                placeholder="Nessun limite"
                                                min={1}
                                                value={capacityDraft.pacingMaxBookings}
                                                onChange={e =>
                                                    setCapacityDraft(d => ({
                                                        ...d,
                                                        pacingMaxBookings: e.target.value
                                                    }))
                                                }
                                                disabled={isSavingCapacity}
                                            />
                                            <p className={styles.capacityHint}>
                                                Quante prenotazioni al massimo, a
                                                prescindere da quante persone sono. Vuoto:
                                                nessun limite.
                                            </p>
                                        </div>
                                    </div>

                                    <div className={styles.capacityField}>
                                        <p className={styles.capacityHint}>
                                            Un tavolo da 8 e quattro tavoli da 2 fanno gli
                                            stessi coperti ma un lavoro di sala diverso:
                                            per questo i due limiti sono separati. Se li
                                            imposti entrambi, vale il più restrittivo.
                                            Valgono solo per le prenotazioni online — a
                                            mano puoi sempre inserirle, con un avviso.
                                        </p>
                                    </div>
                                </ConfigAccordionSection>
                            </div>
                        )}
                    </div>
                </Card>


            {/* Qui si configura, in Prenotazioni si lavora. */}
            <p className={ownStyles.operativeLink}>
                Le prenotazioni che arrivano le gestisci qui:{" "}
                <Link to={`/business/${tenantId}/reservations`} className={ownStyles.operativeLinkAnchor}>
                    Prenotazioni
                    <ArrowRight size={13} />
                </Link>
            </p>
        </div>
    );
};
