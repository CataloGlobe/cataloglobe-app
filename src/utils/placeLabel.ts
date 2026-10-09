/**
 * Le due righe del selettore di azienda e sede in cima alla sidebar
 * (Officina): sopra l'azienda, sotto dove sei. Il nome non si ripete: una
 * sede che si chiama come l'azienda non aggiunge una riga («San Pietro» e
 * «San Pietro» → solo «San Pietro»), una che comincia col nome dell'azienda
 * tiene solo il resto («McDonald's» e «McDonald's Garbagnate» → «Garbagnate»).
 */

export interface PlaceLines {
    title: string;
    subtitle: string | null;
}

/** Minuscole, senza accenti né punteggiatura: «McDonald's» → «mcdonalds». */
function key(text: string): string {
    return text
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Toglie i separatori rimasti in testa: «- Porta Venezia» → «Porta Venezia». */
function trimLeadingSeparators(text: string): string {
    return text.replace(/^[\s\-–—·|,:/]+/u, "").trim();
}

/**
 * `sedeName` null = nessuna sede scelta (più sedi, fuori da una sede):
 * sotto va `allLabel`.
 */
export function placeLines(tenantName: string, sedeName: string | null, allLabel: string): PlaceLines {
    if (sedeName === null) return { title: tenantName, subtitle: allLabel };

    const tenantKey = key(tenantName);
    const sede = sedeName.trim();
    if (!tenantKey || key(sede) === tenantKey) return { title: tenantName, subtitle: tenantKey ? null : sede };

    const words = sede.split(/\s+/);
    let acc = "";
    for (let i = 0; i < words.length; i++) {
        acc += key(words[i]);
        if (acc === tenantKey) {
            const rest = trimLeadingSeparators(words.slice(i + 1).join(" "));
            return { title: tenantName, subtitle: rest || null };
        }
        if (!tenantKey.startsWith(acc)) break;
    }
    return { title: tenantName, subtitle: sede };
}
