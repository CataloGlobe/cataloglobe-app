import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Minus, Plus } from "lucide-react";
import type { CollectionViewSectionItem } from "@/components/PublicCollectionView/CollectionView/CollectionView";
import { formatPublicPrice, formatSurcharge } from "../price";
import { groupRule, VISIBLE_ROWS } from "../product/productSheet";
import {
    choiceGroupId,
    draftTotal,
    ITEM_NOTE_MAX,
    missingChoice,
    QTY_MAX,
    QTY_MIN,
    setNote,
    setQty,
    toggleAddon,
    type OrderDraft
} from "./orderDraft";
import styles from "./OrderChoices.module.scss";

type OptionGroup = NonNullable<CollectionViewSectionItem["optionGroups"]>[number];

/** Sotto un gruppo: cosa manca (count null) o quante ne sono già scelte. */
export type OrderHint = { groupId: string; count: number | null } | null;

/** La bozza di una scheda in modo ordine, tenuta dal foglio (sopravvive al giro in «Perfetto con»). */
export type OrderBinding = {
    draft: OrderDraft;
    hint: OrderHint;
    /** Senza `hint` l'indicazione sotto il gruppo si spegne. */
    setDraft: (draft: OrderDraft, hint?: OrderHint) => void;
};

/** Formati da toccare (spec §7): uno solo, prezzo a destra. */
export function OrderFormats({ item, group, order }: { item: CollectionViewSectionItem; group: OptionGroup; order: OrderBinding }) {
    return (
        <ChoiceGroup item={item} group={group} order={order} title={group.name}>
            {group.values.map(value => (
                <Choice
                    key={value.id}
                    type="radio"
                    name={choiceGroupId(item.id, group.id)}
                    checked={order.draft.formatId === value.id}
                    disabled={value.absolutePrice == null}
                    label={value.name}
                    price={value.absolutePrice != null ? formatPublicPrice(value.absolutePrice) : null}
                    onChange={() => order.setDraft({ ...order.draft, formatId: value.id })}
                />
            ))}
        </ChoiceGroup>
    );
}

/** Scelte con la regola nel titolo e la regola viva sotto quando si va oltre. */
export function OrderAddonGroup({ item, group, order }: { item: CollectionViewSectionItem; group: OptionGroup; order: OrderBinding }) {
    const single = group.maxSelectable === 1;
    const chosen = order.draft.addons[group.id] ?? [];
    return (
        <ChoiceGroup item={item} group={group} order={order} title={group.name}>
            {group.values.map(value => (
                <Choice
                    key={value.id}
                    type={single ? "radio" : "checkbox"}
                    name={choiceGroupId(item.id, group.id)}
                    checked={chosen.includes(value.id)}
                    label={value.name}
                    price={formatSurcharge(value.priceModifier)}
                    // Un radio già scelto si toglie con un secondo tocco solo se il gruppo è facoltativo.
                    onClick={single && !group.isRequired && chosen.includes(value.id)
                        ? () => order.setDraft(toggleAddon(order.draft, group, value.id).draft)
                        : undefined}
                    onChange={() => {
                        const next = toggleAddon(order.draft, group, value.id);
                        order.setDraft(next.draft, next.blocked != null ? { groupId: group.id, count: next.blocked } : null);
                    }}
                />
            ))}
        </ChoiceGroup>
    );
}

function ChoiceGroup({
    item,
    group,
    order,
    title,
    children
}: {
    item: CollectionViewSectionItem;
    group: OptionGroup;
    order: OrderBinding;
    title: string;
    children: ReactNode[];
}) {
    const { t } = useTranslation("public");
    const [open, setOpen] = useState(false);
    const rule = groupRule(group);
    const hint = order.hint?.groupId === group.id ? order.hint : null;
    const id = choiceGroupId(item.id, group.id);
    const collapsed = !open && children.length > VISIBLE_ROWS;
    return (
        <fieldset id={id} className={styles.group} data-missing={hint && hint.count == null ? "" : undefined}>
            <legend className={styles.legend}>
                {title}
                <span className={styles.rule}> · {t(rule.key, { count: rule.count })}</span>
            </legend>
            <div className={styles.choices}>{collapsed ? children.slice(0, VISIBLE_ROWS) : children}</div>
            {collapsed ? (
                <button type="button" className={styles.showAll} onClick={() => setOpen(true)}>
                    {t("product_sheet.show_all", { count: children.length })}
                </button>
            ) : null}
            <p className={styles.hint} role="status">
                {hint
                    ? hint.count == null
                        ? t("order_sheet.missing_hint")
                        : t("order_sheet.too_many", { count: hint.count })
                    : null}
            </p>
        </fieldset>
    );
}

function Choice({
    type,
    name,
    checked,
    disabled,
    label,
    price,
    onChange,
    onClick
}: {
    type: "radio" | "checkbox";
    name: string;
    checked: boolean;
    disabled?: boolean;
    label: string;
    price: string | null;
    onChange: () => void;
    onClick?: () => void;
}) {
    return (
        <label className={styles.choice} data-disabled={disabled ? "" : undefined}>
            <input
                className={styles.input}
                type={type}
                name={name}
                checked={checked}
                disabled={disabled}
                onChange={onChange}
                onClick={onClick}
            />
            <span className={styles.mark} data-type={type} aria-hidden="true" />
            <span className={styles.label}>{label}</span>
            {price ? <span className={styles.price}>{price}</span> : null}
        </label>
    );
}

/** Quantità e nota prima di aggiungere (spec §7). La nota si apre a richiesta. */
export function OrderQtyNote({ itemId, order }: { itemId: string; order: OrderBinding }) {
    const { t } = useTranslation("public");
    const { draft } = order;
    const [noteOpen, setNoteOpen] = useState(draft.note !== "");
    const noteId = `on-${itemId}`;
    return (
        <div className={styles.extra}>
            <div className={styles.qtyRow}>
                <span id={`oq-${itemId}`} className={styles.legend}>
                    {t("order_sheet.quantity")}
                </span>
                <div className={styles.stepper} role="group" aria-labelledby={`oq-${itemId}`}>
                    {/* aria-disabled, non disabled: al limite il fuoco resta sul pulsante. */}
                    <button
                        type="button"
                        className={styles.step}
                        aria-label={t("selection.decrease_aria")}
                        aria-disabled={draft.qty <= QTY_MIN}
                        onClick={() => draft.qty > QTY_MIN && order.setDraft(setQty(draft, draft.qty - 1))}
                    >
                        <Minus size={18} aria-hidden="true" />
                    </button>
                    <output className={styles.qty} aria-live="polite">
                        {draft.qty}
                    </output>
                    <button
                        type="button"
                        className={styles.step}
                        aria-label={t("selection.increase_aria")}
                        aria-disabled={draft.qty >= QTY_MAX}
                        onClick={() => draft.qty < QTY_MAX && order.setDraft(setQty(draft, draft.qty + 1))}
                    >
                        <Plus size={18} aria-hidden="true" />
                    </button>
                </div>
            </div>
            {noteOpen ? (
                <div className={styles.note}>
                    <label htmlFor={noteId} className={styles.legend}>
                        {t("order_sheet.note_label")}
                    </label>
                    <textarea
                        id={noteId}
                        className={styles.textarea}
                        rows={2}
                        maxLength={ITEM_NOTE_MAX}
                        placeholder={t("order_sheet.note_placeholder")}
                        value={draft.note}
                        onChange={event => order.setDraft(setNote(draft, event.target.value))}
                    />
                    <span className={styles.counter} aria-hidden="true">
                        {draft.note.length} / {ITEM_NOTE_MAX}
                    </span>
                </div>
            ) : (
                <button type="button" className={styles.showAll} onClick={() => setNoteOpen(true)}>
                    {t("order_sheet.add_note")}
                </button>
            )}
        </div>
    );
}

/**
 * Pulsante della scheda in modo ordine: dice cosa manca e ci porta, poi
 * «Aggiungi · 24,00 €» (spec §6-§7).
 */
export function ProductOrderFooter({
    item,
    order,
    onAdd
}: {
    item: CollectionViewSectionItem;
    order: OrderBinding;
    onAdd: () => void;
}) {
    const { t } = useTranslation("public");
    const missing = missingChoice(item, order.draft);
    const total = draftTotal(item, order.draft);
    const label = missing
        ? missing.isFormat
            ? t("order_sheet.choose_format")
            : t("order_sheet.choose_group", { name: missing.name })
        : total != null
          ? t("order_sheet.add", { price: formatPublicPrice(total) })
          : t("item_detail.price_unavailable");
    return (
        <div className={styles.footer}>
            <button
                type="button"
                className={styles.add}
                data-missing={missing ? "" : undefined}
                disabled={!missing && total == null}
                onClick={() => {
                    if (!missing) {
                        onAdd();
                        return;
                    }
                    order.setDraft(order.draft, { groupId: missing.groupId, count: null });
                    const target = document.getElementById(choiceGroupId(item.id, missing.groupId));
                    target?.scrollIntoView({ block: "center", behavior: "smooth" });
                    target?.querySelector<HTMLInputElement>("input:not(:disabled)")?.focus({ preventScroll: true });
                }}
            >
                {label}
            </button>
        </div>
    );
}
