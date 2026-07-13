import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, Check } from "lucide-react";
import PublicSheet from "../PublicSheet/PublicSheet";
import AllergenIcon from "@components/ui/AllergenIcon/AllergenIcon";
import Text from "@components/ui/Text/Text";
import type { Allergen } from "@services/supabase/allergens";
import type { ResolvedAllergen } from "@/types/resolvedCollections";
import styles from "./AllergensSheet.module.scss";

// TODO post-launch: in info mode AllergensSheet mostra il catalogo globale
// (V2SystemAllergen, label_it hardcoded). Per traduzione multilingua, estendere
// il service mapper allergens.ts a fetchare anche translations table.
// In filter mode il problema non si pone: passiamo ResolvedAllergen.label già
// localizzato dall'edge function.
type InfoProps = {
    isOpen: boolean;
    onClose: () => void;
    mode?: "info";
    allergens: Allergen[];
};

type FilterProps = {
    isOpen: boolean;
    onClose: () => void;
    mode: "filter";
    allergens: ResolvedAllergen[];
    selectedIds: number[];
    onApplyFilter: (ids: number[]) => void;
};

type Props = InfoProps | FilterProps;

export default function AllergensSheet(props: Props) {
    const { t } = useTranslation("public");
    const { isOpen, onClose } = props;
    const isFilter = props.mode === "filter";

    const [draft, setDraft] = useState<number[]>(
        isFilter ? props.selectedIds : []
    );

    useEffect(() => {
        if (!isOpen) return;
        if (props.mode === "filter") setDraft(props.selectedIds);
        // Resync solo all'apertura: la draft segue gli ids passati dal parent
        // ogni volta che il sheet viene riaperto.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const title = isFilter ? t("allergens.filter_title") : t("allergens.title");

    const toggle = (id: number) => {
        setDraft(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleApply = () => {
        if (props.mode !== "filter") return;
        props.onApplyFilter(draft);
        onClose();
    };

    return (
        <PublicSheet
            isOpen={isOpen}
            onClose={onClose}
            ariaLabel={title}
            headerContent={
                <div className={styles.header}>
                    <Text variant="body" weight={700} className={styles.headerTitle} color="var(--pub-surface-text)">
                        {title}
                    </Text>
                    <button
                        type="button"
                        className={styles.closeBtn}
                        onClick={onClose}
                        aria-label={t("allergens.close_aria")}
                    >
                        {t("allergens.close_label")}
                    </button>
                </div>
            }
            footerContent={
                isFilter && props.allergens.length > 0 ? (
                    <div className={styles.filterActions}>
                        <button
                            type="button"
                            onClick={() => setDraft([])}
                            disabled={draft.length === 0}
                            className={styles.resetBtn}
                        >
                            {t("allergens.filter_reset")}
                        </button>
                        <button
                            type="button"
                            onClick={handleApply}
                            className={styles.applyBtn}
                        >
                            {t("allergens.filter_apply")}
                            {draft.length > 0 && ` · ${draft.length}`}
                        </button>
                    </div>
                ) : undefined
            }
        >
            <div className={styles.body}>
                {isFilter && (
                    <Text variant="body-sm" className={styles.filterIntro} color="var(--pub-surface-text-muted)">
                        {t("allergens.filter_intro")}
                    </Text>
                )}

                {isFilter && props.allergens.length === 0 ? (
                    <div className={styles.filterEmpty}>
                        <Text variant="body-sm" color="var(--pub-surface-text-muted)">
                            {t("allergens.filter_empty")}
                        </Text>
                    </div>
                ) : isFilter ? (
                    <ul className={styles.list}>
                        {props.allergens.map(a => {
                            const selected = draft.includes(a.id);
                            return (
                                <li key={a.id}>
                                    <button
                                        type="button"
                                        onClick={() => toggle(a.id)}
                                        className={`${styles.filterRow} ${selected ? styles.filterRowSelected : ""}`}
                                        aria-pressed={selected}
                                    >
                                        <span className={styles.iconWrap} aria-hidden>
                                            <AllergenIcon code={a.code} size={20} variant="bare" />
                                        </span>
                                        <span className={styles.label}>
                                            {a.label}
                                        </span>
                                        <span className={styles.checkbox} aria-hidden>
                                            {selected && <Check size={12} strokeWidth={3} />}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                    <ul className={styles.list}>
                        {props.allergens.map(a => (
                            <li key={a.id} className={styles.item}>
                                <span className={styles.iconWrap} aria-hidden>
                                    <AllergenIcon code={a.code} size={20} variant="bare" />
                                </span>
                                <Text variant="body-sm" className={styles.label} color="var(--pub-surface-text)">
                                    {a.label_it}
                                </Text>
                            </li>
                        ))}
                    </ul>
                )}

                {isFilter && props.allergens.length > 0 && (
                    <div className={styles.filterDisclaimer}>
                        <AlertCircle size={14} aria-hidden />
                        <Text variant="caption-xs" color="var(--pub-surface-text-muted)">
                            {t("allergens.filter_disclaimer")}
                        </Text>
                    </div>
                )}

                {!isFilter && (
                    <Text variant="caption-xs" className={styles.disclaimer} color="var(--pub-surface-text-muted)">
                        {t("allergens.disclaimer")}
                    </Text>
                )}
            </div>
        </PublicSheet>
    );
}
