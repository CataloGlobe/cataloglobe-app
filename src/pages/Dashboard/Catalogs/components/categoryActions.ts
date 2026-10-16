import { FolderInput, FolderPlus, TextCursorInput } from "lucide-react";
import type { TableRowAction } from "@/components/ui/TableRowActions/TableRowActions";
import { rowAction } from "@/components/ui/TableRowActions/rowAction";
import { LOOK_D } from "@/styles/lookD";

/** Il tetto dei livelli (L1–L3): lo applicano i drawer e il trascinamento; qui lo si dice. */
export const MAX_CATEGORY_LEVEL = 3;

type CategoryActionsArgs = {
    level: number;
    /** «categoria», «sezione». */
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
    // Nella D (copia v59) spostare e creare vanno in bozza come rinominare:
    // con la bozza aperta resta spento solo eliminare.
    const draftLock = LOOK_D ? undefined : structureLockReason;
    return [
        { label: "Rinomina", icon: TextCursorInput, onClick: onRename },
        {
            label: "Sposta in…",
            icon: FolderInput,
            onClick: onMove,
            disabled: Boolean(draftLock),
            description: draftLock
        },
        {
            label: `Crea sotto-${categoryLabel}`,
            icon: FolderPlus,
            onClick: onCreateSub,
            disabled: atMaxLevel || Boolean(draftLock),
            description: atMaxLevel ? "Massimo tre livelli." : draftLock
        },
        rowAction.remove(onDelete, {
            disabled: Boolean(structureLockReason),
            description: structureLockReason
        })
    ];
}
