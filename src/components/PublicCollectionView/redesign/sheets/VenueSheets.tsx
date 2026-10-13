import { lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
    CalendarDays,
    Check,
    ChevronRight,
    Clock,
    Facebook,
    Globe,
    Info,
    Instagram,
    ListFilter,
    Mail,
    MapPin,
    MessageCircle,
    Phone,
    ScrollText,
    Share,
    Utensils
} from "lucide-react";
import { useLanguage } from "@context/Language/useLanguage";
import type { OpeningHoursEntry, UpcomingClosure } from "@components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours";
import { visibleClosures } from "@components/PublicCollectionView/PublicOpeningHours/visibleClosures";
import { todayIsoDate } from "@/utils/dateLocal";
import { PublicFeeRows } from "@components/PublicCollectionView/PublicFooter/PublicFees";
import { safeHttpHref } from "@/utils/sanitizeUrl";
import type { V2FeaturedContent } from "@/types/resolvedCollections";
import type { CollectionViewSectionItem } from "@components/PublicCollectionView/CollectionView/CollectionView";
import EventsView from "@components/PublicCollectionView/EventsView/EventsView";
import { FeaturedContentDetail, FeaturedCtaFooter } from "@components/PublicCollectionView/FeaturedBlock/FeaturedContentDetail";
import { hasFeaturedCta } from "@components/PublicCollectionView/FeaturedBlock/featuredCta";
import type { SheetsSlotContext } from "../slots";
import { useVenueStatus } from "../venue/useVenueStatus";
import { venueStatusSheetLabel } from "../venue/venueLabel";
import { romeWeekday, todayOpeningRanges } from "../venue/venueStatus";
import SheetHost from "./SheetHost";
import { closeSheet, getSheetState, popSheetPage, useSheetState, type SheetPage } from "./sheetStack";
import { FEATURED_DETAIL_PREFIX, pushFeaturedDetail, pushVenueSheet } from "./venueSheetPages";
import CategoryList from "../categories/CategoryList";
import { categoryTotals } from "../categories/categoryBoxes";
import SearchHeader from "../search/SearchHeader";
import ProductPage, { ProductHeadPrice, ProductUnavailable } from "../product/ProductPage";
import { productIdOf } from "../product/productSheet";
import { loadStoryPage, pageBelow, storyRefOf } from "../story/storySheet";
import { ProductOrderFooter, type OrderBinding } from "../order/OrderChoices";
import { draftFromLine, draftToLine, type OrderDraft } from "../order/orderDraft";
import { showAdded } from "../order/addedNoticeStore";
import { useOrderDrafts } from "../order/useOrderDrafts";
import OrderPage, { OrderFooter } from "../order/OrderPage";
import OrderSentPage, { OrderSentFooter } from "../order/OrderSentPage";
import { orderSentIdOf } from "../order/orderSend";
import { useSessionOrders, type SessionOrdersState } from "../order/useSessionOrders";
import { editTargetKey } from "../order/orderSheet";
import { useOrderSend, type OrderSendState } from "../order/useOrderSend";
import SearchPage from "../search/SearchPage";
import { FiltersFooter, FiltersPage } from "../search/FiltersPage";
import { menuPreferences } from "../search/preferences";
import { AllergensFooter, AllergensPage, CharacteristicsPage } from "./MenuInfoPages";
import { rateOf } from "../vote/rateSheet";
import { loadVoteForm } from "../vote/loadVoteForm";
import { useBooking, type BookingBinding } from "../booking/useBooking";
import { isBookingPage, pushBookingSheet } from "../booking/bookingSheet";
import { isOwnBookingUrl, type BookingConfig } from "../booking/bookingForm";
import styles from "./VenueSheets.module.scss";

// Lo stesso modulo del voto di oggi, nel suo chunk (lo stesso di CollectionView).
const VoteForm = lazy(loadVoteForm);
// I passi della prenotazione (calendario, orari, campi della pagina /prenota) in un chunk loro.
const loadBooking = () => import("../booking/BookingPages");
const BookingPage = lazy(loadBooking);
// Il lettore porta i blocchi delle storie (video compreso): si carica alla prima storia aperta.
const StoryPage = lazy(loadStoryPage);
const BookingFooter = lazy(() => loadBooking().then(module => ({ default: module.BookingFooter })));
const BookingCtaFooter = lazy(() => loadBooking().then(module => ({ default: module.BookingCtaFooter })));

/**
 * Il foglio unico del locale nel redesign: ⋯ (Altre opzioni), Informazioni,
 * Orari e Lingua sono pagine della stessa pila, a spinta, al posto dei due `PublicSheet`
 * di oggi (niente più chiudi-e-riapri dopo 300 ms). Montato una volta da
 * `CollectionView` tramite `sheetsSlot`.
 */
export default function VenueSheets({ booking: bookingConfig, ...props }: SheetsSlotContext & { booking: BookingConfig | null }) {
    // Il testo della ricerca vive qui: testata (campo) e pagina (risultati) lo
    // condividono, e sopravvive al giro nei Filtri. Si svuota quando «Cerca» rientra
    // nella pila, non quando esce: durante la discesa il foglio tiene i risultati.
    const [query, setQuery] = useState("");
    const searchInStack = useSheetState().pages.some(page => page.key === "search");
    const [searchWasInStack, setSearchWasInStack] = useState(searchInStack);
    const orderFor = useOrderDrafts(props.product.order);
    // Gli ordini del tavolo: una lettura per «Il tuo ordine» e la sua conferma, solo finché ci sono.
    const orderInStack = useSheetState().pages.some(page => page.key === "order" || orderSentIdOf(page.key) != null);
    const sessionOrders = useSessionOrders(
        props.ordering?.jwt ?? null,
        props.ordering?.refreshKey ?? 0,
        () => props.ordering?.onSessionExpired(),
        orderInStack
    );
    const sendState = useOrderSend(props.ordering, () => sessionOrders.orders?.length ?? null);
    const booking = useBooking(bookingConfig ?? undefined);
    if (searchInStack !== searchWasInStack) {
        setSearchWasInStack(searchInStack);
        if (searchInStack) setQuery("");
    }

    return (
        <SheetHost
            backgroundRef={props.pageRef}
            renderPage={page =>
                page.key === "search" ? (
                    <SearchPage query={query} onQueryChange={setQuery} search={props.search} categories={props.categories} menuGroups={props.menuInfo.groups} />
                ) : isBookingPage(page) ? (
                    booking ? (
                        <Suspense fallback={null}>
                            <BookingPage page={page} booking={booking} />
                        </Suspense>
                    ) : null
                ) : (
                    <VenuePage
                        page={page}
                        {...props}
                        orderFor={orderFor}
                        sendState={sendState}
                        sessionOrders={sessionOrders}
                        booking={booking}
                    />
                )
            }
            renderHeader={page => (page.key === "search" ? <SearchHeader query={query} onQueryChange={setQuery} /> : null)}
            renderHeading={page => {
                const productId = productIdOf(page) ?? editTargetKey(page)?.productId;
                const item = productId ? props.product.findProduct(productId) : null;
                return item ? <ProductHeadPrice item={item} /> : null;
            }}
            renderFooter={page => {
                if (isBookingPage(page)) {
                    return booking ? (
                        <Suspense fallback={null}>
                            <BookingFooter page={page} booking={booking} />
                        </Suspense>
                    ) : null;
                }
                if (page.key === "filters") return <FiltersFooter {...props.search} />;
                if (page.key === "allergens") return <AllergensFooter hasAllergensInCatalog={props.hasAllergensInCatalog} />;
                if (page.key === "order") {
                    return <OrderFooter ordering={props.ordering} findProduct={props.product.findProduct} sendState={sendState} />;
                }
                const sentId = orderSentIdOf(page.key);
                if (sentId) return sendState.receipts[sentId] ? <OrderSentFooter /> : null;
                const edit = editTargetOf(page, props);
                const editOrder = edit
                    ? orderFor(page.key, edit.item, edit.line ? draftFromLine(edit.item, edit.line) : undefined)
                    : undefined;
                if (edit && editOrder) {
                    return (
                        <ProductOrderFooter
                            item={edit.item}
                            order={editOrder}
                            actionKey="order_sheet.update"
                            onAdd={() => {
                                // Durante il ritorno a «Il tuo ordine» un secondo tocco non sostituisce di nuovo.
                                if (getSheetState().pages.at(-1)?.key !== page.key || !edit.line) return;
                                const line = draftToLine(edit.item, editOrder.draft);
                                if (!line || !props.ordering) return;
                                props.ordering.replaceLine(edit.index, line);
                                popSheetPage();
                            }}
                        />
                    );
                }
                const productId = productIdOf(page);
                const item = productId ? props.product.findProduct(productId) : null;
                const order = item ? orderFor(page.key, item) : undefined;
                if (item && order) {
                    return (
                        <ProductOrderFooter
                            item={item}
                            order={order}
                            onAdd={() => {
                                // Il foglio resta a vista mentre scende: un secondo tocco non aggiunge di nuovo.
                                if (getSheetState().pages.length === 0) return;
                                const line = draftToLine(item, order.draft);
                                if (!line || !props.product.order) return;
                                const undo = props.product.order.add(line);
                                closeSheet();
                                showAdded(item.name, undo);
                            }}
                        />
                    );
                }
                const block = featuredOf(page, props.featured.contents);
                if (!block || !hasFeaturedCta(block)) return null;
                // Il pulsante porta alla prenotazione di questa sede: i passi nel foglio, senza lasciare il menu.
                if (booking && block.cta_text && isOwnBookingUrl(block.cta_url, booking.config.slug)) {
                    return (
                        <Suspense fallback={null}>
                            <BookingCtaFooter label={block.cta_text} />
                        </Suspense>
                    );
                }
                return <FeaturedCtaFooter block={block} />;
            }}
        />
    );
}

/**
 * La riga di «Il tuo ordine» che una pagina `order-edit:` modifica, col suo piatto.
 * `line` è null quando a quell'indice non c'è più quel piatto (la riga si è appena
 * sommata a un'altra): la pagina che scende resta sulla sua bozza, «Aggiorna» non fa nulla.
 */
function editTargetOf(page: SheetPage, props: SheetsSlotContext) {
    const key = editTargetKey(page);
    if (!key) return null;
    const item = props.product.findProduct(key.productId);
    if (!item) return null;
    const line = props.ordering?.selection[key.index];
    return { index: key.index, item, line: line?.id === key.productId ? line : null };
}

/** Il contenuto in evidenza di una pagina di dettaglio (`featured:<id>`); null altrimenti. */
function featuredOf(page: SheetPage, contents: V2FeaturedContent[]): V2FeaturedContent | null {
    if (!page.key.startsWith(FEATURED_DETAIL_PREFIX)) return null;
    const id = page.key.slice(FEATURED_DETAIL_PREFIX.length);
    return contents.find(block => block.id === id) ?? null;
}

/** Tutti i contenuti in evidenza (mockup v38): quanti sono, poi le card. */
function FeaturedPage({
    featured,
    onOpen
}: {
    featured: SheetsSlotContext["featured"];
    onOpen: (block: V2FeaturedContent) => void;
}) {
    const { t } = useTranslation("public");
    const count = featured.contents.length;
    return (
        <>
            {count > 0 ? <p className={styles.summary}>{t("featured.list_count", { count })}</p> : null}
            <EventsView
                featuredContents={featured.contents}
                layout={featured.layout}
                showSubtitle={featured.showSubtitle}
                showTitle={featured.showTitle}
                showCta={featured.showCta}
                selectedFeatured={null}
                onSelectFeatured={block => block && onOpen(block)}
            />
        </>
    );
}

function VenuePage({
    page,
    orderFor,
    sendState,
    sessionOrders,
    booking,
    ...props
}: SheetsSlotContext & {
    page: SheetPage;
    orderFor: (pageKey: string, item: CollectionViewSectionItem, initial?: OrderDraft) => OrderBinding | undefined;
    sendState: OrderSendState;
    sessionOrders: SessionOrdersState;
    booking: BookingBinding | undefined;
}) {
    const rating = rateOf(page);
    if (rating !== undefined) {
        return props.rate ? (
            // Segnaposto alto quanto la modale: il foglio entra già alla sua altezza.
            <Suspense fallback={<div style={{ height: page.growFrom }} />}>
                <VoteForm
                    review={props.rate.props}
                    initialRating={rating}
                    logoUrl={props.rate.logoUrl}
                    venueName={props.rate.venueName}
                    onSubmitted={props.rate.onSubmitted}
                />
            </Suspense>
        ) : null;
    }
    switch (page.key) {
        case "order":
            return (
                <OrderPage
                    ordering={props.ordering}
                    findProduct={props.product.findProduct}
                    canEdit={props.product.order != null}
                    sendState={sendState}
                    sessionOrders={sessionOrders}
                />
            );
        case "more":
            return <MorePage {...props} bookingInSheet={booking != null} />;
        case "info":
            return <InfoPage {...props} />;
        case "hours":
            return <HoursPage openingHours={props.openingHours} upcomingClosures={props.upcomingClosures} />;
        case "language":
            return <LanguagePage />;
        case "categories":
            return <CategoriesPage {...props.categories} filterCount={props.activeFilterCount} />;
        case "filters":
            return <FiltersPage {...props.search} groups={props.menuInfo.groups} />;
        case "allergens":
            return <AllergensPage {...props.menuInfo} />;
        case "characteristics":
            return <CharacteristicsPage {...props.menuInfo} />;
        case "featured":
            return <FeaturedPage featured={props.featured} onOpen={pushFeaturedDetail} />;
        default: {
            const sentId = orderSentIdOf(page.key);
            if (sentId) {
                const receipt = sendState.receipts[sentId];
                return receipt ? <OrderSentPage receipt={receipt} sessionOrders={sessionOrders} /> : null;
            }
            if (editTargetKey(page)) {
                const edit = editTargetOf(page, props);
                return edit ? (
                    <ProductPage
                        item={edit.item}
                        {...props.product}
                        order={orderFor(page.key, edit.item, edit.line ? draftFromLine(edit.item, edit.line) : undefined)}
                    />
                ) : (
                    <ProductUnavailable />
                );
            }
            const story = storyRefOf(page);
            if (story && props.product.slug) {
                return (
                    <Suspense fallback={null}>
                        <StoryPage
                            slug={props.product.slug}
                            story={story}
                            findProduct={props.product.findProduct}
                            onTrackOpen={props.product.onTrackOpen}
                            fromProductId={() => {
                                const below = pageBelow(page.key);
                                return below ? productIdOf(below) : null;
                            }}
                        />
                    </Suspense>
                );
            }
            const productId = productIdOf(page);
            if (productId) {
                const item = props.product.findProduct(productId);
                return item ? <ProductPage item={item} {...props.product} order={orderFor(page.key, item)} /> : <ProductUnavailable />;
            }
            const block = featuredOf(page, props.featured.contents);
            return block ? <FeaturedContentDetail block={block} /> : null;
        }
    }
}

type RowProps = {
    icon?: ReactNode;
    label: string;
    subtitle?: string | null;
    onClick?: () => void;
    disabled?: boolean;
    chevron?: boolean;
    className?: string;
};

/** Riga toccabile del foglio: icona nel quadrato, testo su due righe, freccia se porta altrove. */
function Row({ icon, label, subtitle, onClick, disabled = false, chevron = true, className }: RowProps) {
    return (
        <button type="button" className={className ? `${styles.row} ${className}` : styles.row} onClick={onClick} disabled={disabled}>
            {icon ? (
                <span className={styles.rowIcon} aria-hidden>
                    {icon}
                </span>
            ) : null}
            <span className={styles.rowText}>
                <span className={styles.rowLabel}>{label}</span>
                {subtitle ? <span className={styles.rowSubtitle}>{subtitle}</span> : null}
            </span>
            {chevron && !disabled ? <ChevronRight size={16} strokeWidth={2} className={styles.chevron} aria-hidden /> : null}
        </button>
    );
}

/** Riga che porta fuori (telefono, mappe, sito): stessa forma di `Row`, ma è un link. */
function LinkRow({ icon, label, subtitle, href, external }: { icon: ReactNode; label: string; subtitle?: string; href: string; external: boolean }) {
    return (
        <a href={href} className={styles.row} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
            <span className={styles.rowIcon} aria-hidden>
                {icon}
            </span>
            <span className={styles.rowText}>
                <span className={`${styles.rowLabel} ${styles.rowLabelWrap}`}>{label}</span>
                {subtitle ? <span className={styles.rowSubtitle}>{subtitle}</span> : null}
            </span>
        </a>
    );
}

/** Stato del locale con il pallino (verde, ambra, grigio), in cima a Info e a Orari. */
function StatusLine({ openingHours, upcomingClosures }: Pick<SheetsSlotContext, "openingHours" | "upcomingClosures">) {
    const { t, i18n } = useTranslation("public");
    const status = useVenueStatus(openingHours, upcomingClosures);
    const label = venueStatusSheetLabel(status, t as (key: string, o?: Record<string, unknown>) => string, i18n.language);
    if (!label) return null;
    return (
        <p className={styles.status} data-kind={status.kind}>
            {label}
        </p>
    );
}

function MorePage({
    hasInfo,
    openingHours,
    upcomingClosures,
    activeFilterCount,
    hasAllergensInCatalog,
    onOpenReservation,
    shareUrl,
    shareTitle,
    menuInfo,
    story,
    bookingInSheet
}: SheetsSlotContext & { bookingInSheet: boolean }) {
    const { t, i18n } = useTranslation("public");
    // Feedback sulla riga Condividi (copia del link): due secondi, niente toast.
    const [shareFeedback, setShareFeedback] = useState<null | "copied" | "error">(null);
    const status = useVenueStatus(openingHours, upcomingClosures);
    const statusLabel = venueStatusSheetLabel(status, t as (key: string, o?: Record<string, unknown>) => string, i18n.language);

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

    // Filtri anche senza allergeni, se il menu ha piatti vegetariani, vegani o piccanti.
    const hasPreferences = useMemo(() => menuPreferences(menuInfo.groups).length > 0, [menuInfo.groups]);
    const filtersDisabled = !hasAllergensInCatalog && !hasPreferences;
    const filtersSubtitle = filtersDisabled
        ? t("allergens.filter_empty")
        : activeFilterCount > 0
          ? t("more.filters_subtitle_active", { count: activeFilterCount })
          : t("more.filters_subtitle_inactive");

    // Due gruppi come nel mockup v38: impostazioni del menu e del locale, poi le azioni.
    // Gli orari stanno dentro «Info e orari» (una riga sola, lo stato come sottotitolo).
    return (
        <div className={styles.list}>
            <div className={styles.group}>
                {availableLanguages.length > 1 ? (
                    <Row
                        icon={<Globe size={18} strokeWidth={2} />}
                        label={t("language_selector.sheet_title")}
                        subtitle={activeLanguage?.name_native ?? currentLang.toUpperCase()}
                        onClick={() => pushVenueSheet("language")}
                    />
                ) : null}
                <Row
                    icon={<ListFilter size={18} strokeWidth={2} />}
                    label={t("more.filters_label")}
                    subtitle={filtersSubtitle}
                    disabled={filtersDisabled}
                    onClick={() => pushVenueSheet("filters")}
                />
                {hasInfo || openingHours.length > 0 ? (
                    <Row
                        icon={<Info size={18} strokeWidth={2} />}
                        label={t("more.info_hours_label")}
                        subtitle={statusLabel ?? t("more.info_subtitle")}
                        onClick={() => pushVenueSheet("info")}
                    />
                ) : null}
            </div>
            <div className={styles.group}>
                {onOpenReservation ? (
                    <Row
                        icon={<CalendarDays size={18} strokeWidth={2} />}
                        label={t("more.reservation_label")}
                        subtitle={t("more.reservation_subtitle")}
                        onClick={() => {
                            // Nel foglio i passi entrano a spinta; senza, la pagina /prenota.
                            if (bookingInSheet) {
                                pushBookingSheet();
                                return;
                            }
                            closeSheet();
                            onOpenReservation();
                        }}
                    />
                ) : null}
                {/* Storia su desktop (deciso da Lorenzo il 2026-10-11): sul telefono sta nella barra in basso. */}
                {story ? (
                    <Row
                        className={styles.soloDesktop}
                        icon={story.active ? <Utensils size={18} strokeWidth={2} /> : <ScrollText size={18} strokeWidth={2} />}
                        label={story.active ? t("more.menu_label") : t("more.story_label")}
                        subtitle={story.active ? null : t("more.story_subtitle")}
                        onClick={() => {
                            closeSheet();
                            story.onToggle();
                        }}
                    />
                ) : null}
                {shareUrl ? (
                    <Row
                        icon={<Share size={18} strokeWidth={2} />}
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
            </div>
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
                        <span className={styles.flag} aria-hidden>
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

const DAY_KEYS = [
    "opening_hours.days.monday",
    "opening_hours.days.tuesday",
    "opening_hours.days.wednesday",
    "opening_hours.days.thursday",
    "opening_hours.days.friday",
    "opening_hours.days.saturday",
    "opening_hours.days.sunday"
];

/** Fasce di un giorno della settimana: «12:00–14:30 · 19:00–23:30», «Chiuso» o «—». */
function daySlots(entries: OpeningHoursEntry[], t: (key: string) => string): string {
    if (entries.length === 0) return "—";
    if (entries[0].is_closed) return t("opening_hours.closed");
    const open = entries
        .filter(e => !e.is_closed && e.opens_at && e.closes_at)
        .sort((a, b) => a.slot_index - b.slot_index)
        .map(e => `${e.opens_at!.slice(0, 5)}–${e.closes_at!.slice(0, 5)}`);
    return open.length > 0 ? open.join(" · ") : "—";
}

/** Data corta di una chiusura: «4 ago», «4 ago – 18 ago». */
function closureDates(closure: UpcomingClosure, t: (key: string) => string): string {
    const short = (iso: string) => {
        const d = new Date(`${iso}T12:00:00`);
        return `${d.getDate()} ${t(`opening_hours.months_short.${d.getMonth() + 1}`)}`;
    };
    return closure.end_date ? `${short(closure.closure_date)} – ${short(closure.end_date)}` : short(closure.closure_date);
}

/** Orari della settimana (mockup v38): stato in cima, oggi in grassetto, poi le chiusure in arrivo. */
function HoursPage({ openingHours, upcomingClosures }: Pick<SheetsSlotContext, "openingHours" | "upcomingClosures">) {
    const { t } = useTranslation("public");
    const today = romeWeekday(new Date());
    const closures = visibleClosures(upcomingClosures ?? [], todayIsoDate());
    return (
        <div>
            <StatusLine openingHours={openingHours} upcomingClosures={upcomingClosures} />
            <dl className={styles.hours}>
                {DAY_KEYS.map((key, dow) => (
                    <div key={key} className={styles.hoursRow} data-today={dow === today || undefined}>
                        <dt>{dow === today ? `${t(key)} · ${t("opening_hours.today")}` : t(key)}</dt>
                        <dd>{daySlots(openingHours.filter(e => e.day_of_week === dow), t)}</dd>
                    </div>
                ))}
            </dl>
            {closures.length > 0 ? (
                <>
                    <h3 className={styles.sectionLabel}>{t("opening_hours.closures_title")}</h3>
                    <dl className={styles.hours}>
                        {closures.map(closure => (
                            <div key={closure.closure_date} className={styles.hoursRow}>
                                <dt>{closure.label ? `${closureDates(closure, t)} · ${closure.label}` : closureDates(closure, t)}</dt>
                                <dd>
                                    {closure.is_closed
                                        ? t("opening_hours.closures_status_closed")
                                        : (closure.slots ?? []).map(slot => `${slot.opens_at.slice(0, 5)}–${slot.closes_at.slice(0, 5)}`).join(" · ")}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </>
            ) : null}
        </div>
    );
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
    const todayRanges = todayOpeningRanges(new Date(), openingHours, upcomingClosures);
    const website = links?.website_public && links.website ? safeHttpHref(links.website) : undefined;
    const facebook = links?.facebook_public && links.facebook ? safeHttpHref(links.facebook) : undefined;
    const contacts = [
        address
            ? {
                  key: "map",
                  href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
                  icon: <MapPin size={18} strokeWidth={2} />,
                  label: address,
                  subtitle: t("info.open_maps"),
                  external: true
              }
            : null,
        links?.phone_public && links.phone
            ? { key: "phone", href: `tel:${links.phone}`, icon: <Phone size={18} strokeWidth={2} />, label: links.phone, subtitle: t("info.call"), external: false }
            : null,
        website
            ? {
                  key: "web",
                  href: website,
                  icon: <Globe size={18} strokeWidth={2} />,
                  label: links!.website!.replace(/^https?:\/\//, "").replace(/\/$/, ""),
                  subtitle: t("info.website"),
                  external: true
              }
            : null,
        links?.email_public_visible && links.email_public
            ? {
                  key: "email",
                  href: `mailto:${links.email_public}`,
                  icon: <Mail size={18} strokeWidth={2} />,
                  label: links.email_public,
                  subtitle: t("info.email"),
                  external: false
              }
            : null,
        links?.instagram_public && links.instagram
            ? {
                  key: "ig",
                  href: `https://instagram.com/${links.instagram}`,
                  icon: <Instagram size={18} strokeWidth={2} />,
                  label: `@${links.instagram}`,
                  subtitle: "Instagram",
                  external: true
              }
            : null,
        facebook ? { key: "fb", href: facebook, icon: <Facebook size={18} strokeWidth={2} />, label: "Facebook", subtitle: undefined, external: true } : null,
        links?.whatsapp_public && links.whatsapp
            ? {
                  key: "wa",
                  href: `https://wa.me/${links.whatsapp.replace(/\D/g, "")}`,
                  icon: <MessageCircle size={18} strokeWidth={2} />,
                  label: "WhatsApp",
                  subtitle: undefined,
                  external: true
              }
            : null
    ].filter(contact => contact !== null);

    // Mockup v38: stato in cima, poi un riquadro con orari, indirizzo e contatti; sotto, le sezioni.
    return (
        <div>
            <StatusLine openingHours={openingHours} upcomingClosures={upcomingClosures} />
            {openingHours.length > 0 || contacts.length > 0 ? (
                <div className={styles.group}>
                    {openingHours.length > 0 ? (
                        <Row
                            icon={<Clock size={18} strokeWidth={2} />}
                            label={t("opening_hours.week_title")}
                            subtitle={
                                todayRanges === null
                                    ? null
                                    : todayRanges.length > 0
                                      ? t("info.hours_today", { hours: todayRanges.join(" · ") })
                                      : t("info.hours_today_closed")
                            }
                            onClick={() => pushVenueSheet("hours")}
                        />
                    ) : null}
                    {contacts.map(({ key, ...contact }) => (
                        <LinkRow key={key} {...contact} />
                    ))}
                </div>
            ) : null}

            {activityServices.length > 0 ? (
                <section>
                    <h3 className={styles.sectionLabel}>{t("info.services")}</h3>
                    <ul className={`${styles.group} ${styles.plainList}`}>
                        {activityServices.map(service => (
                            <li key={service} className={styles.row}>
                                <span className={styles.rowLabel}>{service}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {paymentMethods.length > 0 ? (
                <section>
                    <h3 className={styles.sectionLabel}>{t("info.payment_methods")}</h3>
                    <ul className={styles.tags}>
                        {paymentMethods.map(method => (
                            <li key={method} className={styles.tag}>
                                {method}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {fees.length > 0 ? (
                <section>
                    <h3 className={styles.sectionLabel}>{t("info.fees")}</h3>
                    <PublicFeeRows fees={fees} surface="surface" />
                </section>
            ) : null}
        </div>
    );
}

/**
 * Foglio «Categorie» (spec §4, D36). Il tocco chiude il foglio e scorre alla
 * sezione come le pill, al frame dopo: il blocco della pagina si toglie nel
 * commit della chiusura.
 */
function CategoriesPage({
    groups,
    menuName,
    activeSectionId,
    onSelectSection,
    onSelectSubSection,
    filterCount
}: SheetsSlotContext["categories"] & { filterCount: number }) {
    const { t } = useTranslation("public");
    const totals = categoryTotals(groups);
    // «Menu pranzo · 5 categorie · 42 piatti · con 1 filtro», come nel mockup v38.
    const summary = [
        menuName,
        t("categories.summary_categories", { count: totals.categories }),
        t("categories.summary_dishes", { count: totals.dishes }),
        filterCount > 0 ? t("categories.summary_filters", { count: filterCount }) : null
    ]
        .filter(Boolean)
        .join(" · ");
    return (
        <nav aria-label={t("categories.sheet_title")}>
            <p className={styles.summary}>{summary}</p>
            <CategoryList
                groups={groups}
                activeSectionId={activeSectionId}
                onSelect={(id, depth) => {
                    closeSheet();
                    requestAnimationFrame(() => (depth === 0 ? onSelectSection(id) : onSelectSubSection(id)));
                }}
            />
        </nav>
    );
}
