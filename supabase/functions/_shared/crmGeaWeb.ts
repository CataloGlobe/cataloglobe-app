// =============================================================================
// crmGeaWeb — Gea dal computer (canvas V9), la parte pura
// =============================================================================
//
// La edge crm-gea-web riceve dal pannello di /admin una domanda, gli ultimi
// scambi (la memoria la tiene il browser: la coda di Telegram accetta solo
// messaggi di Telegram) e la pagina aperta. Il giro è lo stesso di Telegram
// (crmGeaJob.think): qui si controlla l'ingresso e si aggiusta l'uscita.
// Niente import Deno: lo provano i test di vitest.
// =============================================================================

import { GEA_MAX_INPUT, GEA_MEMORY_TURNS, type GeaTurn } from "./crmGea.ts";

export type GeaWebPage = { kind: "lead"; venueId: string } | { kind: "page"; name: string };

export interface GeaWebRequest {
    text: string;
    history: GeaTurn[];
    page: GeaWebPage | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Le pagine del CRM che Gea sa nominare. Il resto non si passa. */
export const GEA_WEB_PAGES = ["Home", "Lead", "Agenda", "Agenti", "Costi", "Altro"] as const;

const TURN_MAX = 2000;

/** Controlla il corpo della richiesta: testo, memoria corta e pagina. */
export function parseGeaWebRequest(body: unknown): GeaWebRequest | { invalid: string } {
    if (!body || typeof body !== "object") return { invalid: "body" };
    const b = body as Record<string, unknown>;
    const text = typeof b.text === "string" ? b.text.trim() : "";
    if (!text) return { invalid: "text" };
    if (text.length > GEA_MAX_INPUT) return { invalid: "too_long" };

    const history: GeaTurn[] = [];
    if (Array.isArray(b.history)) {
        for (const turn of b.history.slice(-GEA_MEMORY_TURNS)) {
            if (!turn || typeof turn !== "object") continue;
            const t = turn as Record<string, unknown>;
            if (typeof t.asked !== "string" || typeof t.replied !== "string") continue;
            history.push({ asked: t.asked.slice(0, TURN_MAX), replied: t.replied.slice(0, TURN_MAX) });
        }
    }

    let page: GeaWebPage | null = null;
    const p = b.page as Record<string, unknown> | null | undefined;
    if (p && typeof p === "object") {
        if (p.kind === "lead" && typeof p.venueId === "string" && UUID.test(p.venueId)) {
            page = { kind: "lead", venueId: p.venueId };
        } else if (p.kind === "page" && typeof p.name === "string" && (GEA_WEB_PAGES as readonly string[]).includes(p.name)) {
            page = { kind: "page", name: p.name };
        }
    }
    return { text, history, page };
}

/**
 * Il nome del locale arriva dai lead (moduli, import): una riga sola, corta,
 * senza caratteri di controllo né virgolette che chiudano la frase.
 */
function cleanVenueName(name: string | null): string {
    if (!name) return "";
    const visible = Array.from(name, ch => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 || '«»<>"'.includes(ch) ? " " : ch)).join("");
    return visible.replace(/\s+/g, " ").trim().slice(0, 80);
}

/**
 * La pagina aperta entra nella domanda come una frase in fondo: così «questo
 * locale» o «lui» si capiscono come se la persona l'avesse scritto.
 */
export function withPageHint(text: string, page: GeaWebPage | null, venueName: string | null): string {
    if (!page) return text;
    if (page.kind === "lead") {
        const name = cleanVenueName(venueName);
        return name ? `${text}\n\n(Sto guardando la scheda del locale «${name}».)` : text;
    }
    return `${text}\n\n(Sto guardando la pagina ${page.name} del CRM.)`;
}

/** Testi fissi del pannello. */
export const GEA_WEB_TEXT = {
    confirmOnTelegram: "Questo chiede una conferma: dimmelo su Telegram, dove ho i pulsanti Sì e No, oppure fallo tu dalla pagina.",
    notInTeam: "Gea risponde solo alle persone del team del CRM."
};

/**
 * La risposta che torna al pannello. Un comando che su Telegram aspetterebbe
 * «Sì, fallo» qui non parte: lo si dice.
 */
export function webReply(outcome: { status: string; reply: string }): string {
    if (outcome.status === "pending") return GEA_WEB_TEXT.confirmOnTelegram;
    return outcome.reply;
}
