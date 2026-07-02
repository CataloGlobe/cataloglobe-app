import { Badge } from "@/components/ui/Badge/Badge";
import type { ProductMatchStatus } from "@/utils/importMatching";

interface ProductMatchBadgeProps {
    status: ProductMatchStatus;
}

/**
 * Badge di stato-match per un prodotto AI nel ramo "catalogo esistente".
 * `none` non ha badge (nessun match) → il componente non renderizza nulla.
 */
export function ProductMatchBadge({ status }: ProductMatchBadgeProps) {
    switch (status) {
        case "in_category":
            return <Badge variant="secondary">Già in questa categoria</Badge>;
        case "reusable_single":
            return <Badge variant="success">Già nel database</Badge>;
        case "reusable_ambiguous":
            return <Badge variant="warning">Più prodotti con questo nome</Badge>;
        case "none":
        default:
            return null;
    }
}

/** Badge informativo (viola) per i doppioni dentro lo stesso scan. Non blocca. */
export function InScanDuplicateBadge() {
    return <Badge color="#8b5cf6">Possibile doppione</Badge>;
}
