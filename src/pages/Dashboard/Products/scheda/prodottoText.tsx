import type { ReactNode } from "react";
import { PART_CAPTION, PHONE_PARTS, type ProdottoPart } from "./prodottoCopy";
import { inheritedPart, partOnPhone, type ProdottoFacts } from "./prodottoModel";

/** «testo con **grassetto**» → nodi. */
export function rich(text: string): ReactNode {
    return text.split("**").map((piece, i) => (i % 2 ? <b key={i}>{piece}</b> : <span key={i}>{piece}</span>));
}

/** Cosa dice la card «Sul telefono» per una parte. */
export function partCaption(part: ProdottoPart, f: ProdottoFacts): string {
    if (inheritedPart(f, part)) return `**Da ${f.parentName}**: si cambia da lì.`;
    if (PHONE_PARTS.includes(part) && !partOnPhone(part, f)) return "**Vuota**: sul telefono ora non c'è.";
    return PART_CAPTION[part];
}
