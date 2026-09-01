import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import PartySizePicker from "./PartySizePicker";
import ReservationDatePicker from "./components/ReservationDatePicker";
import ReservationTimePicker from "./components/ReservationTimePicker";
import { getReservationPeriodsForDate } from "./utils/reservationSlots";
import { getReservationAvailability } from "@/services/supabase/reservations";
import type {
    OpeningHoursEntry,
    UpcomingClosure
} from "./availability";
import type { FieldErrors, FormFields } from "./types";
import styles from "./ReservationForm.module.scss";

type Props = {
    values: Pick<FormFields, "reservation_date" | "reservation_time" | "party_size">;
    errors: FieldErrors;
    hours: OpeningHoursEntry[];
    closures: UpcomingClosure[];
    /** Slug della sede: serve alla lettura di disponibilità. */
    slug: string;
    onChange: (name: keyof FormFields, value: string) => void;
    onBlur: (name: keyof FormFields) => void;
};

/** Ritardo prima di interrogare il server. Chi passa da 2 a 6 coperti clicca
 *  quattro volte in due secondi: senza questo sarebbero quattro chiamate per
 *  tre risposte che nessuno leggerà. */
const AVAILABILITY_DEBOUNCE_MS = 400;

/** Tetto lato server (una giornata intera a 15 minuti). Tagliamo qui così una
 *  giornata anomala degrada invece di farsi rifiutare l'intera richiesta. */
const MAX_TIMES = 96;

export default function WhenSection({
    values,
    errors,
    hours,
    closures,
    slug,
    onChange,
    onBlur
}: Props) {
    const { t } = useTranslation("public");

    // ── Disponibilità server-side ───────────────────────────────────────────
    // `null` = non lo sappiamo (non ancora chiesto, in volo, o chiamata
    // fallita) ⇒ griglia OTTIMISTA, tutti gli orari selezionabili e gate al
    // submit. È il comportamento di prima di questa funzione: un errore di
    // rete non deve impedire di prenotare.
    const [unavailable, setUnavailable] = useState<ReadonlySet<string> | null>(null);
    const [isChecking, setIsChecking] = useState(false);
    // Messaggio mostrato quando l'orario già scelto viene deselezionato perché
    // non regge più il nuovo numero di coperti. Mai deselezionare in silenzio.
    const [clearedNotice, setClearedNotice] = useState<string | null>(null);

    // Cache per (data, coperti), viva quanto la sessione: tornare indietro su
    // una combinazione già vista non deve ricontattare il server.
    const cacheRef = useRef<Map<string, ReadonlySet<string>>>(new Map());
    // Discrimina le risposte: una lenta che arriva dopo una veloce non deve
    // sovrascrivere un risultato più recente.
    const requestSeqRef = useRef(0);

    const partySizeNum = Number.parseInt(values.party_size, 10);
    const partyIsValid =
        Number.isInteger(partySizeNum) && partySizeNum >= 1 && partySizeNum <= 50;

    // Griglia "grezza": quali orari esistono per questa data, senza sapere
    // ancora se accettano. È anche la lista che mandiamo al server — la
    // generazione (apertura, chiusure, coda oltre mezzanotte) resta qui, il
    // server risponde solo sullo stato.
    const baseTimes = useMemo(() => {
        if (!values.reservation_date) return [];
        const periods = getReservationPeriodsForDate(
            values.reservation_date,
            hours,
            closures,
            new Date()
        );
        const out: string[] = [];
        for (const p of periods) {
            for (const s of p.slots) {
                // Gli orari già passati non si chiedono: sono comunque non
                // selezionabili, e occupano posti nel tetto dei 96.
                if (s.state === "past") continue;
                out.push(s.time);
            }
        }
        return out.slice(0, MAX_TIMES);
    }, [values.reservation_date, hours, closures]);

    // Chiave di cache e di richiesta. Cambia con la data o con i coperti:
    // quattro posti liberi bastano per due e non per sei, quindi una griglia
    // calcolata su un numero diverso direbbe una cosa falsa.
    const availabilityKey =
        values.reservation_date && partyIsValid && baseTimes.length > 0
            ? `${values.reservation_date}|${partySizeNum}`
            : null;

    useEffect(() => {
        if (!availabilityKey) {
            setUnavailable(null);
            setIsChecking(false);
            return;
        }

        const cached = cacheRef.current.get(availabilityKey);
        if (cached) {
            setUnavailable(cached);
            setIsChecking(false);
            return;
        }

        const seq = ++requestSeqRef.current;
        setIsChecking(true);
        const timer = setTimeout(() => {
            void getReservationAvailability({
                slug,
                reservation_date: values.reservation_date,
                party_size: partySizeNum,
                times: baseTimes
            })
                .then(slots => {
                    if (seq !== requestSeqRef.current) return;
                    const blocked = new Set<string>();
                    for (const s of slots) {
                        if (!s.available) blocked.add(s.time);
                    }
                    cacheRef.current.set(availabilityKey, blocked);
                    setUnavailable(blocked);
                })
                .catch(() => {
                    if (seq !== requestSeqRef.current) return;
                    // Nessun messaggio d'errore al cliente: la disponibilità è
                    // un aiuto, non un prerequisito. Si torna alla griglia
                    // ottimista e il gate resta al submit.
                    setUnavailable(null);
                })
                .finally(() => {
                    if (seq !== requestSeqRef.current) return;
                    setIsChecking(false);
                });
        }, AVAILABILITY_DEBOUNCE_MS);

        return () => clearTimeout(timer);
        // `baseTimes` deriva da data + orari + chiusure, già coperti dalla
        // chiave; non entra nelle dipendenze per non rilanciare a ogni
        // rigenerazione dell'array.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [availabilityKey, slug]);

    // Deselezione dell'orario che non regge più. Vive in un effect separato
    // perché deve scattare sia dopo una risposta del server sia dopo un colpo
    // di cache, e in entrambi i casi solo se un orario era davvero scelto.
    useEffect(() => {
        if (!unavailable || !values.reservation_time) return;
        if (!unavailable.has(values.reservation_time)) return;
        onChange("reservation_time", "");
        setClearedNotice(
            t("reservation.time_cleared_unavailable", { count: partySizeNum })
        );
    }, [unavailable, values.reservation_time, partySizeNum, onChange, t]);

    const servicePeriods = useMemo(() => {
        if (!values.reservation_date) return [];
        return getReservationPeriodsForDate(
            values.reservation_date,
            hours,
            closures,
            new Date(),
            unavailable ?? undefined
        );
    }, [values.reservation_date, hours, closures, unavailable]);

    const handleDateChange = (iso: string) => {
        if (iso === values.reservation_date) return;
        setClearedNotice(null);
        onChange("reservation_date", iso);
        // Clear the time when the date changes: prevents an orphan time
        // value that would survive into a day whose service blocks no
        // longer contain it.
        if (values.reservation_time) {
            onChange("reservation_time", "");
        }
        // No synchronous onBlur call here: with a discrete picker "blur"
        // has no semantic meaning, and invoking validateField inside the
        // same React tick as onChange would read a stale `form` from the
        // parent's closure and falsely flag the just-picked value as
        // empty. Submit-time validation + reactive availabilityErrors
        // still cover all real failure modes.
    };

    const handleTimeChange = (time: string) => {
        setClearedNotice(null);
        onChange("reservation_time", time);
        // See note in handleDateChange — onBlur removed to avoid stale
        // closure validation on the first selection.
    };

    const handlePartyChange = useCallback(
        (v: string) => {
            onChange("party_size", v);
        },
        [onChange]
    );

    const dateInvalid = Boolean(errors.reservation_date);
    const timeInvalid = Boolean(errors.reservation_time);

    return (
        <section className={styles.section} aria-labelledby="sec-quando">
            <div className={styles.sectionHead}>
                <span className={styles.sectionNum}>01</span>
                <span id="sec-quando" className={styles.sectionLabel}>{t("reservation.when")}</span>
                <span className={styles.sectionRule} aria-hidden="true" />
            </div>

            <div className={styles.field}>
                <span id="lbl-reservation_date" className={styles.label}>
                    {t("reservation.date")}
                </span>
                <ReservationDatePicker
                    value={values.reservation_date}
                    onChange={handleDateChange}
                    hours={hours}
                    closures={closures}
                    invalid={dateInvalid}
                    errorId={dateInvalid ? "err-reservation_date" : undefined}
                />
                {errors.reservation_date && (
                    <span id="err-reservation_date" className={styles.fieldError}>
                        {errors.reservation_date}
                    </span>
                )}
            </div>

            {/* Coperti PRIMA dell'orario: la disponibilità di una fascia dipende
                da quante persone sono, quindi il numero va chiesto prima. Con il
                selettore sotto, il cliente sceglieva un orario su una griglia
                calcolata per il default e lo scopriva pieno solo dopo — lo
                stesso difetto che questa funzione chiude, spostato di un campo. */}
            <PartySizePicker
                value={values.party_size}
                error={errors.party_size}
                onChange={handlePartyChange}
                onBlur={() => onBlur("party_size")}
            />

            <div className={styles.field}>
                <span id="lbl-reservation_time" className={styles.label}>
                    {t("reservation.time")}
                </span>
                <ReservationTimePicker
                    value={values.reservation_time}
                    onChange={handleTimeChange}
                    periods={servicePeriods}
                    disabled={!values.reservation_date}
                    disabledMessage={t("reservation.choose_date_first")}
                    loading={isChecking}
                    loadingLabel={t("reservation.checking_availability")}
                    invalid={timeInvalid}
                    errorId={timeInvalid ? "err-reservation_time" : undefined}
                />
                {errors.reservation_time && (
                    <span id="err-reservation_time" className={styles.fieldError}>
                        {errors.reservation_time}
                    </span>
                )}
                {!errors.reservation_time && clearedNotice && (
                    <span className={styles.fieldNotice} role="status">
                        {clearedNotice}
                    </span>
                )}
            </div>
        </section>
    );
}
