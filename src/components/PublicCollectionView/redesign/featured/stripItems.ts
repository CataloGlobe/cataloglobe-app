import type { V2FeaturedContent } from "@/types/resolvedCollections";

/** Chiave i18n (`public`) del tipo di contenuto: etichetta della card e testata del dettaglio. */
export const FEATURED_TYPE_KEY: Record<V2FeaturedContent["content_type"], string> = {
    announcement: "featured.type_announcement",
    event: "featured.type_event",
    promo: "featured.type_promo",
    bundle: "featured.type_bundle"
};

/** Card per slot nella striscia (spec §9, v33). */
export const FEATURED_STRIP_LIMIT = 5;

/**
 * Cosa mostra la striscia di uno slot: fino a 5 contenuti e, solo oltre 5,
 * quanti ne restano fuori. «Altri N» = contenuti di oggi (i due slot, senza
 * doppioni) meno quelli già nella striscia di questo slot.
 */
export function featuredStripItems(
    blocks: readonly V2FeaturedContent[],
    totalCount: number
): { visible: V2FeaturedContent[]; moreCount: number } {
    if (blocks.length <= FEATURED_STRIP_LIMIT) return { visible: [...blocks], moreCount: 0 };
    const visible = blocks.slice(0, FEATURED_STRIP_LIMIT);
    return { visible, moreCount: Math.max(0, Math.max(totalCount, blocks.length) - visible.length) };
}
