import { IconTrash } from "@tabler/icons-react";
import type { TableRowAction } from "@/components/ui/TableRowActions/TableRowActions";

/** Il tetto dei livelli (L1–L3): lo applicano i drawer e il trascinamento; qui lo si dice. */
export const MAX_CATEGORY_LEVEL = 3;

type CategoryActionsArgs = {
    level: number;
    /** «portata», «sezione», «categoria». */
    categoryLabel: string;
    /** Presente quando la bozza è aperta: i gesti che scrivono subito si spengono col perché. */
    structureLockReason?: string;
    onRename: () => void;
    onMove: () => void;
    onCreateSub: () => void;
    onDelete: () => void;
};

/**
 * Le voci del kebab di una categoria, uguali sul nodo dell'albero e nella
 * testata della categoria scelta (passo 2 P5). Rinominare va in bozza e resta
 * sempre possibile; spostare, creare ed eliminare scrivono subito e con la
 * bozza aperta sono spenti, col motivo (§49.1/2).
 */
export function categoryActions({
    level,
    categoryLabel,
    structureLockReason,
    onRename,
    onMove,
    onCreateSub,
    onDelete
}: CategoryActionsArgs): TableRowAction[] {
    const atMaxLevel = level >= MAX_CATEGORY_LEVEL;
    return [
        { label: "Rinomina", onClick: onRename },
        {
            label: "Sposta in…",
            onClick: onMove,
            disabled: Boolean(structureLockReason),
            description: structureLockReason
        },
        {
            label: `Crea sotto-${categoryLabel}`,
            onClick: onCreateSub,
            disabled: atMaxLevel || Boolean(structureLockReason),
            description: atMaxLevel ? "Massimo tre livelli." : structureLockReason
        },
        {
            label: "Elimina",
            icon: IconTrash,
            onClick: onDelete,
            variant: "destructive",
            separator: true,
            disabled: Boolean(structureLockReason),
            description: structureLockReason
        }
    ];
}
