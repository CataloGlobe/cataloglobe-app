import type { V2FeaturedContent } from "@/types/resolvedCollections";

/** True se il contenuto in evidenza ha un pulsante d'azione (testo + link). */
export function hasFeaturedCta(block: V2FeaturedContent): boolean {
    return Boolean(block.cta_text && block.cta_url);
}
