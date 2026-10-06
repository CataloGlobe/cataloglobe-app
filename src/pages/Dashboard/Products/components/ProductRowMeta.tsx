import Text from "@/components/ui/Text/Text";
import type { PriceText } from "../productRowSummary";

type Props = {
    price: PriceText;
    /** `getProductIssues`: il prezzo manca davvero (non basta `price.kind`). */
    missingPrice: boolean;
    menus: { text: string; none: boolean; count: number };
};

/**
 * La riga muta di un prodotto (lista e griglia): «€ 4,50 · in 2 menù».
 * I difetti in ambra, a parole: «senza prezzo», «in nessun menù» (§25.3).
 */
export function ProductRowMeta({ price, missingPrice, menus }: Props) {
    return (
        <span>
            {missingPrice || price.kind === "none" ? (
                <Text as="span" variant="caption" colorVariant="warning">
                    senza prezzo
                </Text>
            ) : (
                <>
                    {price.text}
                    {price.inherited && " (ereditato)"}
                </>
            )}
            {" · "}
            {menus.none ? (
                <Text as="span" variant="caption" colorVariant="warning">
                    {menus.text}
                </Text>
            ) : (
                menus.text
            )}
        </span>
    );
}

/** La colonna Prezzo della tabella (PR2): «da 3,00 €», o «senza prezzo» in ambra. */
export function ProductPriceCell({ price, missingPrice }: Pick<Props, "price" | "missingPrice">) {
    if (missingPrice || price.kind === "none") {
        return (
            <Text as="span" variant="caption" colorVariant="warning">
                senza prezzo
            </Text>
        );
    }
    return (
        <span>
            {price.text}
            {price.inherited && (
                <Text as="span" variant="caption" colorVariant="muted">
                    {" "}
                    (ereditato)
                </Text>
            )}
        </span>
    );
}

/** La colonna Menù della tabella (PR2): quanti, o «nessuno» in ambra. */
export function ProductMenusCell({ menus }: Pick<Props, "menus">) {
    return menus.none ? (
        <Text as="span" variant="caption" colorVariant="warning">
            nessuno
        </Text>
    ) : (
        <span>{menus.count}</span>
    );
}
