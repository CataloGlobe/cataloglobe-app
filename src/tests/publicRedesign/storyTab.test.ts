import { describe, expect, it, vi } from "vitest";
import type { StoryBlock } from "@/services/supabase/stories";

const fetchPublicStories = vi.fn();
vi.mock("@/services/supabase/stories", () => ({
    fetchPublicStories: (slug: string) => fetchPublicStories(slug),
    fetchPublicStory: vi.fn()
}));

const { introParagraphs, loadStories, cachedStories, readingMinutes, storyLayout } = await import(
    "@/components/PublicCollectionView/redesign/story/storyStore"
);

/** Pagina Storia del redesign (mockup v38): impaginazione, testo del cappello, minuti, cache della visita. */
describe("storyLayout", () => {
    it("schede grandi fino a tre storie, lista da quattro", () => {
        expect(storyLayout(1)).toBe("grandi");
        expect(storyLayout(3)).toBe("grandi");
        expect(storyLayout(4)).toBe("lista");
        expect(storyLayout(9)).toBe("lista");
    });
});

describe("introParagraphs", () => {
    it("le righe vuote separano i paragrafi, gli a capo singoli restano", () => {
        expect(introParagraphs("Primo\nancora primo\n\n  Secondo  \n\n\nTerzo")).toEqual([
            "Primo\nancora primo",
            "Secondo",
            "Terzo"
        ]);
    });

    it("niente testo, niente paragrafi", () => {
        expect(introParagraphs(null)).toEqual([]);
        expect(introParagraphs("  \n\n ")).toEqual([]);
    });
});

describe("readingMinutes", () => {
    const words = (n: number) => Array.from({ length: n }, () => "parola").join(" ");

    it("conta testo, titoli, citazioni ed elenchi, almeno un minuto", () => {
        const blocks: StoryBlock[] = [
            { id: "1", type: "text", content: words(250) },
            { id: "2", type: "heading", content: words(50) },
            { id: "3", type: "quote", content: words(50) },
            { id: "4", type: "list", variant: "bullet", items: [words(25), words(25)] },
            { id: "5", type: "product", productId: "p" }
        ] as StoryBlock[];
        expect(readingMinutes(blocks)).toBe(2);
        expect(readingMinutes([])).toBe(1);
    });
});

describe("loadStories", () => {
    it("una lettura sola per visita, anche chiesta due volte; «Riprova» rilegge", async () => {
        const list = { cappello: null, stories: [] };
        fetchPublicStories.mockResolvedValue(list);
        const [a, b] = await Promise.all([loadStories("sede"), loadStories("sede")]);
        expect(a).toBe(list);
        expect(b).toBe(list);
        expect(fetchPublicStories).toHaveBeenCalledTimes(1);
        expect(cachedStories("sede")).toBe(list);

        await loadStories("sede");
        expect(fetchPublicStories).toHaveBeenCalledTimes(1);
        await loadStories("sede", true);
        expect(fetchPublicStories).toHaveBeenCalledTimes(2);
    });

    it("un errore non resta in cache: la volta dopo si rilegge", async () => {
        fetchPublicStories.mockRejectedValueOnce(new Error("rete"));
        await expect(loadStories("altra")).rejects.toThrow("rete");
        expect(cachedStories("altra")).toBeNull();
        fetchPublicStories.mockResolvedValueOnce({ cappello: null, stories: [] });
        await expect(loadStories("altra")).resolves.toEqual({ cappello: null, stories: [] });
    });
});
