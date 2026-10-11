import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
    CalendarCheck,
    Check,
    ChevronRight,
    Clock,
    Facebook,
    Filter,
    Globe,
    Info,
    Instagram,
    Languages,
    Mail,
    MapPin,
    MessageCircle,
    Phone,
    Share2
} from "lucide-react";
import { useLanguage } from "@context/Language/useLanguage";
import PublicOpeningHours from "@components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours";
import { PublicFeeRows } from "@components/PublicCollectionView/PublicFooter/PublicFees";
import { safeHttpHref } from "@/utils/sanitizeUrl";
import type { SheetsSlotContext } from "../slots";
import { useVenueStatus } from "../venue/useVenueStatus";
import { venueStatusLabel } from "../venue/venueLabel";
import SheetHost from "./SheetHost";
import { closeSheet, type SheetPage } from "./sheetStack";
import { pushVenueSheet } from "./venueSheetPages";
import styles from "./VenueSheets.module.scss";

/**
 * Il foglio unico del locale nel redesign: ⋯ (Altre opzioni), Informazioni,
 * Orari e Lingua sono pagine della stessa pila, a spinta, al posto dei due `PublicSheet`
 * di oggi (niente più chiudi-e-riapri dopo 300 ms). Montato una volta da
 * `CollectionView` tramite `sheetsSlot`.
 */
export default function VenueSheets(props: SheetsSlotContext) {
    return <SheetHost backgroundRef={props.pageRef} renderPage={page => <VenuePage page={page} {...props} />} />;
}

function VenuePage({ page, ...props }: SheetsSlotContext & { page: SheetPage }) {
    switch (page.key) {
        case "more":
            return <MorePage {...props} />;
        case "info":
            return <InfoPage {...props} />;
        case "hours":
            return (
                <PublicOpeningHours
                    openingHours={props.openingHours}
                    upcomingClosures={props.upcomingClosures}
                    showHeading={false}
                    surface="surface"
                />
            );
        case "language":
            return <LanguagePage />;
        default:
            return null;
    }
}

type RowProps = {
    icon: ReactNode;
    label: string;
    subtitle?: string | null;
    onClick?: () => void;
    disabled?: boolean;
    chevron?: boolean;
};

/** Riga toccabile del foglio: icona, testo su due righe, freccia se porta altrove. */
function Row({ icon, label, subtitle, onClick, disabled = false, chevron = true }: RowProps) {
    return (
        <button type="button" className={styles.row} onClick={onClick} disabled={disabled}>
            <span className={styles.rowIcon} aria-hidden>
                {icon}
            </span>
            <span className={styles.rowText}>
                <span className={styles.rowLabel}>{label}</span>
                {subtitle ? <span className={styles.rowSubtitle}>{subtitle}</span> : null}
            </span>
            {chevron && !disabled ? <ChevronRight size={16} strokeWidth={2} className={styles.chevron} aria-hidden /> : null}
        </button>
    );
}

function MorePage({
    hasInfo,
    openingHours,
    upcomingClosures,
    activeFilterCount,
    hasAllergensInCatalog,
    onOpenFilters,
    onOpenReservation,
    shareUrl,
    shareTitle
}: SheetsSlotContext) {
    const { t } = useTranslation("public");
    // Feedback sulla riga Condividi (copia del link): due secondi, niente toast.
    const [shareFeedback, setShareFeedback] = useState<null | "copied" | "error">(null);

    const handleShare = async () => {
        if (!shareUrl) return;
        if (navigator.share) {
            try {
                await navigator.share({ title: shareTitle, url: shareUrl });
                return;
            } catch (error) {
                // Foglio nativo annullato: nessun feedback.
                if ((error as Error).name === "AbortError") return;
            }
        }
        try {
            await navigator.clipboard.writeText(shareUrl);
            setShareFeedback("copied");
        } catch {
            setShareFeedback("error");
        }
        window.setTimeout(() => setShareFeedback(null), 2000);
    };

    const { currentLang, availableLanguages } = useLanguage();
    const activeLanguage = availableLanguages.find(lang => lang.code === currentLang);

    const filtersDisabled = !hasAllergensInCatalog;
    const filtersSubtitle = filtersDisabled
        ? t("allergens.filter_empty")
        : activeFilterCount > 0
          ? t("more.filters_subtitle_active", { count: activeFilterCount })
          : t("more.filters_subtitle_inactive");

    return (
        <div className={styles.list}>
            {hasInfo ? (
                <Row
                    icon={<Info size={18} strokeWidth={2} />}
                    label={t("more.info_label")}
                    subtitle={t("more.info_subtitle")}
                    onClick={() => pushVenueSheet("info")}
                />
            ) : null}
            {openingHours.length > 0 ? (
                <HoursRow openingHours={openingHours} upcomingClosures={upcomingClosures} onClick={() => pushVenueSheet("hours")} />
            ) : null}
            {availableLanguages.length > 1 ? (
                <Row
                    icon={<Languages size={18} strokeWidth={2} />}
                    label={t("language_selector.sheet_title")}
                    subtitle={activeLanguage?.name_native ?? currentLang.toUpperCase()}
                    onClick={() => pushVenueSheet("language")}
                />
            ) : null}
            {onOpenReservation ? (
                <Row
                    icon={<CalendarCheck size={18} strokeWidth={2} />}
                    label={t("more.reservation_label")}
                    subtitle={t("more.reservation_subtitle")}
                    onClick={() => {
                        closeSheet();
                        onOpenReservation();
                    }}
                />
            ) : null}
            <Row
                icon={<Filter size={18} strokeWidth={2} />}
                label={t("more.filters_label")}
                subtitle={filtersSubtitle}
                disabled={filtersDisabled}
                onClick={() => {
                    // I filtri stanno nella ricerca: il foglio si chiude nello stesso
                    // commit in cui la ricerca si apre, il blocco della pagina passa
                    // dall'uno all'altra prima del paint.
                    closeSheet();
                    onOpenFilters();
                }}
            />
            {shareUrl ? (
                <Row
                    icon={<Share2 size={18} strokeWidth={2} />}
                    label={
                        shareFeedback === "copied"
                            ? t("more.share_copied")
                            : shareFeedback === "error"
                              ? t("more.share_error")
                              : t("more.share_label")
                    }
                    subtitle={t("more.share_subtitle")}
                    chevron={false}
                    onClick={handleShare}
                />
            ) : null}
            <span className={styles.liveRegion} role="status" aria-live="polite">
                {shareFeedback === "copied" ? t("more.share_copied") : shareFeedback === "error" ? t("more.share_error") : ""}
            </span>
        </div>
    );
}

/** Elenco delle lingue: la scelta chiude il foglio e cambia la lingua della pagina. */
function LanguagePage() {
    const { t } = useTranslation("public");
    const { currentLang, availableLanguages, setLang } = useLanguage();
    return (
        <div className={styles.list} role="listbox" aria-label={t("language_selector.list_aria")}>
            {availableLanguages.map(lang => {
                const active = lang.code === currentLang;
                return (
                    <button
                        key={lang.code}
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={styles.row}
                        onClick={() => {
                            closeSheet();
                            if (!active) setLang(lang.code);
                        }}
                    >
                        <span className={styles.rowIcon} aria-hidden>
                            {lang.flag_emoji ?? lang.code.toUpperCase()}
                        </span>
                        <span className={styles.rowText}>
                            <span className={styles.rowLabel}>{lang.name_native}</span>
                        </span>
                        {active ? <Check size={18} strokeWidth={2.5} className={styles.check} aria-hidden /> : null}
                    </button>
                );
            })}
        </div>
    );
}

/** Riga Orari: lo stato di adesso (lo stesso dell'isola) e la spinta verso tutti gli orari. */
function HoursRow({
    openingHours,
    upcomingClosures,
    onClick
}: Pick<SheetsSlotContext, "openingHours" | "upcomingClosures"> & { onClick: () => void }) {
    const { t, i18n } = useTranslation("public");
    const status = useVenueStatus(openingHours, upcomingClosures);
    const label = venueStatusLabel(status, t as (key: string, o?: Record<string, unknown>) => string, i18n.language);
    return <Row icon={<Clock size={18} strokeWidth={2} />} label={t("opening_hours.title")} subtitle={label} onClick={onClick} />;
}

function InfoPage({
    openingHours,
    upcomingClosures,
    fees,
    paymentMethods,
    activityServices,
    socialLinks: links,
    address
}: SheetsSlotContext) {
    const { t } = useTranslation("public");
    const website = links?.website_public && links.website ? safeHttpHref(links.website) : undefined;
    const facebook = links?.facebook_public && links.facebook ? safeHttpHref(links.facebook) : undefined;
    const contacts = [
        links?.phone_public && links.phone
            ? { key: "phone", href: `tel:${links.phone}`, icon: <Phone size={16} strokeWidth={2} />, label: links.phone, external: false }
            : null,
        links?.email_public_visible && links.email_public
            ? { key: "email", href: `mailto:${links.email_public}`, icon: <Mail size={16} strokeWidth={2} />, label: links.email_public, external: false }
            : null,
        website
            ? { key: "web", href: website, icon: <Globe size={16} strokeWidth={2} />, label: links!.website!.replace(/^https?:\/\//, ""), external: true }
            : null,
        links?.instagram_public && links.instagram
            ? { key: "ig", href: `https://instagram.com/${links.instagram}`, icon: <Instagram size={16} strokeWidth={2} />, label: `@${links.instagram}`, external: true }
            : null,
        facebook ? { key: "fb", href: facebook, icon: <Facebook size={16} strokeWidth={2} />, label: "Facebook", external: true } : null,
        links?.whatsapp_public && links.whatsapp
            ? {
                  key: "wa",
                  href: `https://wa.me/${links.whatsapp.replace(/\D/g, "")}`,
                  icon: <MessageCircle size={16} strokeWidth={2} />,
                  label: "WhatsApp",
                  external: true
              }
            : null
    ].filter(contact => contact !== null);

    return (
        <div className={styles.list}>
            {openingHours.length > 0 ? (
                <HoursRow
                    openingHours={openingHours}
                    upcomingClosures={upcomingClosures}
                    onClick={() => pushVenueSheet("hours")}
                />
            ) : null}

            {fees.length > 0 ? (
                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>{t("info.fees")}</h3>
                    <PublicFeeRows fees={fees} surface="surface" />
                </section>
            ) : null}

            {paymentMethods.length > 0 ? (
                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>{t("info.payment_methods")}</h3>
                    <ul className={styles.tags}>
                        {paymentMethods.map(method => (
                            <li key={method} className={styles.tag}>
                                {method}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {activityServices.length > 0 ? (
                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>{t("info.services")}</h3>
                    <ul className={styles.tags}>
                        {activityServices.map(service => (
                            <li key={service} className={styles.tag}>
                                {service}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {contacts.length > 0 ? (
                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>{t("info.contacts")}</h3>
                    <ul className={styles.contacts}>
                        {contacts.map(contact => (
                            <li key={contact.key}>
                                <a
                                    href={contact.href}
                                    className={styles.contact}
                                    {...(contact.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                                >
                                    <span aria-hidden>{contact.icon}</span>
                                    <span className={styles.contactLabel}>{contact.label}</span>
                                </a>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {address ? (
                <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>{t("info.address")}</h3>
                    <p className={styles.address}>
                        <MapPin size={16} strokeWidth={2} aria-hidden />
                        <span>{address}</span>
                    </p>
                </section>
            ) : null}
        </div>
    );
}
