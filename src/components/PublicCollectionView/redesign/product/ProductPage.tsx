import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, ScrollText } from "lucide-react";
import AllergenIcon from "@/components/ui/AllergenIcon/AllergenIcon";
import CharacteristicIcon from "@/components/ui/CharacteristicIcon/CharacteristicIcon";
import { FramedMedia } from "@components/ui/FramedMedia";
import { PRODUCT_IMAGE_DEFAULT_FRAMING } from "@pages/Dashboard/Products/components/productImageFraming";
import type { CollectionViewSectionItem } from "@/components/PublicCollectionView/CollectionView/CollectionView";
import type { SheetsSlotContext } from "../slots";
import { closeSheet } from "../sheets/sheetStack";
import { formatPublicPrice, formatSurcharge } from "../price";
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
 * Scheda prodotto nel foglio unico (spec §6), in lettura: nome su due righe,
 * prezzo o formati, descrizione; scelte con la regola nel titolo; Dettagli;
 * Ingredienti; Caratteristiche e allergeni con la riga fissa; Perfetto con a
 * spinta; La storia. In modo ordine il pulsante sta in fondo al foglio.
 */
export default function ProductPage({ item, findProduct, showImage, onOpenStory, onTrackOpen, order }: Props) {
    const { t } = useTranslation("public");
    const formats = item.optionGroups?.find(group => group.group_kind === "PRIMARY_PRICE");
    const addons = item.optionGroups?.filter(group => group.group_kind !== "PRIMARY_PRICE" && group.values.length > 0) ?? [];
    const details = [...(item.notes ?? []), ...(item.attributes ?? [])];
    const traits = [
        ...(item.characteristics ?? []).map(c => ({ key: `c-${c.id}`, icon: <CharacteristicIcon icon={c.icon} size={16} variant="bare" />, label: c.label })),
        ...(item.allergens ?? []).map(a => ({ key: `a-${a.id}`, icon: <AllergenIcon code={a.code} size={16} variant="bare" />, label: a.label }))
    ];

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

            <header className={styles.head}>
                {/* Il titolo accessibile è in testata (h2 invisibile): qui solo a vista. */}
                <p className={styles.name} aria-hidden="true">
                    {item.name}
                </p>
                {formats ? null : <PriceLine item={item} />}
                {formats && !order ? <Formats group={formats} /> : null}
                {item.description ? <p className={styles.description}>{item.description}</p> : null}
            </header>

            {formats && order ? <OrderFormats item={item} group={formats} order={order} /> : null}
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
                    <dl className={styles.details}>
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
                <Block title={t("product.ingredients")}>
                    <Expandable
                        rows={item.ingredients.map(ingredient => (
                            <li key={ingredient.id} className={styles.line}>
                                {ingredient.name}
                            </li>
                        ))}
                    />
                </Block>
            ) : null}

            {traits.length > 0 ? (
                <Block title={t("product_sheet.traits")}>
                    <ul className={styles.traits}>
                        {traits.map(trait => (
                            <li key={trait.key} className={styles.trait}>
                                {trait.icon}
                                {trait.label}
                            </li>
                        ))}
                    </ul>
                    <p className={styles.note}>{t("product_sheet.allergy_note")}</p>
                </Block>
            ) : null}

            {item.pairings && item.pairings.length > 0 ? (
                <Block title={t("product.pairing_prefix")}>
                    <ul className={styles.list}>
                        {item.pairings.map(pairing => {
                            const target = findProduct(pairing.id);
                            const content = (
                                <>
                                    {pairing.imageUrl ? (
                                        <img
                                            className={styles.thumb}
                                            src={pairing.imageUrl}
                                            alt=""
                                            width={48}
                                            height={48}
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    ) : (
                                        <span className={styles.thumb} aria-hidden="true" />
                                    )}
                                    <span className={styles.pairingText}>
                                        <span className={styles.pairingName}>{pairing.name}</span>
                                        {pairing.note ? <span className={styles.muted}>{pairing.note}</span> : null}
                                    </span>
                                    {pairing.price != null ? (
                                        <span className={styles.price}>{formatPublicPrice(pairing.price)}</span>
                                    ) : null}
                                </>
                            );
                            return (
                                <li key={pairing.id}>
                                    {target ? (
                                        <button type="button" className={styles.pairing} onClick={() => {
                                                pushProductSheet(target);
                                                onTrackOpen(target);
                                            }}
                                        >
                                            {content}
                                            <ChevronRight size={16} aria-hidden="true" className={styles.muted} />
                                        </button>
                                    ) : (
                                        <div className={styles.pairing}>{content}</div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </Block>
            ) : null}

            {item.story_ref ? (
                <Block title={t("product_sheet.story")}>
                    <button
                        type="button"
                        className={styles.story}
                        onClick={() => {
                            const storyId = item.story_ref!.id;
                            closeSheet();
                            // La tab Storia al frame dopo: il blocco della pagina si toglie nel commit della chiusura.
                            requestAnimationFrame(() => onOpenStory(storyId));
                        }}
                    >
                        {item.story_ref.cover ? (
                            <img className={styles.storyCover} src={item.story_ref.cover} alt="" width={56} height={56} loading="lazy" decoding="async" />
                        ) : (
                            <ScrollText size={20} aria-hidden="true" className={styles.muted} />
                        )}
                        <span className={styles.storyTitle}>{item.story_ref.title}</span>
                        <ChevronRight size={16} aria-hidden="true" className={styles.muted} />
                    </button>
                </Block>
            ) : null}
        </article>
    );
}

function PriceLine({ item }: { item: CollectionViewSectionItem }) {
    const { t } = useTranslation("public");
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

/** Formati al posto del prezzo: una riga per formato, prezzo a destra. */
function Formats({ group }: { group: OptionGroup }) {
    return (
        <ul className={styles.list}>
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
                            {surcharge ? <span className={styles.price}>{surcharge}</span> : null}
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
            <ul ref={listRef} className={styles.list}>{collapsed ? rows.slice(0, VISIBLE_ROWS) : rows}</ul>
            {collapsed ? (
                <button type="button" className={styles.showAll} onClick={() => setOpen(true)}>
                    {t("product_sheet.show_all", { count: rows.length })}
                </button>
            ) : null}
        </>
    );
}

/** Il menu è cambiato a scheda aperta (regola, lingua): il piatto non c'è più. */
export function ProductUnavailable() {
    const { t } = useTranslation("public");
    return <p className={styles.muted}>{t("product_sheet.unavailable")}</p>;
}
