import type { PublicMenu } from "@/types/resolvedCollections";

/**
 * Ciò che il foglio «Menu disponibili ora» e la riga «Cambia menu» del ⋯ ricevono
 * dal redesign: i menu di adesso, quello a vista, come cambiarlo e come tornare
 * alla scelta. Solo con più menu adesso.
 */
export type MenuSheetBinding = {
    menus: PublicMenu[];
    current: PublicMenu | undefined;
    choose: (menu: PublicMenu) => void;
    showAll: () => void;
};
