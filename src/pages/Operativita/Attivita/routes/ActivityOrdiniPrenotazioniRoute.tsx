import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { Checklist, type ChecklistItem } from "@/components/ui/Checklist/Checklist";
import { FormGrid, FormSection } from "@/components/ui/FormGrid/FormGrid";
import { FormField } from "@/components/ui/FormField/FormField";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { Menu } from "@/components/ui/Menu";
import { MultiEmailInput } from "@/components/ui/MultiEmailInput/MultiEmailInput";
import { NumberInput } from "@/components/ui/Input/NumberInput";
import { RadioGroup } from "@/components/ui/RadioGroup/RadioGroup";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { Switch } from "@/components/ui/Switch/Switch";
import { TextInput } from "@/components/ui/Input/TextInput";
import Text from "@/components/ui/Text/Text";
import { PrintersSection } from "../tabs/printers/PrintersSection";
import {
    HORIZON_DAYS_MAX,
    HORIZON_DAYS_MIN,
    MIN_NOTICE_MINUTES_MAX,
    noticeExceedsHorizon
} from "../tabs/reservationNoticeHorizon";
import { useActivityDetail } from "../ActivityDetailContext";
import type { ActivityDraftField } from "../useActivityDraft";
import { updateActivity, updateActivityOrderingEnabled } from "@/services/supabase/activities";
import { listTenantMembers } from "@/services/supabase/team";
import type { TenantMemberRow } from "@/types/team";
import { usePermissions } from "@/context/PermissionsContext";
import { canDoOnTenant } from "@/lib/permissions";
import { usePlanFeatures } from "@/lib/planFeatures";
import { useToast } from "@/context/Toast/ToastContext";
import styles from "./ActivityOrdiniPrenotazioniRoute.module.scss";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** I campi numerici delle regole: si scrivono come testo, si validano al Salva. */
type NumericRuleField =
    | "reservation_pacing_max_covers"
    | "reservation_pacing_max_bookings"
    | "reservation_min_notice_minutes"
    | "reservation_horizon_days";

/**
 * Ordini e prenotazioni (§31.1): cosa può fare un cliente da questo locale,
 * e con che regole. Si chiamava «Canali»: il nome nominava il contenitore,
 * non le due cose dentro. Ordini al tavolo e prenotazioni restano due sezioni distinte, con
 * le ancore `#ordini` e `#prenotazioni`. Gli interruttori e le email degli
 * avvisi salvano subito (§31.4); l'email privacy e le cinque regole di
 * accettazione stanno nel draft di pagina (§31.2).
 */
export default function ActivityOrdiniPrenotazioniRoute() {
    const { activity, tenantId, reload, canManage, hours, isHoursLoading, legalName, draft, goToSection } =
        useActivityDetail();
    const { hash } = useLocation();
    const { showToast } = useToast();
    const { permissions } = usePermissions();
    const { hasFeature } = usePlanFeatures();
    const canReadTeam = permissions ? canDoOnTenant(permissions, "team.read") : false;
    const isOrderingLocked = !hasFeature("table_ordering");
    const isReservationsLocked = !hasFeature("table_reservation");

    // L'ancora arriva prima del contenuto (la sede si legge dopo il mount):
    // lo scroll si fa a mano quando la sezione esiste.
    useEffect(() => {
        if (!hash) return;
        document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
    }, [hash, activity.id]);

    // ── Ordini al tavolo (immediato) ────────────────────────────────────────
    const handleOrderingToggle = useCallback(
        async (checked: boolean) => {
            try {
                await updateActivityOrderingEnabled(activity.id, tenantId, checked);
                showToast({
                    message: checked
                        ? "Ordini al tavolo attivi."
                        : "Ordini al tavolo sospesi: i clienti vedono il menù ma non ordinano.",
                    type: "success"
                });
                await reload();
            } catch {
                showToast({ message: "Impossibile aggiornare gli ordini al tavolo.", type: "error" });
            }
        },
        [activity.id, tenantId, reload, showToast]
    );

    // ── Prenotazioni: interruttori ed email degli avvisi (immediato) ────────
    const setImmediate = useCallback(
        async (values: Parameters<typeof updateActivity>[2], okMessage: string, errorMessage: string) => {
            try {
                await updateActivity(activity.id, tenantId, values);
                showToast({ message: okMessage, type: "success" });
                await reload();
            } catch {
                showToast({ message: errorMessage, type: "error" });
            }
        },
        [activity.id, tenantId, reload, showToast]
    );

    const reservationEmails: string[] = activity.reservation_notification_emails ?? [];
    const [isUpdatingEmails, setIsUpdatingEmails] = useState(false);
    const handleEmailsChange = useCallback(
        async (next: string[]) => {
            const before = activity.reservation_notification_emails ?? [];
            if (next.length === before.length && next.every((v, i) => v === before[i])) return;
            setIsUpdatingEmails(true);
            try {
                await updateActivity(activity.id, tenantId, { reservation_notification_emails: next });
                await reload();
            } catch {
                showToast({ message: "Impossibile aggiornare i destinatari degli avvisi.", type: "error" });
            } finally {
                setIsUpdatingEmails(false);
            }
        },
        [activity.id, activity.reservation_notification_emails, tenantId, reload, showToast]
    );

    // Membri del team per «Aggiungi dal team» e per dire a chi vanno gli avvisi
    // se la lista è vuota: solo con `team.read` e prenotazioni attive.
    const [teamMembers, setTeamMembers] = useState<TenantMemberRow[]>([]);
    const [ownerEmail, setOwnerEmail] = useState<string | null>(null);
    useEffect(() => {
        if (!canReadTeam || !activity.enable_reservations) return;
        let cancelled = false;
        listTenantMembers(tenantId)
            .then(rows => {
                if (cancelled) return;
                setTeamMembers(rows);
                setOwnerEmail(rows.find(r => r.effective_role === "owner")?.email ?? null);
            })
            .catch(() => {
                // Silente: la scelta rapida resta nascosta.
            });
        return () => {
            cancelled = true;
        };
    }, [canReadTeam, activity.enable_reservations, tenantId]);

    const takenEmails = new Set(reservationEmails.map(e => e.toLowerCase()));
    const pickableMembers = teamMembers.filter(m => m.email && !takenEmails.has(m.email.toLowerCase()));

    // ── Regole e email privacy: nel draft ───────────────────────────────────
    // I numeri si scrivono come testo: il draft porta il numero (o NaN se il
    // testo non è un numero, e allora il Salva si ferma sulla validazione);
    // il testo mostrato resta locale finché il campo è nel draft.
    const [rawNumbers, setRawNumbers] = useState<Partial<Record<NumericRuleField, string>>>({});
    const numberText = (field: NumericRuleField): string => {
        if (field in draft.patch) return rawNumbers[field] ?? "";
        const saved = activity[field];
        return saved == null ? "" : String(saved);
    };
    const setNumber = (field: NumericRuleField, text: string, emptyMeansNull: boolean) => {
        setRawNumbers(prev => ({ ...prev, [field]: text }));
        const trimmed = text.trim();
        const value = trimmed === "" ? (emptyMeansNull ? null : Number.NaN) : Number.parseInt(trimmed, 10);
        draft.set(field as ActivityDraftField, value as never);
    };

    const d = draft.draft;
    const hasCapacity = activity.reservation_capacity != null;
    const autoDisabled = !hasCapacity;
    const privacyEmail = d.reservation_privacy_contact_email ?? "";

    useEffect(() => {
        return draft.registerValidator("ordini-prenotazioni", () => {
            const email = (d.reservation_privacy_contact_email ?? "").trim();
            if (email !== "" && !EMAIL_RE.test(email)) {
                return "Email per le richieste sui dati personali: inserisci un indirizzo valido.";
            }
            if (d.reservation_confirmation_mode === "auto" && !hasCapacity) {
                return "La conferma automatica richiede una capienza impostata nella sala.";
            }
            for (const [field, label] of [
                ["reservation_pacing_max_covers", "Persone per fascia"],
                ["reservation_pacing_max_bookings", "Tavoli per fascia"]
            ] as const) {
                const v = d[field];
                if (v != null && (!Number.isFinite(v) || v <= 0)) {
                    return `${label}: inserisci un numero maggiore di zero, oppure lascia il campo vuoto per non avere limiti.`;
                }
            }
            if (![15, 30, 60].includes(d.reservation_pacing_slot_minutes)) {
                return "L'ampiezza della fascia deve essere 15, 30 o 60 minuti.";
            }
            const notice = d.reservation_min_notice_minutes;
            if (!Number.isFinite(notice) || notice < 0 || notice > MIN_NOTICE_MINUTES_MAX) {
                return "Preavviso minimo: inserisci un numero di minuti da 0 a 10080 (una settimana).";
            }
            const horizon = d.reservation_horizon_days;
            if (!Number.isFinite(horizon) || horizon < HORIZON_DAYS_MIN || horizon > HORIZON_DAYS_MAX) {
                return "Orizzonte: inserisci un numero di giorni da 1 a 365.";
            }
            return null;
        });
    }, [draft, d, hasCapacity]);

    const showNoticeHorizonWarning = noticeExceedsHorizon(d.reservation_min_notice_minutes, d.reservation_horizon_days);

    // ── Prerequisiti ────────────────────────────────────────────────────────
    const hasOpenHours = hours.some(h => !h.is_closed && h.opens_at && h.closes_at);
    const hasLegalName = (legalName ?? "").trim().length > 0;
    const orderingChecklist: ChecklistItem[] = [
        {
            id: "published",
            title: "Sede pubblicata",
            shortTitle: "Pubblicata",
            description:
                "Finché la sede è sospesa la pagina pubblica non è raggiungibile e il QR del tavolo non porta da nessuna parte.",
            done: activity.status === "active",
            actionLabel: "Vai a Pubblicazione",
            onAction: () => goToSection("pubblicazione")
        }
    ];
    const reservationsChecklist: ChecklistItem[] = [
        {
            id: "hours",
            title: "Orari di apertura configurati",
            shortTitle: "Orari",
            description: "Senza orari le richieste di prenotazione non vengono filtrate sulle fasce di apertura.",
            done: hasOpenHours,
            actionLabel: "Vai a Orari",
            onAction: () => goToSection("orari")
        },
        {
            id: "capacity",
            title: "Capienza della sala impostata",
            shortTitle: "Capienza",
            description:
                "Senza capienza le prenotazioni online non hanno limiti e la conferma automatica non è disponibile.",
            done: hasCapacity,
            actionLabel: "Vai alla sala",
            onAction: () => goToSection("sala")
        },
        {
            id: "legal",
            title: "Ragione sociale dell'azienda presente",
            shortTitle: "Ragione sociale",
            description:
                "Senza, l'informativa privacy non si pubblica: chi la apre trova un avviso che invita a contattarti.",
            done: hasLegalName,
            actionLabel: "Vai a Impostazioni",
            to: `/business/${tenantId}/settings`
        }
    ];

    const lockedCaption = (
        <span className={styles.locked}>
            <Lock size={14} strokeWidth={1.75} aria-hidden />
            <Text as="span" variant="caption" colorVariant="muted">
                Disponibile con il piano Pro
            </Text>
        </span>
    );

    return (
        <div className={styles.page}>
            <section id="ordini" aria-label="Ordini al tavolo" className={styles.section}>
                {activity.status !== "active" && (
                    <Checklist title="Prima degli ordini" items={orderingChecklist} doneTitle="La sede è pubblicata" />
                )}
                <Card title="Ordini al tavolo" subtitle="Il cliente ordina inquadrando il QR del tavolo">
                    <div className={styles.stack}>
                        <Switch
                            label={activity.ordering_enabled ? "Attivi" : "Sospesi"}
                            checked={activity.ordering_enabled}
                            onChange={handleOrderingToggle}
                            disabled={isOrderingLocked || !canManage}
                            description={
                                activity.ordering_enabled
                                    ? "Ogni tavolo ha il suo QR."
                                    : "Il menù resta leggibile, «Invia ordine» no."
                            }
                        />
                        {isOrderingLocked && lockedCaption}
                        {/* A canale spento la card diceva solo «Sospesi»: qui sotto
                            c'è cosa succede accendendolo, e dove vivono le cose. */}
                        <ul className={styles.points}>
                            <li>
                                <Text as="span" variant="caption" colorVariant="muted">
                                    I tavoli e i loro QR stanno nella{" "}
                                    <Link to="../sala" relative="path" className={styles.link}>
                                        sala
                                    </Link>
                                    .
                                </Text>
                            </li>
                            <li>
                                <Text as="span" variant="caption" colorVariant="muted">
                                    Le comande arrivano in tempo reale in{" "}
                                    <Link to={`/business/${tenantId}/orders`} className={styles.link}>
                                        Comande
                                    </Link>
                                    .
                                </Text>
                            </li>
                            <li>
                                <Text as="span" variant="caption" colorVariant="muted">
                                    Con una stampante collegata si stampano da sole.
                                </Text>
                            </li>
                        </ul>
                    </div>
                </Card>
                {activity.ordering_enabled && <PrintersSection tenantId={tenantId} activityId={activity.id} />}
            </section>

            <section id="prenotazioni" aria-label="Prenotazioni" className={styles.section}>
                {activity.enable_reservations && (
                    <Checklist
                        title="Prima delle prenotazioni"
                        items={reservationsChecklist}
                        doneTitle="Orari, capienza e ragione sociale ci sono"
                        loading={isHoursLoading || legalName === undefined}
                    />
                )}
                <Card title="Prenotazioni" subtitle="Richieste dal modulo pubblico">
                    <div className={styles.stack}>
                        <Switch
                            label={activity.enable_reservations ? "Attive" : "Disattivate"}
                            checked={activity.enable_reservations}
                            onChange={checked =>
                                void setImmediate(
                                    { enable_reservations: checked },
                                    checked ? "Prenotazioni attivate." : "Prenotazioni disattivate.",
                                    "Impossibile aggiornare le prenotazioni."
                                )
                            }
                            disabled={isReservationsLocked || !canManage}
                            description={
                                activity.enable_reservations
                                    ? "Il modulo è sulla pagina pubblica della sede."
                                    : "Il modulo non compare sulla pagina pubblica."
                            }
                        />
                        {isReservationsLocked && lockedCaption}
                        <Text variant="caption" colorVariant="muted">
                            Le richieste che arrivano si gestiscono in{" "}
                            <Link to={`/business/${tenantId}/reservations`} className={styles.link}>
                                Prenotazioni
                            </Link>
                            .
                        </Text>
                    </div>
                </Card>

                {activity.enable_reservations && (
                    <>
                        <Card title="Avvisi e promemoria">
                            <FormGrid cols={1}>
                                <Switch
                                    label="Promemoria il giorno prima"
                                    checked={activity.reservation_reminder_enabled}
                                    onChange={checked =>
                                        void setImmediate(
                                            { reservation_reminder_enabled: checked },
                                            checked ? "Promemoria attivato." : "Promemoria disattivato.",
                                            "Impossibile aggiornare il promemoria."
                                        )
                                    }
                                    disabled={!canManage}
                                    description="Alle 18:00 del giorno prima: email con il tasto per confermare la presenza e il link per disdire."
                                />
                                <FormField
                                    label="Email per gli avvisi"
                                    helperText={
                                        reservationEmails.length === 0
                                            ? ownerEmail
                                                ? `Chi riceve l'avviso di una nuova richiesta. Vuoto: ${ownerEmail}.`
                                                : "Chi riceve l'avviso di una nuova richiesta. Vuoto: il proprietario dell'azienda."
                                            : "Chi riceve l'avviso di una nuova richiesta."
                                    }
                                >
                                    {({ inputId }) => (
                                        <div className={styles.emails}>
                                            <MultiEmailInput
                                                id={inputId}
                                                value={reservationEmails}
                                                onChange={handleEmailsChange}
                                                placeholder="email@esempio.it"
                                                disabled={isUpdatingEmails || !canManage}
                                            />
                                            {canReadTeam && pickableMembers.length > 0 && canManage && (
                                                <Menu
                                                    trigger={
                                                        <Button variant="secondary" size="sm" disabled={isUpdatingEmails}>
                                                            Aggiungi dal team
                                                        </Button>
                                                    }
                                                    align="end"
                                                >
                                                    {pickableMembers.map(m => (
                                                        <Menu.Item
                                                            key={m.membership_id}
                                                            onSelect={() =>
                                                                void handleEmailsChange([
                                                                    ...reservationEmails,
                                                                    m.email.trim().toLowerCase()
                                                                ])
                                                            }
                                                        >
                                                            {m.email}
                                                        </Menu.Item>
                                                    ))}
                                                </Menu>
                                            )}
                                        </div>
                                    )}
                                </FormField>
                                <TextInput
                                    type="email"
                                    label="Email per le richieste sui dati personali"
                                    placeholder="privacy@esempio.it"
                                    value={privacyEmail}
                                    onChange={e =>
                                        draft.set(
                                            "reservation_privacy_contact_email",
                                            e.target.value.trim() === "" ? null : e.target.value
                                        )
                                    }
                                    disabled={!canManage}
                                    helperText={
                                        privacyEmail.trim() === ""
                                            ? ownerEmail
                                                ? `Pubblicata nell'informativa privacy. Vuota: ${ownerEmail}.`
                                                : "Pubblicata nell'informativa privacy. Vuota: l'email del titolare dell'account."
                                            : "Pubblicata nell'informativa privacy: è l'indirizzo per chi chiede quali dati hai su di lui."
                                    }
                                />
                            </FormGrid>
                        </Card>

                        <Card title="Regole di accettazione" subtitle="Cinque regole, un solo salvataggio">
                            <FormGrid cols={1}>
                                <RadioGroup
                                    label="Quando è pieno"
                                    variant="card"
                                    value={d.reservation_overbooking_form ?? "hard"}
                                    onChange={v => draft.set("reservation_overbooking_form", v as "hard" | "soft")}
                                    disabled={!canManage}
                                    options={[
                                        {
                                            value: "hard",
                                            label: "Blocca nuove prenotazioni online",
                                            description: "Il modulo rifiuta gli orari saturi. A mano puoi comunque inserirle."
                                        },
                                        {
                                            value: "soft",
                                            label: "Accetta come richiesta da approvare",
                                            description: "Le richieste oltre la capienza arrivano comunque, in attesa."
                                        }
                                    ]}
                                />
                                <RadioGroup
                                    label="Modalità di conferma"
                                    variant="card"
                                    value={d.reservation_confirmation_mode ?? "manuale"}
                                    onChange={v => draft.set("reservation_confirmation_mode", v as "manuale" | "auto")}
                                    disabled={!canManage}
                                    options={[
                                        {
                                            value: "manuale",
                                            label: "Conferma manuale",
                                            description: "Ogni richiesta aspetta il tuo sì in Prenotazioni."
                                        },
                                        {
                                            value: "auto",
                                            label: "Conferma automatica entro capienza",
                                            description: autoDisabled
                                                ? "Serve la capienza della sala: senza, non c'è un «entro capienza»."
                                                : "Le prenotazioni online entro la capienza vengono confermate subito.",
                                            disabled: autoDisabled,
                                            disabledReason: "Imposta la capienza nella sala."
                                        }
                                    ]}
                                />
                                {autoDisabled && (
                                    <Text variant="caption" colorVariant="muted">
                                        <Link to="../sala" relative="path" className={styles.link}>
                                            Imposta la capienza nella sala
                                        </Link>{" "}
                                        per abilitare la conferma automatica.
                                    </Text>
                                )}
                                {d.reservation_confirmation_mode === "auto" && !autoDisabled && (
                                    <InlineBanner variant="warning">
                                        Il calcolo vale solo se in CataloGlobe ci sono tutte le prenotazioni, telefoniche e
                                        walk-in compresi: se ne mancano, i clienti possono confermare oltre i posti.
                                    </InlineBanner>
                                )}

                                <FormField
                                    label="Ampiezza della fascia"
                                    helperText="È il passo degli orari proposti: con 30 minuti il cliente vede 20:00, 20:30, 21:00."
                                >
                                    {() => (
                                        <SegmentedControl<number>
                                            value={d.reservation_pacing_slot_minutes ?? 15}
                                            onChange={v => draft.set("reservation_pacing_slot_minutes", v)}
                                            options={[
                                                { value: 15, label: "15 min" },
                                                { value: 30, label: "30 min" },
                                                { value: 60, label: "60 min" }
                                            ]}
                                        />
                                    )}
                                </FormField>

                                <FormSection
                                    title="Quanti ne arrivano insieme"
                                    description="Non quante persone stanno in sala: quante ne accetti per fascia. Vuoto = nessun limite; con entrambi vale il più restrittivo. Solo online."
                                >
                                <FormGrid cols={2}>
                                    <NumberInput
                                        label="Persone per fascia"
                                        placeholder="nessun limite"
                                        min={1}
                                        value={numberText("reservation_pacing_max_covers")}
                                        onChange={e => setNumber("reservation_pacing_max_covers", e.target.value, true)}
                                        disabled={!canManage}
                                    />
                                    <NumberInput
                                        label="Tavoli per fascia"
                                        placeholder="nessun limite"
                                        min={1}
                                        value={numberText("reservation_pacing_max_bookings")}
                                        onChange={e => setNumber("reservation_pacing_max_bookings", e.target.value, true)}
                                        disabled={!canManage}
                                    />
                                </FormGrid>
                                </FormSection>

                                <FormSection
                                    title="Quanto tempo prima"
                                    description="Vale solo online: a mano una prenotazione si inserisce per qualsiasi data e ora."
                                >
                                <FormGrid cols={2}>
                                    <NumberInput
                                        label="Preavviso minimo (minuti)"
                                        min={0}
                                        max={MIN_NOTICE_MINUTES_MAX}
                                        value={numberText("reservation_min_notice_minutes")}
                                        onChange={e => setNumber("reservation_min_notice_minutes", e.target.value, false)}
                                        disabled={!canManage}
                                        helperText="Con 120, alle 18:00 spariscono gli orari fino alle 20:00. Zero: nessun preavviso."
                                    />
                                    <NumberInput
                                        label="Orizzonte (giorni)"
                                        min={HORIZON_DAYS_MIN}
                                        max={HORIZON_DAYS_MAX}
                                        value={numberText("reservation_horizon_days")}
                                        onChange={e => setNumber("reservation_horizon_days", e.target.value, false)}
                                        disabled={!canManage}
                                        helperText="Quanti giorni in avanti, oggi compreso: con 90 l'ultimo è fra 89 giorni."
                                    />
                                </FormGrid>
                                </FormSection>
                                {showNoticeHorizonWarning && (
                                    <InlineBanner variant="warning">
                                        Con questo preavviso nessun orario rientra nell'orizzonte: online non si prenota
                                        nulla. Si può salvare lo stesso.
                                    </InlineBanner>
                                )}
                            </FormGrid>
                        </Card>
                    </>
                )}
            </section>
        </div>
    );
}
