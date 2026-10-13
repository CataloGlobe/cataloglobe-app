// Le idee da cui partire per un contenuto in evidenza (D187): quello che un
// bravo cameriere direbbe a voce arrivando al tavolo. Un'idea non è un tipo:
// dà gli esempi nei campi e, se parla di piatti, apre la loro parte.
import { hasDishes, type EvType, type Tunnel } from "./creaModel";

export type IdeaId = "chef" | "offerta" | "fisso" | "serata" | "avviso";
// `type`: il tipo che l'idea dà al contenuto quando non ha piatti (la serata è un evento, review #444)
export type Idea = { id: IdeaId; name: string; say: string; ex: readonly [title: string, sub: string, text: string]; dishes?: Extract<EvType, "promo" | "bundle">; type?: Extract<EvType, "evento"> };

export const IDEE: readonly { job: string; ideas: readonly Idea[] }[] = [
    {
        job: "Far ordinare adesso",
        ideas: [
            { id: "chef", name: "Un piatto consigliato", say: "«Stasera vi consiglio il risotto»", ex: ["Lo chef consiglia", "Questa settimana", "Perché vale la pena provarlo."], dishes: "promo" },
            { id: "offerta", name: "Un'offerta", say: "«Il mercoledì lo spritz è a 5 €»", ex: ["Mercoledì dello spritz", "Solo il mercoledì sera", "Quando vale e per chi."], dishes: "promo" },
            { id: "fisso", name: "Un menù a prezzo unico", say: "«C'è il menù degustazione a 35 €»", ex: ["Menù degustazione", "Primo, secondo e dolce", "Cosa comprende."], dishes: "bundle" }
        ]
    },
    { job: "Far tornare", ideas: [{ id: "serata", name: "Una serata", say: "«Giovedì c'è il karaoke, vi tengo un tavolo?»", ex: ["Giovedì karaoke", "Giovedì 15, dalle 21", "Porta gli amici: chi canta ha il primo giro offerto."], type: "evento" }] },
    { job: "Dire una cosa", ideas: [{ id: "avviso", name: "Un avviso", say: "«Da lunedì siamo chiusi per ferie»", ex: ["Chiusi per ferie", "Dal 12 al 20 agosto", "Ci rivediamo presto."] }] }
];

export const ideaOf = (id: string | null): Idea | null => IDEE.flatMap(j => j.ideas).find(i => i.id === id) ?? null;

type EvPart = Pick<Tunnel, "idea" | "evType" | "edit">;

/**
 * Il tipo del contenuto senza piatti: quello dell'idea (la serata è un evento),
 * in modifica quello di prima; se no un annuncio (`null`).
 */
export function plainType(x: EvPart): EvType | null {
    const i = ideaOf(x.idea);
    if (i?.type) return i.type;
    const was = x.edit?.orig;
    return was && !hasDishes(was) ? was.evType : null;
}

/** Partire da un'idea: se parla di piatti, ne apre la parte; se no le dà il suo tipo, lasciando stare i piatti già aperti. */
export function pickIdea(x: EvPart, i: Idea) {
    x.idea = i.id;
    if (i.dishes) x.evType = i.dishes;
    else if (i.type && !hasDishes(x)) x.evType = i.type;
}

/** «Togli» sui piatti: il contenuto torna al tipo che aveva senza (review #444). */
export function dropDishes(x: EvPart) {
    x.evType = plainType(x);
}

/** «Parti da un'altra idea»: si chiude anche quello che l'idea di prima aveva aperto, come con «Togli». */
export function dropIdea(x: EvPart) {
    const i = ideaOf(x.idea);
    x.idea = null;
    if (i?.dishes || (i?.type && x.evType === i.type)) x.evType = plainType(x);
}
