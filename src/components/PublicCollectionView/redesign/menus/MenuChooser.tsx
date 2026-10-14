import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { CakeSlice, CalendarDays, ChevronRight, Clock, Coffee, Utensils, Wine } from "lucide-react";
import type { PublicMenu } from "@/types/resolvedCollections";
import type { OpeningHoursEntry, UpcomingClosure } from "@components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours";
import { COMPANY } from "@/config/company";
import { useSheetBodyLock } from "../../hooks/useSheetBodyLock";
import { rememberSheetOpener, useSheetState } from "../sheets/sheetStack";
import { openVenueSheet } from "../sheets/venueSheetPages";
import LanguageButton from "../island/LanguageButton";
import VenuePill from "../venue/VenuePill";
import { useVenueStatus } from "../venue/useVenueStatus";
import { venueStatusLabel } from "../venue/venueLabel";
import { laterMenus, menuHours, menuIcon, nowMenus, type MenuIcon } from "./menuList";
import { reducedMotion } from "./menuPassage";
import styles from "./MenuChooser.module.scss";

const ICONS: Record<MenuIcon, typeof Utensils> = { utensils: Utensils, wine: Wine, coffee: Coffee, cake: CakeSlice };

/** La card toccata risponde (130 ms, 40 col movimento ridotto) prima che parta il passaggio. */
const PICK_MS = 130;
const PICK_MS_REDUCED = 40;

export type MenuChooserProps = {
    menus: PublicMenu[];
    /** Il tocco su una card: chi chiama fa il passaggio verso il menu. */
    onChoose: (menu: PublicMenu) => void;
    /** Come entra: le card in cascata alla prima apertura, ferma tornando da «Tutti i menu», da sinistra con l'indietro del browser. */
    entrance: "rise" | "still" | "back";
    activityName: string;
    logoUrl: string | null;
    coverImageUrl: string | null;
    openingHours: OpeningHoursEntry[];
    upcomingClosures: UpcomingClosure[];
    /** «Prenota un tavolo»: i passi nel foglio o la pagina /prenota; senza prenotazioni non c'è. */
    onOpenBooking?: () => void;
};

/**
 * «Scegli il menu» (spec §12, mockup v38 `mpkHTML`): stessa identità del menu
 * (foto, isola con logo, nome, stato, lingua), i menu di adesso come card grandi,
 * sotto quelli di più tardi e i collegamenti del locale. Sta sopra il menu, che
 * resta montato sotto e inerte; conta come foglio aperto, così barra e invito al
 * voto restano fermi finché c'è.
 */
export default function MenuChooser({
    menus,
    onChoose,
    entrance,
    activityName,
    logoUrl,
    coverImageUrl,
    openingHours,
    upcomingClosures,
    onOpenBooking
}: MenuChooserProps) {
    const { t, i18n } = useTranslation("public");
    const translate = t as (key: string, o?: Record<string, unknown>) => string;
    useSheetBodyLock(true);
    // Con un foglio aperto sopra (Info, Prenota, Lingua) la scelta sta ferma come il menu.
    const sheetOpen = useSheetState().pages.length > 0;
    const status = useVenueStatus(openingHours, upcomingClosures);
    const statusLabel = venueStatusLabel(status, translate, i18n.language);
    const titleRef = useRef<HTMLHeadingElement>(null);
    const [picked, setPicked] = useState<string | null>(null);
    const now = nowMenus(menus);
    const later = laterMenus(menus);
    const hasInfo = openingHours.length > 0;

    // Tornando alla scelta il fuoco va sul titolo; alla prima apertura resta dov'è.
    useEffect(() => {
        if (entrance !== "rise") titleRef.current?.focus({ preventScroll: true });
    }, [entrance]);

    const pick = (menu: PublicMenu) => {
        if (picked) return;
        setPicked(menu.slug);
        window.setTimeout(() => onChoose(menu), reducedMotion() ? PICK_MS_REDUCED : PICK_MS);
    };

    const openInfo = (event: MouseEvent<HTMLButtonElement>) => {
        // Safari non dà il fuoco al bottone toccato: alla chiusura del foglio torna qui.
        rememberSheetOpener(event.currentTarget);
        openVenueSheet("info");
    };

    return (
        <div
            className={styles.scelta}
            role="region"
            aria-label={t("menus.choose_title")}
            data-entrance={entrance}
            data-cover={coverImageUrl ? true : undefined}
            inert={sheetOpen}
        >
            {coverImageUrl ? (
                <div className={styles.copertina}>
                    <img src={coverImageUrl} alt="" role="presentation" decoding="async" width={1920} height={1080} />
                </div>
            ) : null}
            <header className={styles.isola}>
                {logoUrl ? (
                    <img
                        src={logoUrl}
                        alt={t("header.logo_alt", { name: activityName })}
                        className={styles.logo}
                        decoding="async"
                        width={52}
                        height={52}
                    />
                ) : null}
                <div className={styles.testi}>
                    <p className={styles.nome}>{activityName}</p>
                    <VenuePill
                        hours={openingHours}
                        closures={upcomingClosures}
                        onOpenHours={() => openVenueSheet("hours")}
                    />
                </div>
                <LanguageButton className={styles.lingua} />
            </header>

            <div className={styles.corpo}>
                <h1 ref={titleRef} className={styles.titolo} tabIndex={-1}>
                    {t("menus.choose_title")}
                </h1>
                <p className={styles.sottotitolo}>{t("menus.choose_subtitle", { count: now.length })}</p>
                <ul className={styles.elenco}>
                    {now.map((menu, index) => {
                        const Icon = ICONS[menuIcon(menu)];
                        const hours = menuHours(menu);
                        return (
                            <li key={menu.catalogId} style={{ "--i": index } as CSSProperties}>
                                <button
                                    type="button"
                                    className={styles.card}
                                    data-pick={picked === menu.slug || undefined}
                                    onClick={() => pick(menu)}
                                    aria-label={t("menus.card_aria", {
                                        name: menu.name,
                                        hours,
                                        categories: t("menus.categories", { count: menu.categoriesCount }),
                                        products: t("menus.products", { count: menu.productsCount })
                                    })}
                                >
                                    <span className={styles.icona} aria-hidden>
                                        <Icon size={24} strokeWidth={1.9} />
                                    </span>
                                    <span className={styles.testoCard}>
                                        <b>{menu.name}</b>
                                        <small>
                                            <span className={styles.ora}>{hours}</span>
                                            {" · "}
                                            {t("menus.products", { count: menu.productsCount })}
                                        </small>
                                    </span>
                                    <span className={styles.vai} aria-hidden>
                                        <ChevronRight size={18} strokeWidth={2.2} />
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>

                {later.length > 0 ? (
                    <>
                        <h2 className={styles.etichetta}>{t("menus.later")}</h2>
                        <ul className={styles.elenco} data-later>
                            {later.map((menu, index) => {
                                const Icon = ICONS[menuIcon(menu)];
                                const from = menuHours(menu).slice(0, 5);
                                return (
                                    <li
                                        key={menu.catalogId}
                                        className={styles.dopo}
                                        style={{ "--i": now.length + index } as CSSProperties}
                                    >
                                        <span className={styles.icona} aria-hidden>
                                            <Icon size={20} strokeWidth={1.9} />
                                        </span>
                                        <span className={styles.testoCard}>
                                            <b>{menu.name}</b>
                                            <small>{t("menus.not_yet")}</small>
                                        </span>
                                        <span className={styles.quando}>{t("menus.from", { time: from })}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    </>
                ) : null}

                {hasInfo || onOpenBooking ? (
                    <section className={styles.locale} aria-labelledby="menu-chooser-venue">
                        <h2 id="menu-chooser-venue" className={styles.etichetta}>
                            {t("menus.venue_label")}
                        </h2>
                        <div className={styles.righe}>
                            {hasInfo ? (
                                <button type="button" className={styles.riga} onClick={openInfo} aria-haspopup="dialog">
                                    <span className={styles.rigaIcona} aria-hidden>
                                        <Clock size={18} strokeWidth={2} />
                                    </span>
                                    <span className={styles.rigaTesto}>
                                        <span>{t("more.info_hours_label")}</span>
                                        <small>{statusLabel ?? t("more.info_subtitle")}</small>
                                    </span>
                                    <ChevronRight size={18} strokeWidth={2} aria-hidden />
                                </button>
                            ) : null}
                            {onOpenBooking ? (
                                <button
                                    type="button"
                                    className={styles.riga}
                                    onClick={event => {
                                        rememberSheetOpener(event.currentTarget);
                                        onOpenBooking();
                                    }}
                                    aria-haspopup="dialog"
                                >
                                    <span className={styles.rigaIcona} aria-hidden>
                                        <CalendarDays size={18} strokeWidth={2} />
                                    </span>
                                    <span className={styles.rigaTesto}>
                                        <span>{t("more.reservation_label")}</span>
                                    </span>
                                    <ChevronRight size={18} strokeWidth={2} aria-hidden />
                                </button>
                            ) : null}
                        </div>
                    </section>
                ) : null}

                <p className={styles.firma}>
                    <a href={COMPANY.web.homepage} target="_blank" rel="noopener noreferrer">
                        {t("footer.powered_by")} <strong>{COMPANY.businessName}</strong>
                    </a>
                </p>
            </div>
        </div>
    );
}
