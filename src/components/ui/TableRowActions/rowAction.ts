import { Copy, Eye, SquarePen, Trash2 } from "lucide-react";
import type { TableRowAction } from "./TableRowActions";

type FixedActionExtra = Pick<TableRowAction, "hidden" | "disabled" | "description">;

/**
 * Le tre voci fisse dei menù «⋯» delle liste con dettaglio (D115, Alex
 * 2026-10-09), sempre in quest'ordine: «Modifica» (o «Apri» in sola lettura)
 * · «Duplica» se esiste · azioni proprie della pagina · divisore · «Elimina»
 * rosso, senza il nome dell'entità. Le icone le hanno solo queste tre:
 * matita sul foglio, due rettangoli, cestino; «Apri» ha l'occhio.
 */
export const rowAction = {
    edit: (onClick: () => void, opts: FixedActionExtra & { readOnly?: boolean } = {}): TableRowAction => {
        const { readOnly, ...extra } = opts;
        return readOnly
            ? { label: "Apri", icon: Eye, onClick, ...extra }
            : { label: "Modifica", icon: SquarePen, onClick, ...extra };
    },
    duplicate: (onClick: () => void, extra: FixedActionExtra & { label?: string } = {}): TableRowAction => ({
        label: "Duplica",
        icon: Copy,
        onClick,
        ...extra
    }),
    remove: (onClick: () => void, extra: FixedActionExtra = {}): TableRowAction => ({
        label: "Elimina",
        icon: Trash2,
        onClick,
        variant: "destructive",
        separator: true,
        ...extra
    })
};
