import type { ReactNode } from "react";
import { filterActivityOptions } from "@/components/ui/ActivityMultiSelect/activityFilter";

/** Oltre quante scelte i chip si fermano e compare «+N altri». */
export const CHIP_PICKER_VISIBLE = 8;

export interface ChipPickerOption {
    id: string;
    /** Il nome, anche quello su cui si cerca. */
    name: string;
    /** Una riga muta sotto il nome nel pannello (per i prodotti: prezzo · categoria). */
    meta?: string;
    /** Miniatura nel pannello (prodotti). */
    thumbnailUrl?: string | null;
    /** Una pillola a destra nel pannello (sedi: «Sospesa»). */
    badge?: ReactNode;
}

/** I chip da mostrare in pagina: le prime 8 scelte, nell'ordine dell'elenco, e quante restano. */
export function visibleChips(options: ChipPickerOption[], value: string[]): { chips: ChipPickerOption[]; rest: number } {
    const selected = options.filter(option => value.includes(option.id));
    return {
        chips: selected.slice(0, CHIP_PICKER_VISIBLE),
        rest: Math.max(0, selected.length - CHIP_PICKER_VISIBLE)
    };
}

/** Le voci del pannello che contengono la ricerca, senza badare a maiuscole e accenti. */
export function filterChipOptions(options: ChipPickerOption[], query: string): ChipPickerOption[] {
    return filterActivityOptions(options, query);
}

/** «Seleziona tutte»: tutte le voci, anche con una ricerca in corso (come le sedi). */
export function toggleAll(options: ChipPickerOption[], value: string[]): string[] {
    return value.length === options.length ? [] : options.map(option => option.id);
}
