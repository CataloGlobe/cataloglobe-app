import { Megaphone, Palette, ScrollText, Tag, UtensilsCrossed, type LucideIcon } from "lucide-react";

/** Le famiglie di Menù e vetrina, e i prezzi: ognuna col suo colore e la sua icona. */
export type Family = "menu" | "style" | "featured" | "story" | "price";

/** Le icone delle famiglie: le stesse di «Cosa vuoi creare?» nella Home. */
export const FAMILY_ICON: Record<Family, LucideIcon> = {
    menu: UtensilsCrossed,
    style: Palette,
    featured: Megaphone,
    story: ScrollText,
    price: Tag
};
