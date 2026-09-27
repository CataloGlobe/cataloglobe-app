import type { FeaturedContentType } from "@/services/supabase/featuredContents";

/** Il nome del tipo di un contenuto in evidenza (§28.4: «Tipo», non «Modalità prezzo»). */
export const CONTENT_TYPE_LABEL: Record<FeaturedContentType, string> = {
    announcement: "Annuncio",
    event: "Evento",
    promo: "Promo",
    bundle: "Bundle"
};
