// Menù e vetrina nella D (Visual Redesign 2, PR 9; copia congelata `#p-mv`).
// Solo dati e parole: la riga «In onda», la frase in cima, filtri e ordine.
// Gli stati vengono da `ruleAppearance`, la stessa competizione del Calendario.
import {
    describeReach,
    describeWhen,
    joinSeatNames,
    liveSeats,
    type Appearance,
    type AppearanceActivity
} from "@/utils/ruleAppearance";

/** «In onda adesso» (verde), «In onda» in altri momenti (viola), o niente. */
export type OnAirState = "now" | "on" | "off";

export type OnAir = {
    state: OnAirState;
    /** «Tutti i giorni · 19:00–23:00», «sempre». */
    when: string | null;
    /** Solo con più sedi: «tutte le sedi», il nome, «3 sedi». */
    where: string | null;
};

const OFF: OnAir = { state: "off", when: null, where: null };

/** «tutte le sedi» se le prende tutte, il nome se è una, altrimenti «N sedi». */
function reachOf(ids: readonly string[], activities: readonly AppearanceActivity[]): string {
    const active = activities.filter(a => a.status === "active");
    if (active.length > 0 && active.every(a => ids.includes(a.id))) return "tutte le sedi";
    if (ids.length === 1) return activities.find(a => a.id === ids[0])?.name ?? "1 sede";
    return `${ids.length} sedi`;
}

/**
 * La riga «In onda · quando · dove» di una card (`mvOnda`). Il quando è quello
 * della regola che lo porta (adesso, o la prima viva); il dove si dice solo
 * con più sedi.
 */
export function onAirOf(appearance: Appearance | null, activities: readonly AppearanceActivity[]): OnAir {
    if (!appearance) return OFF;
    const multi = activities.length > 1;
    const name = (id: string) => activities.find(a => a.id === id)?.name;
    if (appearance.summary === "liveNow") {
        const live = liveSeats(appearance);
        return {
            state: "now",
            when: describeWhen(live[0].rule),
            where: multi ? reachOf(live.map(seat => seat.activityId), activities) : null
        };
    }
    if (appearance.summary === "assigned") {
        const entry = appearance.rules.find(e => e.isLive);
        if (!entry) return OFF;
        return { state: "on", when: describeWhen(entry.rule), where: multi ? describeReach(entry, name) : null };
    }
    return OFF;
}

/** Un pezzo della frase: testo, un nome della famiglia, o una mancanza (`b.dn`). */
export type LeadPart = { text: string } | { name: string } | { down: string };

/** Le parole della frase per famiglia: il soggetto quando niente è in onda, e l'attacco. */
export type LeadWords = {
    /** «nessun menù», «nessuno stile». */
    none: string;
    /** «Adesso in onda:», «Adesso la pagina si veste con». */
    lead: string;
};

/**
 * La frase in cima (`mvLeadOra`): chi è in onda adesso e dove. Con una sede
 * sola «Adesso i clienti vedono X e Y.»; con più sedi «Adesso in onda: X a
 * Centro e Porto, Y a Lago.»; se niente, «Adesso nessun menù è in onda.».
 * `emptySeats` aggiunge le sedi aperte che non mostrano niente (Menù).
 */
export function leadOf(
    items: readonly { name: string; appearance: Appearance | null }[],
    activities: readonly AppearanceActivity[],
    words: LeadWords,
    emptySeats?: string
): LeadPart[] {
    const live = items
        .map(item => ({ name: item.name, seats: item.appearance ? liveSeats(item.appearance) : [] }))
        .filter(item => item.seats.length > 0);
    if (live.length === 0) return [{ text: `Adesso ${words.none} è in onda.` }];

    const parts: LeadPart[] = [];
    const active = activities.filter(a => a.status === "active");
    if (activities.length <= 1) {
        parts.push({ text: "Adesso i clienti vedono " });
        live.forEach((item, i) => {
            if (i > 0) parts.push({ text: i === live.length - 1 ? " e " : ", " });
            parts.push({ name: item.name });
        });
        parts.push({ text: "." });
        return parts;
    }

    parts.push({ text: `${words.lead} ` });
    live.forEach((item, i) => {
        if (i > 0) parts.push({ text: ", " });
        parts.push({ name: item.name });
        const ids = item.seats.map(seat => seat.activityId);
        const all = active.length > 1 && active.every(a => ids.includes(a.id));
        parts.push({ text: all ? " in tutte le sedi" : ` a ${joinSeatNames(item.seats.map(seat => seat.name))}` });
    });
    parts.push({ text: "." });

    if (emptySeats) {
        const covered = new Set(live.flatMap(item => item.seats.map(seat => seat.activityId)));
        const empty = active.filter(a => !covered.has(a.id)).map(a => a.name);
        if (empty.length > 0) {
            parts.push({ text: " " }, { down: joinSeatNames(empty) }, { text: ` ${empty.length === 1 ? "non mostra" : "non mostrano"} ${emptySeats}.` });
        }
    }
    return parts;
}

/** I filtri comuni (`mvChips`): tutti, in onda, non in onda. */
export type OnAirFilter = "all" | "on" | "off";

export function matchesOnAir(filter: OnAirFilter, onAir: OnAir): boolean {
    if (filter === "all") return true;
    return filter === "on" ? onAir.state !== "off" : onAir.state === "off";
}

/** «Ordina» di Menù, Stili, In evidenza e Storie (D209 chiusa). */
export type VetrinaSort = "onda" | "recenti" | "nome";

export const VETRINA_SORT: readonly { value: VetrinaSort; label: string }[] = [
    { value: "onda", label: "In onda prima" },
    { value: "recenti", label: "Ultimi creati" },
    { value: "nome", label: "Per nome, A–Z" }
];

const RANK: Record<OnAirState, number> = { now: 0, on: 1, off: 2 };

/** L'ordine scelto; a parità, il nome (`mvSort`). */
export function sortVetrina<T extends { name: string; created_at: string }>(
    items: readonly T[],
    sort: VetrinaSort,
    onAir: (item: T) => OnAir
): T[] {
    const byName = (a: T, b: T) => a.name.localeCompare(b.name, "it");
    return [...items].sort((a, b) => {
        if (sort === "recenti") return b.created_at.localeCompare(a.created_at) || byName(a, b);
        if (sort === "onda") return RANK[onAir(a).state] - RANK[onAir(b).state] || byName(a, b);
        return byName(a, b);
    });
}
