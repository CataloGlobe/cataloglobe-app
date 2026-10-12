// Le idee da cui partire per un contenuto in evidenza (D187): quello che un
// bravo cameriere direbbe a voce arrivando al tavolo. Un'idea non è un tipo:
// dà gli esempi nei campi e, se parla di piatti, apre la loro parte.
import type { EvType } from "./creaModel";

export type IdeaId = "chef" | "offerta" | "fisso" | "serata" | "avviso";
export type Idea = { id: IdeaId; name: string; say: string; ex: readonly [title: string, sub: string, text: string]; dishes?: Extract<EvType, "promo" | "bundle"> };

export const IDEE: readonly { job: string; ideas: readonly Idea[] }[] = [
    {
        job: "Far ordinare adesso",
        ideas: [
            { id: "chef", name: "Un piatto consigliato", say: "«Stasera vi consiglio il risotto»", ex: ["Lo chef consiglia", "Questa settimana", "Perché vale la pena provarlo."], dishes: "promo" },
            { id: "offerta", name: "Un'offerta", say: "«Il mercoledì lo spritz è a 5 €»", ex: ["Mercoledì dello spritz", "Solo il mercoledì sera", "Quando vale e per chi."], dishes: "promo" },
            { id: "fisso", name: "Un menù a prezzo unico", say: "«C'è il menù degustazione a 35 €»", ex: ["Menù degustazione", "Primo, secondo e dolce", "Cosa comprende."], dishes: "bundle" }
        ]
    },
    { job: "Far tornare", ideas: [{ id: "serata", name: "Una serata", say: "«Giovedì c'è il karaoke, vi tengo un tavolo?»", ex: ["Giovedì karaoke", "Giovedì 15, dalle 21", "Porta gli amici: chi canta ha il primo giro offerto."] }] },
    { job: "Dire una cosa", ideas: [{ id: "avviso", name: "Un avviso", say: "«Da lunedì siamo chiusi per ferie»", ex: ["Chiusi per ferie", "Dal 12 al 20 agosto", "Ci rivediamo presto."] }] }
];

export const ideaOf = (id: string | null): Idea | null => IDEE.flatMap(j => j.ideas).find(i => i.id === id) ?? null;
