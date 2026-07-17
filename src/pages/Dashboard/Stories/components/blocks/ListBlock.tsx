import { List, ListChecks, Plus, X } from "lucide-react";
import { TextInput } from "@/components/ui/Input/TextInput";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import type { StoryListBlock, StoryListVariant } from "@/services/supabase/stories";
import styles from "./ListBlock.module.scss";

interface ListBlockProps {
    block: StoryListBlock;
    onChange: (next: StoryListBlock) => void;
    disabled?: boolean;
}

const VARIANT_OPTIONS = [
    { value: "bullet" as const, label: "Puntato", icon: <List size={15} /> },
    { value: "check" as const, label: "Checklist", icon: <ListChecks size={15} /> }
];

/**
 * Editor blocco Elenco — plain text. La variante (puntato | checklist) è sola
 * resa: qui si sceglie solo il flag, lo stile del marcatore è del render pubblico.
 * Le voci vuote non vengono salvate (filtrate in `saveStory`).
 */
export function ListBlock({ block, onChange, disabled }: ListBlockProps) {
    // Almeno una riga sempre presente su cui scrivere (le vuote sono filtrate al save).
    const items = block.items.length > 0 ? block.items : [""];

    const setVariant = (variant: StoryListVariant) => onChange({ ...block, variant });
    const setItem = (index: number, value: string) =>
        onChange({ ...block, items: items.map((it, i) => (i === index ? value : it)) });
    const addItem = () => onChange({ ...block, items: [...items, ""] });
    const removeItem = (index: number) =>
        onChange({ ...block, items: items.filter((_, i) => i !== index) });

    return (
        <div className={styles.root}>
            <SegmentedControl<StoryListVariant>
                value={block.variant}
                onChange={setVariant}
                options={VARIANT_OPTIONS}
                size="sm"
            />

            <div className={styles.items}>
                {items.map((item, index) => (
                    <div key={index} className={styles.row}>
                        <TextInput
                            value={item}
                            onChange={e => setItem(index, e.target.value)}
                            placeholder={`Voce ${index + 1}`}
                            disabled={disabled}
                        />
                        {!disabled && items.length > 1 && (
                            <button
                                type="button"
                                aria-label={`Rimuovi voce ${index + 1}`}
                                className={styles.removeItem}
                                onClick={() => removeItem(index)}
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {!disabled && (
                <button type="button" className={styles.addItem} onClick={addItem}>
                    <Plus size={15} />
                    Aggiungi voce
                </button>
            )}
        </div>
    );
}
