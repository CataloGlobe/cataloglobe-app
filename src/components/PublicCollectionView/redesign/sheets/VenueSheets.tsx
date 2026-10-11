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
import type { V2FeaturedContent } from "@/types/resolvedCollections";
import type { CollectionViewSectionItem } from "@components/PublicCollectionView/CollectionView/CollectionView";
import EventsView from "@components/PublicCollectionView/EventsView/EventsView";
import { FeaturedContentDetail, FeaturedCtaFooter } from "@components/PublicCollectionView/FeaturedBlock/FeaturedContentDetail";
import { hasFeaturedCta } from "@components/PublicCollectionView/FeaturedBlock/featuredCta";
import type { SheetsSlotContext } from "../slots";
import { useVenueStatus } from "../venue/useVenueStatus";
import { venueStatusLabel } from "../venue/venueLabel";
import SheetHost from "./SheetHost";
import { closeSheet, getSheetState, popSheetPage, useSheetState, type SheetPage } from "./sheetStack";
import { FEATURED_DETAIL_PREFIX, pushFeaturedDetail, pushVenueSheet } from "./venueSheetPages";
import CategoryList from "../categories/CategoryList";
import SearchHeader from "../search/SearchHeader";
import ProductPage, { ProductUnavailable } from "../product/ProductPage";
import { productIdOf } from "../product/productSheet";
import { ProductOrderFooter, type OrderBinding } from "../order/OrderChoices";
import { draftFromLine, draftToLine, type OrderDraft } from "../order/orderDraft";
import { showAdded } from "../order/addedNoticeStore";
import { useOrderDrafts } from "../order/useOrderDrafts";
import OrderPage, { OrderFooter } from "../order/OrderPage";
import { editTargetKey } from "../order/orderSheet";
import { useOrderSend, type OrderSendState } from "../order/useOrderSend";
import SearchPage from "../search/SearchPage";
import { FiltersFooter, FiltersPage } from "../search/FiltersPage";
import { AllergensFooter, AllergensPage, CharacteristicsPage } from "./MenuInfoPages";
import styles from "./VenueSheets.module.scss";

/**
 * Il foglio unico del locale nel redesign: ⋯ (Altre opzioni), Informazioni,
 * Orari e Lingua sono pagine della stessa pila, a spinta, al posto dei due `PublicSheet`
 * di oggi (niente più chiudi-e-riapri dopo 300 ms). Montato una volta da
 * `CollectionView` tramite `sheetsSlot`.
 */
export default function VenueSheets(props: SheetsSlotContext) {
    // Il testo della ricerca vive qui: testata (campo) e pagina (risultati) lo
    // condividono, e sopravvive al giro nei Filtri. Si svuota quando «Cerca» rientra
    // nella pila, non quando esce: durante la discesa il foglio tiene i risultati.
    const [query, setQuery] = useState("");
    const searchInStack = useSheetState().pages.some(page => page.key === "search");
    const [searchWasInStack, setSearchWasInStack] = useState(searchInStack);
    const orderFor = useOrderDrafts(props.product.order);
    const sendState = useOrderSend(props.ordering);
    if (searchInStack !== searchWasInStack) {
        setSearchWasInStack(searchInStack);
        if (searchInStack) setQuery("");
    }

    return (
        <SheetHost
            backgroundRef={props.pageRef}
            renderPage={page =>
                page.key === "search" ? (
                    <SearchPage query={query} onQueryChange={setQuery} search={props.search} categories={props.categories} />
                ) : (
                    <VenuePage page={page} {...props} orderFor={orderFor} sendState={sendState} />
                )
            }
            renderHeader={page => (page.key === "search" ? <SearchHeader query={query} onQueryChange={setQuery} /> : null)}
            renderFooter={page => {
                if (page.key === "filters") return <FiltersFooter {...props.search} />;
                if (page.key === "allergens") return <AllergensFooter hasAllergensInCatalog={props.hasAllergensInCatalog} />;
                if (page.key === "order") {
                    return <OrderFooter ordering={props.ordering} findProduct={props.product.findProduct} sendState={sendState} />;
                }
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
                return block && hasFeaturedCta(block) ? <FeaturedCtaFooter block={block} /> : null;
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

function VenuePage({
    page,
    orderFor,
    sendState,
    ...props
}: SheetsSlotContext & {
    page: SheetPage;
    orderFor: (pageKey: string, item: CollectionViewSectionItem, initial?: OrderDraft) => OrderBinding | undefined;
    sendState: OrderSendState;
}) {
    switch (page.key) {
        case "order":
            return (
                <OrderPage
                    ordering={props.ordering}
                    findProduct={props.product.findProduct}
                    canEdit={props.product.order != null}
                    sendState={sendState}
                />
            );
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
        case "categories":
            return <CategoriesPage {...props.categories} />;
        case "filters":
            return <FiltersPage {...props.search} />;
        case "allergens":
            return <AllergensPage {...props.menuInfo} />;
        case "characteristics":
            return <CharacteristicsPage {...props.menuInfo} />;
        case "featured":
            return (
                <EventsView
                    featuredContents={props.featured.contents}
                    layout={props.featured.layout}
                    showSubtitle={props.featured.showSubtitle}
                    showTitle={props.featured.showTitle}
                    showCta={props.featured.showCta}
                    selectedFeatured={null}
                    onSelectFeatured={block => block && pushFeaturedDetail(block)}
                />
            );
        default: {
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
                onClick={() => pushVenueSheet("filters")}
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

/**
 * Foglio «Categorie» (spec §4, D36). Il tocco chiude il foglio e scorre alla
 * sezione come le pill, al frame dopo: il blocco della pagina si toglie nel
 * commit della chiusura.
 */
function CategoriesPage({ groups, activeSectionId, onSelectSection, onSelectSubSection }: SheetsSlotContext["categories"]) {
    const { t } = useTranslation("public");
    return (
        <nav aria-label={t("categories.sheet_title")}>
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
