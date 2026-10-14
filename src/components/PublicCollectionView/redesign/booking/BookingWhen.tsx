import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Minus, Plus } from "lucide-react";
import { buildHorizonDays, type ReservationPeriodKey } from "@/pages/ReservationPage/utils/reservationSlots";
import type { FieldErrors, FormFields } from "@/pages/ReservationPage/types";
import type { BookingConfig } from "./bookingForm";
import { useSlotAvailability } from "./useSlotAvailability";
import styles from "./BookingPages.module.scss";

/** D37: sempre il numero esatto, da 1 a 20; oltre si scrive nelle richieste particolari. */
export const BOOKING_MAX_PARTY = 20;

const PERIOD_KEYS: Record<ReservationPeriodKey, string> = {
    notte: "reservation.period_night",
    mattina: "reservation.period_morning",
    pranzo: "reservation.period_lunch",
    pomeriggio: "reservation.period_afternoon",
    sera: "reservation.period_evening"
};

/** Porta l'orario a vista nel contenitore che scorre (il corpo del foglio), a un terzo dall'alto; fermo se si vede già. */
function revealSlot(target: HTMLElement) {
    let box = target.parentElement;
    while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
    if (!box) return;
    const top = target.getBoundingClientRect().top - box.getBoundingClientRect().top;
    if (top >= 0 && top + target.offsetHeight <= box.clientHeight) return;
    box.scrollTop += top - box.clientHeight / 3;
}

const dateOf = (iso: string) => {
    const [year, month, day] = iso.split("-").map(Number);
    return new Date(year, month - 1, day);
};

type Props = {
    values: Pick<FormFields, "reservation_date" | "reservation_time" | "party_size">;
    errors: FieldErrors;
    config: BookingConfig;
    onChange: (name: keyof FormFields, value: string) => void;
};

/**
 * «Quando» del redesign (mockup v38): giorni in fila, persone con − e +, tutti
 * gli orari a vista divisi per fascia. Orari, chiusure e disponibilità come
 * `WhenSection` di /prenota, che resta com'è (D73).
 */
export default function BookingWhen({ values, errors, config, onChange }: Props) {
    const { t, i18n } = useTranslation("public");
    const locale = i18n.language;
    const { periods, unavailable, checking } = useSlotAvailability({
        date: values.reservation_date,
        partySize: values.party_size,
        hours: config.hours,
        closures: config.closures,
        pacingSlotMinutes: config.pacingSlotMinutes,
        minNoticeMinutes: config.minNoticeMinutes,
        slug: config.slug
    });
    const [clearedNotice, setClearedNotice] = useState<string | null>(null);
    const party = Number.parseInt(values.party_size, 10) || 1;

    const days = useMemo(() => buildHorizonDays(config.hours, config.closures, config.horizonDays), [config]);
    const fmt = useMemo(
        () => ({
            weekday: new Intl.DateTimeFormat(locale, { weekday: "short" }),
            month: new Intl.DateTimeFormat(locale, { month: "short" }),
            long: new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" })
        }),
        [locale]
    );

    // Il giorno scelto a vista nella fila, senza far scorrere il foglio.
    const rowRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const row = rowRef.current;
        const selected = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
        if (!row || !selected) return;
        const left = selected.offsetLeft - row.offsetLeft;
        if (left < row.scrollLeft || left + selected.offsetWidth > row.scrollLeft + row.clientWidth) {
            row.scrollLeft = left - (row.clientWidth - selected.offsetWidth) / 2;
        }
    }, [values.reservation_date]);

    // Oggi, con orari già passati prima del primo libero, la lista va da sola al primo
    // libero (D91), una volta per giorno e solo se l'ora non è ancora scelta.
    const slotsRef = useRef<HTMLDivElement>(null);
    const revealedFor = useRef<string | null>(null);
    useEffect(() => {
        const date = values.reservation_date;
        if (!date || values.reservation_time || revealedFor.current === date) return;
        const slots = periods.flatMap(period => period.slots);
        const first = slots.findIndex(slot => slot.state === "available");
        if (first <= 0 || !slots.slice(0, first).some(slot => slot.state === "past")) return;
        revealedFor.current = date;
        const target = slotsRef.current?.querySelector<HTMLElement>(`[data-time="${slots[first].time}"]`);
        if (target) revealSlot(target);
    }, [values.reservation_date, values.reservation_time, periods]);

    // L'orario scelto che non regge più il numero di persone si toglie, e si dice (mai in silenzio).
    useEffect(() => {
        if (!unavailable || !values.reservation_time || !unavailable.has(values.reservation_time)) return;
        onChange("reservation_time", "");
        setClearedNotice(t("reservation.time_cleared_unavailable", { count: party }));
    }, [unavailable, values.reservation_time, party, onChange, t]);

    const pickDay = (iso: string) => {
        if (iso === values.reservation_date) return;
        setClearedNotice(null);
        onChange("reservation_date", iso);
        if (values.reservation_time) onChange("reservation_time", "");
    };
    const pickTime = (time: string) => {
        setClearedNotice(null);
        onChange("reservation_time", time);
    };
    const setParty = (next: number) => onChange("party_size", String(Math.min(BOOKING_MAX_PARTY, Math.max(1, next))));

    return (
        <div className={styles.when}>
            <div className={styles.field}>
                <p className={styles.label} id="lbl-reservation_date">
                    {t("booking.day")}
                    {values.reservation_date ? <em>{fmt.long.format(dateOf(values.reservation_date))}</em> : null}
                </p>
                <div ref={rowRef} className={styles.days} role="group" aria-labelledby="lbl-reservation_date">
                    {days.map((day, index) => {
                        const date = dateOf(day.iso);
                        const tag = day.isToday
                            ? t("booking.today")
                            : day.disabled
                              ? t("booking.closed")
                              : day.dayNum === 1 || index === 0
                                ? fmt.month.format(date)
                                : "";
                        return (
                            <button
                                key={day.iso}
                                type="button"
                                className={styles.day}
                                aria-pressed={day.iso === values.reservation_date}
                                disabled={day.disabled}
                                aria-label={`${fmt.long.format(date)}${day.disabled ? `, ${t("booking.closed")}` : ""}`}
                                onClick={() => pickDay(day.iso)}
                            >
                                {fmt.weekday.format(date).replace(".", "")}
                                <b>{day.dayNum}</b>
                                <small>{tag}</small>
                            </button>
                        );
                    })}
                </div>
                {errors.reservation_date ? (
                    <span id="err-reservation_date" className={styles.fieldError}>
                        {errors.reservation_date}
                    </span>
                ) : null}
            </div>

            <div className={styles.field}>
                <p className={styles.label} id="lbl-party_size">
                    {t("reservation.people")}
                </p>
                <div className={styles.party} role="group" aria-labelledby="lbl-party_size">
                    <button
                        type="button"
                        className={styles.partyButton}
                        aria-label={t("booking.party_less")}
                        disabled={party <= 1}
                        onClick={() => setParty(party - 1)}
                    >
                        <Minus size={18} strokeWidth={2.2} aria-hidden="true" />
                    </button>
                    <output className={styles.partyCount} aria-live="polite">
                        {party}
                        <small>{t("booking.people_word", { count: party })}</small>
                    </output>
                    <button
                        type="button"
                        className={styles.partyButton}
                        aria-label={t("booking.party_more")}
                        disabled={party >= BOOKING_MAX_PARTY}
                        onClick={() => setParty(party + 1)}
                    >
                        <Plus size={18} strokeWidth={2.2} aria-hidden="true" />
                    </button>
                </div>
                <p className={styles.hint}>
                    {t("booking.party_note")}{" "}
                    {party >= BOOKING_MAX_PARTY ? t("booking.party_note_over", { max: BOOKING_MAX_PARTY }) : t("booking.party_note_confirm")}
                </p>
                {errors.party_size ? (
                    <span id="err-party_size" className={styles.fieldError}>
                        {errors.party_size}
                    </span>
                ) : null}
            </div>

            <div className={styles.field}>
                <p className={styles.label} id="lbl-reservation_time">
                    {t("reservation.time")}
                    <em>{values.reservation_time ? values.reservation_time.slice(0, 5) : t("booking.pick_one")}</em>
                </p>
                <div ref={slotsRef} aria-busy={checking}>
                    {!values.reservation_date ? (
                        <p className={styles.empty}>{t("reservation.choose_date_first")}</p>
                    ) : periods.length === 0 ? (
                        <p className={styles.empty}>{t("reservation.no_times")}</p>
                    ) : (
                        periods.map(period => (
                            <div key={period.key}>
                                <p className={styles.period} id={`per-${period.key}`}>
                                    {t(PERIOD_KEYS[period.key])}
                                </p>
                                <div className={styles.slots} role="group" aria-labelledby={`per-${period.key}`}>
                                    {period.slots.map(slot => {
                                        const full = slot.state === "soldout";
                                        return (
                                            <button
                                                key={slot.time}
                                                type="button"
                                                className={styles.slot}
                                                data-time={slot.time}
                                                data-full={full ? "" : undefined}
                                                aria-pressed={slot.time === values.reservation_time}
                                                disabled={slot.state !== "available"}
                                                aria-label={
                                                    full
                                                        ? t("reservation.slot_unavailable_aria", { time: slot.time })
                                                        : slot.state === "past"
                                                          ? t("reservation.slot_past_aria", { time: slot.time })
                                                          : undefined
                                                }
                                                onClick={() => pickTime(slot.time)}
                                            >
                                                {slot.time}
                                                {full ? <small>{t("booking.full")}</small> : null}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    )}
                </div>
                <span className={styles.srOnly} role="status">
                    {checking ? t("reservation.checking_availability") : ""}
                </span>
                {errors.reservation_time ? (
                    <span id="err-reservation_time" className={styles.fieldError}>
                        {errors.reservation_time}
                    </span>
                ) : clearedNotice ? (
                    <span className={styles.fieldNotice} role="status">
                        {clearedNotice}
                    </span>
                ) : null}
            </div>
        </div>
    );
}
