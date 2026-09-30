import { Card, type CardProps } from "@/components/ui/Card/Card";

/**
 * @deprecated `SectionCard` si chiama `Card` (`ui/Card/Card.tsx`): stessa
 * anatomia, stesse prop. Alias di compatibilità — si rimuove nel lotto 6.
 */
export type SectionCardProps = CardProps;

let warned = false;

/** @deprecated Usa `Card` da `ui/Card/Card.tsx`. */
export function SectionCard(props: SectionCardProps) {
    if (import.meta.env.DEV && !warned) {
        warned = true;
        console.warn("[SectionCard] deprecato: usa Card (ui/Card/Card.tsx), stessa anatomia e stesse prop");
    }
    return <Card {...props} />;
}
