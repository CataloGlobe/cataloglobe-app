import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
    ArrowUpRight,
    CalendarCheck,
    ChevronRight,
    Clock,
    Facebook,
    Instagram,
    Leaf,
    MapPin,
    MessageCircle,
    Phone,
    ShieldAlert,
    Star
} from "lucide-react";
import { trackEvent } from "@/services/analytics/publicAnalytics";
import { COMPANY } from "@/config/company";
import { safeHttpHref } from "@/utils/sanitizeUrl";
import type { FooterSlotContext } from "../slots";
import { rememberSheetOpener } from "../sheets/sheetStack";
import { openVenueSheet } from "../sheets/venueSheetPages";
import { useVenueStatus } from "../venue/useVenueStatus";
import { venueStatusLabel } from "../venue/venueLabel";
import { todayOpeningRanges } from "../venue/venueStatus";
import styles from "./VenueFooter.module.scss";

const STARS = [1, 2, 3, 4, 5] as const;
/** Come l'invito e `ReviewsView`: un voto nelle ultime 24 ore vale ancora. */
const REVIEW_MEMORY_MS = 24 * 60 * 60 * 1000;

function isAbsoluteUrl(value: string): boolean {
    return value.startsWith("http://") || value.startsWith("https://");
}

/**
 * Fondo della pagina pubblica nel redesign (spec §10): voto, Oggi, Informazioni
 * utili, Contatti, Prenota, firma e link legali. Su desktop tre colonne.
 * Allergeni, Caratteristiche e Orari si aprono nel foglio unico.
 */
export default function VenueFooter({
    activityId,
    openingHours,
    upcomingClosures,
    socialLinks: links,
    address,
    allergensCount,
    hasCharacteristics,
    onOpenReservation,
    onRate,
    reviewed
}: FooterSlotContext) {
    const { t } = useTranslation("public");

    const track = (socialType: string) => {
        if (activityId) trackEvent(activityId, "social_click", { social_type: socialType });
    };

    const instagram =
        links?.instagram_public && links.instagram
            ? isAbsoluteUrl(links.instagram)
                ? safeHttpHref(links.instagram)
                : `https://instagram.com/${links.instagram.replace(/^@/, "")}`
            : undefined;
    const facebook =
        links?.facebook_public && links.facebook
            ? safeHttpHref(isAbsoluteUrl(links.facebook) ? links.facebook : `https://facebook.com/${links.facebook}`)
            : undefined;
    const whatsappDigits = links?.whatsapp_public && links.whatsapp ? links.whatsapp.replace(/\D/g, "") : "";
    const whatsapp = whatsappDigits ? `https://wa.me/${whatsappDigits}` : undefined;
    const phone = links?.phone_public && links.phone ? links.phone : undefined;
    const mapsHref = address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
        : undefined;

    const hasHours = openingHours.length > 0;
    const hasInfo = allergensCount > 0 || hasCharacteristics;
    const hasContacts = !!(phone || instagram || facebook || whatsapp || mapsHref);

    return (
        <footer className={styles.root}>
            <p className={styles.end}>
                <span>{t("page_end.end_of_menu")}</span>
            </p>

            <div className={styles.grid}>
                {onRate ? <RateBlock activityId={activityId} onRate={onRate} reviewedNow={reviewed} /> : null}

                {hasHours ? (
                    <section className={styles.group} aria-labelledby="pf-hours">
                        <h2 id="pf-hours" className={styles.label}>
                            {t("opening_hours.title")}
                        </h2>
                        <div className={styles.rows}>
                            <TodayRow openingHours={openingHours} upcomingClosures={upcomingClosures} />
                        </div>
                    </section>
                ) : null}

                {hasInfo ? (
                    <section className={styles.group} aria-labelledby="pf-info">
                        <h2 id="pf-info" className={styles.label}>
                            {t("page_end.useful_info")}
                        </h2>
                        <div className={styles.rows}>
                            {allergensCount > 0 ? (
                                <Row
                                    icon={<ShieldAlert size={18} strokeWidth={2} />}
                                    title={t("footer.allergens_label")}
                                    help={t("page_end.allergens_help", { count: allergensCount })}
                                    trail={<ChevronRight size={16} strokeWidth={2} />}
                                    onClick={event => {
                                        rememberSheetOpener(event.currentTarget);
                                        openVenueSheet("allergens");
                                    }}
                                />
                            ) : null}
                            {hasCharacteristics ? (
                                <Row
                                    icon={<Leaf size={18} strokeWidth={2} />}
                                    title={t("footer.characteristics_label")}
                                    help={t("page_end.characteristics_help")}
                                    trail={<ChevronRight size={16} strokeWidth={2} />}
                                    onClick={event => {
                                        rememberSheetOpener(event.currentTarget);
                                        openVenueSheet("characteristics");
                                    }}
                                />
                            ) : null}
                        </div>
                    </section>
                ) : null}

                {hasContacts ? (
                    <section className={styles.group} aria-labelledby="pf-contacts">
                        <h2 id="pf-contacts" className={styles.label}>
                            {t("info.contacts")}
                        </h2>
                        <div className={styles.rows}>
                            {phone ? (
                                <Row
                                    icon={<Phone size={18} strokeWidth={2} />}
                                    title={t("social.phone")}
                                    help={phone}
                                    trail={<span className={styles.trailText}>{t("page_end.call")}</span>}
                                    href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                                    onClick={() => track("phone")}
                                />
                            ) : null}
                            {instagram ? (
                                <Row
                                    icon={<Instagram size={18} strokeWidth={2} />}
                                    title={t("social.instagram")}
                                    help={isAbsoluteUrl(links!.instagram!) ? null : `@${links!.instagram!.replace(/^@/, "")}`}
                                    trail={<ArrowUpRight size={16} strokeWidth={2} />}
                                    href={instagram}
                                    external
                                    onClick={() => track("instagram")}
                                />
                            ) : null}
                            {facebook ? (
                                <Row
                                    icon={<Facebook size={18} strokeWidth={2} />}
                                    title={t("social.facebook")}
                                    trail={<ArrowUpRight size={16} strokeWidth={2} />}
                                    href={facebook}
                                    external
                                    onClick={() => track("facebook")}
                                />
                            ) : null}
                            {whatsapp ? (
                                <Row
                                    icon={<MessageCircle size={18} strokeWidth={2} />}
                                    title={t("social.whatsapp")}
                                    trail={<ArrowUpRight size={16} strokeWidth={2} />}
                                    href={whatsapp}
                                    external
                                    onClick={() => track("whatsapp")}
                                />
                            ) : null}
                            {mapsHref ? (
                                <Row
                                    icon={<MapPin size={18} strokeWidth={2} />}
                                    title={t("info.address")}
                                    help={address}
                                    trail={
                                        <span className={styles.trailText}>
                                            {t("page_end.directions")}
                                            <ArrowUpRight size={14} strokeWidth={2} aria-hidden />
                                        </span>
                                    }
                                    href={mapsHref}
                                    external
                                />
                            ) : null}
                        </div>
                    </section>
                ) : null}

                {onOpenReservation ? (
                    <div className={styles.reserve}>
                        <button type="button" className={styles.reserveButton} onClick={onOpenReservation}>
                            <CalendarCheck size={18} strokeWidth={2} aria-hidden />
                            {t("more.reservation_label")}
                        </button>
                    </div>
                ) : null}
            </div>

            <div className={styles.closing}>
                <a href={COMPANY.web.homepage} target="_blank" rel="noopener noreferrer" className={styles.brand}>
                    {t("footer.powered_by")} <strong>{COMPANY.businessName}</strong>
                </a>
                <p className={styles.legal}>
                    <a href="/legal/privacy" target="_blank" rel="noopener noreferrer">
                        {t("page_end.privacy")}
                    </a>
                    <span aria-hidden>·</span>
                    <a href="/legal/termini" target="_blank" rel="noopener noreferrer">
                        {t("page_end.terms")}
                    </a>
                </p>
            </div>
        </footer>
    );
}

type RowProps = {
    icon: ReactNode;
    title: string;
    help?: string | null;
    trail: ReactNode;
    href?: string;
    external?: boolean;
    onClick?: (event: MouseEvent<HTMLElement>) => void;
};

/** Riga del fondo: icona, titolo e aiuto, coda (›, ↗ o una parola). Link se porta fuori, bottone se apre il foglio. */
function Row({ icon, title, help, trail, href, external = false, onClick }: RowProps) {
    const { t } = useTranslation("public");
    const body = (
        <>
            <span className={styles.icon} aria-hidden>
                {icon}
            </span>
            <span className={styles.text}>
                <span className={styles.title}>{title}</span>
                {help ? <small className={styles.help}>{help}</small> : null}
            </span>
            <span className={styles.trail} aria-hidden>
                {trail}
            </span>
            {external ? <span className={styles.srOnly}>{t("page_end.new_window")}</span> : null}
        </>
    );
    if (href) {
        return (
            <a
                href={href}
                className={styles.row}
                onClick={onClick}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
                {body}
            </a>
        );
    }
    return (
        <button type="button" className={styles.row} onClick={onClick}>
            {body}
        </button>
    );
}

/** «Oggi 12:00–15:00 · 19:00–23:00», lo stato di adesso (lo stesso dell'isola) e «Tutti gli orari». */
function TodayRow({ openingHours, upcomingClosures }: Pick<FooterSlotContext, "openingHours" | "upcomingClosures">) {
    const { t, i18n } = useTranslation("public");
    const status = useVenueStatus(openingHours, upcomingClosures);
    const label = venueStatusLabel(status, t as (key: string, o?: Record<string, unknown>) => string, i18n.language);
    // Ricalcolato col render dello stato (che cambia al minuto): a mezzanotte la riga passa al giorno dopo.
    const ranges = todayOpeningRanges(new Date(), openingHours, upcomingClosures) ?? [];
    const title = ranges.length > 0 ? t("page_end.today", { hours: ranges.join(" · ") }) : t("page_end.today_closed");
    return (
        <button
            type="button"
            className={styles.row}
            onClick={event => {
                rememberSheetOpener(event.currentTarget);
                openVenueSheet("hours");
            }}
        >
            <span className={styles.icon} aria-hidden>
                <Clock size={18} strokeWidth={2} />
            </span>
            <span className={styles.text}>
                <span className={styles.title}>{title}</span>
                {label ? (
                    <small className={styles.help}>
                        <span className={styles.dot} data-kind={status.kind} aria-hidden />
                        {label}
                    </small>
                ) : null}
            </span>
            <span className={styles.trail} aria-hidden>
                <span className={`${styles.trailText} ${styles.allHours}`}>{t("page_end.all_hours")}</span>
                <ChevronRight size={16} strokeWidth={2} />
            </span>
        </button>
    );
}

/**
 * Blocco finale del voto (spec §10, 4a): la stella apre lo stesso foglio
 * dell'invito col voto già scelto. Dopo il voto dice «Grazie».
 */
function RateBlock({
    activityId,
    onRate,
    reviewedNow
}: {
    activityId?: string;
    onRate: (rating: number) => void;
    reviewedNow: boolean;
}) {
    const { t } = useTranslation("public");
    // Il voto di una visita precedente (24 ore) si legge dopo il primo disegno: in SSR non c'è localStorage.
    const [reviewedBefore, setReviewedBefore] = useState(false);
    useEffect(() => {
        if (!activityId) return;
        try {
            const ts = localStorage.getItem(`fab_reviewed_${activityId}`);
            setReviewedBefore(!!ts && Date.now() - parseInt(ts, 10) < REVIEW_MEMORY_MS);
        } catch {
            /* Safari privato: si chiede il voto */
        }
    }, [activityId]);

    if (reviewedNow || reviewedBefore) {
        return (
            <section className={styles.rate} aria-labelledby="pf-rate">
                <h2 id="pf-rate" className={styles.rateTitle}>
                    {t("page_end.rated_title")}
                </h2>
                <p className={styles.rateSub}>{t("page_end.rated_subtitle")}</p>
            </section>
        );
    }

    return (
        <section className={styles.rate} aria-labelledby="pf-rate">
            <h2 id="pf-rate" className={styles.rateTitle}>
                {t("page_end.rate_title")}
            </h2>
            <p className={styles.rateSub}>{t("page_end.rate_subtitle")}</p>
            <div className={styles.stars} role="group" aria-labelledby="pf-rate">
                {STARS.map(value => (
                    <button
                        key={value}
                        type="button"
                        className={styles.star}
                        aria-label={t("reviews.stars_aria", { count: value })}
                        onClick={() => onRate(value)}
                    >
                        <Star size={32} strokeWidth={1.75} aria-hidden />
                    </button>
                ))}
            </div>
        </section>
    );
}
