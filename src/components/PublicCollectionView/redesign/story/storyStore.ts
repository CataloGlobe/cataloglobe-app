import { fetchPublicStories, fetchPublicStory } from "@/services/supabase/stories";
import type { PublicStoryCard, PublicStoryDetail, PublicStoryListResult, StoryBlock } from "@/services/supabase/stories";

/**
 * Dati della pagina Storia del redesign (spec §15, mockup v38): elenco e racconti
 * letti una volta per visita, precarico quando il menu è pronto, lo scorrimento
 * ricordato e la foto del cappello che l'isola mette al posto della copertina.
 */

const lists = new Map<string, PublicStoryListResult>();
const listsInFlight = new Map<string, Promise<PublicStoryListResult>>();
const details = new Map<string, PublicStoryDetail>();

export function cachedStories(slug: string): PublicStoryListResult | null {
    return lists.get(slug) ?? null;
}

/** L'elenco della sede: dalla cache della visita, o una lettura sola anche se chiesto due volte. */
export function loadStories(slug: string, retry = false): Promise<PublicStoryListResult> {
    if (!retry) {
        const cached = lists.get(slug);
        if (cached) return Promise.resolve(cached);
        const inFlight = listsInFlight.get(slug);
        if (inFlight) return inFlight;
    }
    const request = fetchPublicStories(slug).then(data => {
        lists.set(slug, data);
        return data;
    });
    listsInFlight.set(slug, request);
    const done = () => {
        if (listsInFlight.get(slug) === request) listsInFlight.delete(slug);
    };
    request.then(done, done);
    return request;
}

/** Il componente della pagina, a parte: si chiede col precarico, così il primo tocco su Storia non aspetta. */
export const loadStoryTab = () => import("./StoryTab");

/** In sottofondo, quando il menu è pronto: chunk e dati; un errore qui non si mostra. */
export function prefetchStories(slug: string): void {
    void loadStoryTab();
    if (lists.has(slug) || listsInFlight.has(slug)) return;
    loadStories(slug).catch(() => {});
}

export function cachedStory(slug: string, storyId: string): PublicStoryDetail | null {
    return details.get(`${slug}/${storyId}`) ?? null;
}

export function loadStory(slug: string, storyId: string): Promise<PublicStoryDetail> {
    const key = `${slug}/${storyId}`;
    const cached = details.get(key);
    if (cached) return Promise.resolve(cached);
    return fetchPublicStory(slug, storyId).then(detail => {
        details.set(key, detail);
        return detail;
    });
}

/** Schede grandi fino a tre storie, lista da quattro (v38, «Automatica»). */
export function storyLayout(count: number): "grandi" | "lista" {
    return count <= 3 ? "grandi" : "lista";
}

/** Il testo del cappello in paragrafi: le righe vuote li separano, gli a capo singoli restano. */
export function introParagraphs(intro: string | null): string[] {
    if (!intro) return [];
    return intro
        .split(/\n\s*\n/)
        .map(part => part.trim())
        .filter(Boolean);
}

const WORDS_PER_MINUTE = 200;

function blockWords(block: StoryBlock): string {
    switch (block.type) {
        case "text":
        case "heading":
        case "quote":
            return block.content;
        case "list":
            return block.items.join(" ");
        default:
            return "";
    }
}

/** Minuti di lettura del racconto (almeno uno). */
export function readingMinutes(blocks: StoryBlock[]): number {
    const words = blocks
        .map(blockWords)
        .join(" ")
        .split(/\s+/)
        .filter(Boolean).length;
    return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/** Quello che il lettore mostra subito, prima del racconto: dalla scheda dell'elenco. */
export function storyCard(slug: string, storyId: string): PublicStoryCard | null {
    return lists.get(slug)?.stories.find(story => story.id === storyId) ?? null;
}

// Scorrimento della pagina Storia per sede: tornando dal Menu si riparte da lì.
const scrolls = new Map<string, number>();

export function rememberStoryScroll(slug: string, y: number): void {
    scrolls.set(slug, y);
}

export function storyScroll(slug: string): number {
    return scrolls.get(slug) ?? 0;
}
