// La frase in cima al Calendario nella D (Visual Redesign 2, PR 10; copia `cNowLine`):
// «Adesso a San Pietro i clienti vedono Cena, con lo stile Sera in sala; in evidenza Risotto del giorno.»
import type { LeadPart } from "@/pages/Dashboard/Vetrina/vetrinaModel";
import type { Pezzo } from "./calendarConfronto";

export type OraInOnda = { menu: string[]; style: string[]; featured: string[] };

/**
 * Chi è in onda adesso, corsia per corsia: i pezzi di oggi che coprono l'ora,
 * più quelli di ieri che passano la mezzanotte. «A + B» sono due nomi.
 */
export function inOndaOra(oggi: readonly Pezzo[], ieri: readonly Pezzo[], nowMin: number): OraInOnda {
    const at = (k: Pezzo["k"]) => {
        const hit = [
            ...oggi.filter(x => x.k === k && x.from <= nowMin && nowMin < x.to),
            ...ieri.filter(x => x.k === k && x.from <= nowMin + 1440 && nowMin + 1440 < x.to)
        ];
        return [...new Set(hit.flatMap(x => x.label.split(" + ")))];
    };
    return { menu: at("menu"), style: at("style"), featured: at("featured") };
}

/**
 * La frase. `dove` è «» con una sede sola, «a San Pietro» con una sede scelta,
 * «, nella maggior parte delle sedi,» con tutte o un gruppo.
 */
export function calLead(on: OraInOnda, dove: string): LeadPart[] {
    const attacco = dove.startsWith(",") ? `Adesso${dove} ` : dove ? `Adesso ${dove} ` : "Adesso ";
    if (!on.menu.length) return [{ text: attacco }, { down: "nessun menù" }, { text: " è in onda." }];
    const nomi = (names: string[], family: "menu" | "style" | "featured"): LeadPart[] =>
        names.flatMap((name, i) => [...(i ? [{ text: " e " }] : []), { name, family }]);
    return [
        { text: `${attacco}i clienti vedono ` },
        ...nomi(on.menu, "menu"),
        ...(on.style.length ? [{ text: ", con lo stile " }, { name: on.style[0], family: "style" as const }] : []),
        ...(on.featured.length ? [{ text: "; in evidenza " }, ...nomi(on.featured, "featured")] : []),
        { text: "." }
    ];
}
