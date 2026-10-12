import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, ScrollText } from "lucide-react";
import AllergenIcon from "@/components/ui/AllergenIcon/AllergenIcon";
import CharacteristicIcon from "@/components/ui/CharacteristicIcon/CharacteristicIcon";
import { FramedMedia } from "@components/ui/FramedMedia";
import { PRODUCT_IMAGE_DEFAULT_FRAMING } from "@pages/Dashboard/Products/components/productImageFraming";
import type { CollectionViewSectionItem } from "@/components/PublicCollectionView/CollectionView/CollectionView";
import type { SheetsSlotContext } from "../slots";
import { loadStoryPage, pushStorySheet } from "../story/storySheet";
import { formatPublicPrice, formatSurcharge, rowPrice } from "../price";
import ProductRow from "./ProductRow";
import rowStyles from "./ProductRow.module.scss";
import { groupRule, pushProductSheet, VISIBLE_ROWS } from "./productSheet";
import { OrderAddonGroup, OrderFormats, OrderQtyNote, type OrderBinding } from "../order/OrderChoices";
import styles from "./ProductPage.module.scss";

type OptionGroup = NonNullable<CollectionViewSectionItem["optionGroups"]>[number];

type Props = Omit<SheetsSlotContext["product"], "order"> & {
    item: CollectionViewSectionItem;
    /** Col QR del tavolo: formati e scelte si toccano, poi quantità e nota (spec §7). */
    order?: OrderBinding;
};

/**
 * Scheda prodotto nel foglio unico (spec §6, mockup v38). Nome e prezzo stanno
 * in testata (`ProductHeadPrice`); qui: descrizione, formati, scelte con la
 * regola nel titolo, Dettagli, Ingredienti in testo, Caratteristiche e
 * Allergeni con la riga fissa, Perfetto con a spinta, La storia a spinta col
 * lettore nel foglio. In modo ordine il pulsante sta in fondo al foglio.
 */
export default function ProductPage({ item, findProduct, showImage, slug, onTrackOpen, order }: Props) {
    const { t } = useTranslation("public");
    const formats = item.optionGroups?.find(group => group.group_kind === "PRIMARY_PRICE");
    const addons = item.optionGroups?.filter(group => group.group_kind !== "PRIMARY_PRICE" && group.values.length > 0) ?? [];
    const details = [...(item.notes ?? []), ...(item.attributes ?? [])];
    const hasStory = Boolean(item.story_ref && slug);
    // Il lettore arriva prima del tocco su «La storia»: la spinta non entra su una pagina vuota.
    useEffect(() => {
        if (hasStory) void loadStoryPage();
    }, [hasStory]);
    const characteristics = (item.characteristics ?? []).map(c => ({
        key: c.id,
        icon: <CharacteristicIcon icon={c.icon} size={16} variant="bare" />,
        label: c.label
    }));
    const allergens = (item.allergens ?? []).map(a => ({ key: a.id, icon: <AllergenIcon code={a.code} size={16} variant="bare" />, label: a.label }));

    return (
        <article className={styles.root}>
            {showImage && item.image ? (
                <div className={styles.image}>
                    <FramedMedia
                        source={item.image}
                        framing={item.image_framing ?? PRODUCT_IMAGE_DEFAULT_FRAMING}
                        aspectRatio={item.image_aspect_ratio ?? null}
                        frameRatio={4 / 3}
                        alt=""
                        eager
                    />
                </div>
            ) : null}

            {item.description ? <p className={styles.description}>{item.description}</p> : null}

            {formats ? order ? <OrderFormats item={item} group={formats} order={order} /> : <Formats group={formats} /> : null}
            {addons.map(group =>
                order ? (
                    <OrderAddonGroup key={group.id} item={item} group={group} order={order} />
                ) : (
                    <AddonGroup key={group.id} group={group} />
                )
            )}
            {order ? <OrderQtyNote itemId={item.id} order={order} /> : null}

            {details.length > 0 ? (
                <Block title={t("product_sheet.details")}>
                    <dl className={styles.box} data-details="">
                        {details.map((row, i) => (
                            <div key={`${row.label}-${i}`} className={styles.detailRow}>
                                <dt>{row.label}</dt>
                                <dd>{row.value}</dd>
                            </div>
                        ))}
                    </dl>
                </Block>
            ) : null}

            {item.ingredients && item.ingredients.length > 0 ? (
                // In testo con le virgole, come il mockup v38 (D70). Il grassetto degli
                // allergeni aspetta il dato per ingrediente: oggi stanno sul piatto.
                <Block title={t("product.ingredients")}>
                    <p className={styles.ingredients}>{item.ingredients.map(ingredient => ingredient.name).join(", ")}</p>
                </Block>
            ) : null}

            {/* Caratteristiche se ci sono; Allergeni sempre, con la riga di sicurezza (spec §6, v25). */}
            <div className={styles.meta}>
                {characteristics.length > 0 ? (
                    <div>
                        <Chips label={t("product_sheet.characteristics")} chips={characteristics} />
                    </div>
                ) : null}
                <div>
                    {allergens.length > 0 ? (
                        <Chips label={t("product_sheet.allergens")} chips={allergens} />
                    ) : (
                        <>
                            <h3 className={styles.metaLabel}>{t("product_sheet.allergens")}</h3>
                            <p className={styles.none}>{t("product_sheet.no_allergens")}</p>
                        </>
                    )}
                    <p className={styles.note}>{t("product_sheet.allergy_note")}</p>
                </div>
            </div>

            {item.pairings && item.pairings.length > 0 ? (
                <Block title={t("product.pairing_prefix")}>
                    <ul className={rowStyles.box}>
                        {item.pairings.map(pairing => {
                            const target = findProduct(pairing.id);
                            return (
                                <li key={pairing.id}>
                                    <ProductRow
                                        image={pairing.imageUrl}
                                        name={pairing.name}
                                        note={pairing.note}
                                        price={rowPrice(target, pairing.price, t)}
                                        onClick={
                                            target
                                                ? () => {
                                                      pushProductSheet(target);
                                                      onTrackOpen(target);
                                                  }
                                                : undefined
                                        }
                                    />
                                </li>
                            );
                        })}
                    </ul>
                </Block>
            ) : null}

            {item.story_ref && hasStory ? (
                // Card quieta senza titolo di sezione: «La storia» sta sopra il titolo (mockup v38).
                <button type="button" className={styles.story} onClick={() => pushStorySheet(item.story_ref!)}>
                    {item.story_ref.cover ? (
                        <img className={styles.storyCover} src={item.story_ref.cover} alt="" width={56} height={56} loading="lazy" decoding="async" />
                    ) : (
                        <span className={styles.storyCover} aria-hidden="true">
                            <ScrollText size={20} />
                        </span>
                    )}
                    <span className={styles.storyText}>
                        <span className={styles.eyebrow}>{t("product_sheet.story")}</span>
                        <span className={styles.storyTitle}>{item.story_ref.title}</span>
                    </span>
                    <ChevronRight size={16} aria-hidden="true" className={styles.muted} />
                </button>
            ) : null}
        </article>
    );
}

/**
 * Il prezzo sotto il nome, in testata (mockup v38 .mx-hs). Coi formati niente:
 * i prezzi stanno nel riquadro «Formato» del corpo.
 */
export function ProductHeadPrice({ item }: { item: CollectionViewSectionItem }) {
    const { t } = useTranslation("public");
    if (item.optionGroups?.some(group => group.group_kind === "PRIMARY_PRICE")) return null;
    if (item.from_price != null) {
        return <p className={styles.priceLine}>{t("product.price_from", { price: formatPublicPrice(item.from_price) })}</p>;
    }
    const value = item.effective_price ?? item.price;
    if (value == null) return null;
    const original = item.original_price != null && item.original_price > value ? item.original_price : null;
    return (
        <p className={styles.priceLine}>
            {original != null ? <s className={styles.original}>{formatPublicPrice(original)}</s> : null}
            {formatPublicPrice(value)}
        </p>
    );
}

/** Formati al posto del prezzo: riquadro col nome del gruppo, una riga per formato, prezzo a destra. */
function Formats({ group }: { group: OptionGroup }) {
    return (
        <Block title={group.name}>
            <ul className={styles.box}>
                {group.values.map(value => (
                    <li key={value.id} className={styles.optionRow}>
                    <span>{value.name}</span>
                    {value.absolutePrice != null ? (
                        <span className={styles.price}>
                            {value.originalPrice != null && value.originalPrice > value.absolutePrice ? (
                                <s className={styles.original}>{formatPublicPrice(value.originalPrice)}</s>
                            ) : null}
                            {formatPublicPrice(value.absolutePrice)}
                        </span>
                    ) : null}
                    </li>
                ))}
            </ul>
        </Block>
    );
}

function AddonGroup({ group }: { group: OptionGroup }) {
    const { t } = useTranslation("public");
    const rule = groupRule(group);
    return (
        <Block title={group.name} rule={t(rule.key, { count: rule.count })}>
            <Expandable
                rows={group.values.map(value => {
                    const surcharge = formatSurcharge(value.priceModifier);
                    return (
                        <li key={value.id} className={styles.optionRow}>
                            <span>{value.name}</span>
                            {surcharge ? <span className={styles.surcharge}>{surcharge}</span> : null}
                        </li>
                    );
                })}
            />
        </Block>
    );
}

function Block({ title, rule, children }: { title: string; rule?: string; children: ReactNode }) {
    return (
        <section className={styles.block}>
            <h3 className={styles.blockTitle}>
                {title}
                {rule ? <span className={styles.rule}> · {rule}</span> : null}
            </h3>
            {children}
        </section>
    );
}

/** Le prime cinque voci, poi «Mostra tutti (N)» sul posto (spec §6). */
function Expandable({ rows }: { rows: ReactNode[] }) {
    const { t } = useTranslation("public");
    const [open, setOpen] = useState(false);
    const listRef = useRef<HTMLUListElement>(null);
    const collapsed = !open && rows.length > VISIBLE_ROWS;
    // Il pulsante sparisce col fuoco sopra: il fuoco passa alla prima voce comparsa.
    useLayoutEffect(() => {
        if (!open) return;
        const first = listRef.current?.children[VISIBLE_ROWS];
        if (first instanceof HTMLElement) {
            first.tabIndex = -1;
            first.focus({ preventScroll: true });
        }
    }, [open]);
    return (
        <>
            <ul ref={listRef} className={styles.box}>
                {collapsed ? rows.slice(0, VISIBLE_ROWS) : rows}
            </ul>
            {collapsed ? (
                <button type="button" className={styles.showAll} onClick={() => setOpen(true)}>
                    {t("product_sheet.show_all", { count: rows.length })}
                    <ChevronDown size={16} aria-hidden="true" />
                </button>
            ) : null}
        </>
    );
}

/** Etichetta in maiuscoletto e chip con l'icona (Caratteristiche, Allergeni). */
function Chips({ label, chips }: { label: string; chips: { key: string | number; icon: ReactNode; label: string }[] }) {
    return (
        <>
            <h3 className={styles.metaLabel}>{label}</h3>
            <ul className={styles.chips}>
                {chips.map(chip => (
                    <li key={chip.key} className={styles.chip}>
                        {chip.icon}
                        {chip.label}
                    </li>
                ))}
            </ul>
        </>
    );
}

/** Il menu è cambiato a scheda aperta (regola, lingua): il piatto non c'è più. */
export function ProductUnavailable() {
    const { t } = useTranslation("public");
    return <p className={styles.muted}>{t("product_sheet.unavailable")}</p>;
}
