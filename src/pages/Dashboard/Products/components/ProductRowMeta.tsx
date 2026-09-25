import Text from "@/components/ui/Text/Text";
import type { PriceText } from "../productRowSummary";

type Props = {
    price: PriceText;
    /** `getProductIssues`: il prezzo manca davvero (non basta `price.kind`). */
    missingPrice: boolean;
    menus: { text: string; none: boolean };
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
