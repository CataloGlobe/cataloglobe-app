import { useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { Chip } from "@/components/ui/Chip/Chip";
import { CheckboxInput } from "@/components/ui/Input/CheckboxInput";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch/ToolbarSearch";
import Text from "@/components/ui/Text/Text";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { filterChipOptions, toggleAll, visibleChips, type ChipPickerOption } from "./chipPickerModel";
import styles from "./ChipPicker.module.scss";

export type { ChipPickerOption } from "./chipPickerModel";

/**
 * Scegliere da un elenco che può crescere (sedi, gruppi, prodotti; SD2/RG1).
 * In pagina le scelte come chip (oltre 8: le prime 8 e «+N altri») e un
 * bottone «Modifica …»; la scelta si fa in un pannello laterale con ricerca,
 * «Seleziona tutte» e caselle (per i prodotti anche miniatura e una riga con
 * prezzo e categoria). Regge 3 voci come 300. Mai una tendina per scelte
 * multiple, mai un elenco di caselle che allunga la pagina.
 *
 * `single`: variante a scelta singola (una sede, un prodotto): niente
 * «Seleziona tutte», toccare una voce la sceglie.
 *
 * Il pannello lavora su una copia: «Applica» la passa a `onChange`,
 * «Annulla» e la chiusura la scartano.
 */
export interface ChipPickerProps {
    options: ChipPickerOption[];
    value: string[];
    onChange: (ids: string[]) => void;
    /** Il bottone in pagina: «Modifica sedi». */
    editLabel: string;
    /** Il titolo del pannello: «Sedi». */
    title: string;
    /** La riga in pagina quando non c'è nessuna scelta. */
    emptyText: string;
    searchPlaceholder?: string;
    single?: boolean;
    disabled?: boolean;
}

export function ChipPicker({
    options,
    value,
    onChange,
    editLabel,
    title,
    emptyText,
    searchPlaceholder = "Cerca",
    single = false,
    disabled = false
}: ChipPickerProps) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<string[]>(value);
    const [query, setQuery] = useState("");
    const { chips, rest } = visibleChips(options, value);
    const shown = filterChipOptions(options, query);

    const openPanel = () => {
        setDraft(value);
        setQuery("");
        setOpen(true);
    };
    const apply = () => {
        onChange(draft);
        setOpen(false);
    };
    const toggle = (id: string) => {
        if (single) {
            setDraft([id]);
            return;
        }
        setDraft(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
    };

    return (
        <div className={styles.field}>
            {chips.length > 0 ? (
                <div className={styles.chips}>
                    {chips.map(option => (
                        <Chip key={option.id} label={option.name} />
                    ))}
                    {rest > 0 && <Chip label={`+${rest} ${rest === 1 ? "altro" : "altri"}`} />}
                </div>
            ) : (
                <Text as="p" variant="body-sm" colorVariant="muted">
                    {emptyText}
                </Text>
            )}
            <div>
                <Button variant="secondary" size="sm" onClick={openPanel} disabled={disabled}>
                    {editLabel}
                </Button>
            </div>

            <SystemDrawer open={open} onClose={() => setOpen(false)} size="md">
                <DrawerLayout
                    header={
                        <div className={styles.header}>
                            <Text variant="title-sm" weight={700}>
                                {title}
                            </Text>
                            {!single && (
                                <Text variant="body-sm" colorVariant="muted">
                                    {draft.length} di {options.length} selezionate
                                </Text>
                            )}
                        </div>
                    }
                    footer={
                        <div className={styles.footer}>
                            <Button variant="secondary" onClick={() => setOpen(false)}>
                                Annulla
                            </Button>
                            <Button variant="primary" onClick={apply}>
                                Applica
                            </Button>
                        </div>
                    }
                >
                    <div className={styles.panel}>
                        <div className={styles.tools}>
                            <ToolbarSearch value={query} onChange={setQuery} placeholder={searchPlaceholder} />
                            {!single && options.length > 1 && (
                                <Button variant="ghost" size="sm" onClick={() => setDraft(toggleAll(options, draft))}>
                                    {draft.length === options.length ? "Deseleziona tutte" : "Seleziona tutte"}
                                </Button>
                            )}
                        </div>
                        {shown.length === 0 ? (
                            <Text as="p" variant="body-sm" colorVariant="muted">
                                Nessun risultato per «{query}».
                            </Text>
                        ) : (
                            <ul className={styles.list} role={single ? "radiogroup" : undefined} aria-label={title}>
                                {shown.map(option => {
                                    const checked = draft.includes(option.id);
                                    return (
                                        <li key={option.id} className={styles.item}>
                                            {option.thumbnailUrl !== undefined && (
                                                <span className={styles.thumb} aria-hidden="true">
                                                    {option.thumbnailUrl && <img src={option.thumbnailUrl} alt="" />}
                                                </span>
                                            )}
                                            {single ? (
                                                <label className={styles.radio}>
                                                    <input
                                                        type="radio"
                                                        name={`chip-picker-${title}`}
                                                        checked={checked}
                                                        onChange={() => toggle(option.id)}
                                                    />
                                                    <span className={styles.itemText}>
                                                        <Text as="span" variant="body-sm" weight={500}>
                                                            {option.name}
                                                        </Text>
                                                        {option.meta && (
                                                            <Text as="span" variant="caption" colorVariant="muted">
                                                                {option.meta}
                                                            </Text>
                                                        )}
                                                    </span>
                                                </label>
                                            ) : (
                                                <CheckboxInput
                                                    label={option.name}
                                                    description={option.meta}
                                                    checked={checked}
                                                    onChange={() => toggle(option.id)}
                                                    containerClassName={styles.check}
                                                />
                                            )}
                                            {option.badge}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </DrawerLayout>
            </SystemDrawer>
        </div>
    );
}
