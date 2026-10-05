/**
 * Gea dal computer (canvas V9): quale pagina sta guardando la persona, e le
 * domande pronte sotto il pannello. Puro.
 */

/** Come `GeaWebPage` in `_shared/crmGeaWeb.ts` (che importa Deno-style: niente @shared). */
export type GeaWebPage = { kind: "lead"; venueId: string } | { kind: "page"; name: string };

const PAGES: Record<string, string> = {
    "/admin": "Home",
    "/admin/lead": "Lead",
    "/admin/agenda": "Agenda",
    "/admin/agenti": "Agenti",
    "/admin/costi": "Costi",
    "/admin/altro": "Altro"
};

/** La pagina del CRM aperta, o null fuori dal CRM (Supporto, Incidenti). */
export function geaPageOf(pathname: string): GeaWebPage | null {
    const path = pathname.replace(/\/+$/, "") || "/";
    const lead = /^\/admin\/lead\/([^/]+)$/.exec(path);
    if (lead) return { kind: "lead", venueId: lead[1] };
    const name = PAGES[path];
    return name ? { kind: "page", name } : null;
}

/** Il pulsante di Gea c'è solo nelle pagine del CRM. */
export function isCrmPath(pathname: string): boolean {
    return geaPageOf(pathname) !== null;
}

/** Le domande pronte: sulla scheda di un lead parlano di lui. */
export function geaSuggestions(page: GeaWebPage | null): string[] {
    if (page?.kind === "lead") return ["Riassumi questo lead", "Scrivimi un messaggio per lui"];
    return ["Chi devo chiamare oggi?", "Riassumi la giornata", "Chi è fermo da giorni?"];
}

/** «vede la pagina che hai aperto», o la scheda del lead. */
export function geaPageCaption(page: GeaWebPage | null): string {
    if (!page) return "vede il CRM";
    return page.kind === "lead" ? "vede la scheda che hai aperto" : "vede la pagina che hai aperto";
}

/**
 * L'errore della chiamata in una frase: la funzione non ancora rilasciata
 * (404, o nessuna risposta) dice che Gea qui non è attiva; fuori dal team, chi
 * può usarla; il resto «riprova».
 */
export function geaErrorMessage(err: unknown): string {
    const e = (err ?? {}) as { name?: string; context?: { status?: number } };
    const status = e.context?.status;
    if (status === 404 || e.name === "FunctionsFetchError" || e.name === "FunctionsRelayError") {
        return "Gea sul computer non è ancora attiva: manca il rilascio della sua funzione. Su Telegram risponde già.";
    }
    if (status === 403) return "Gea risponde solo alle persone del team del CRM.";
    return "Gea non ha risposto. Riprova tra poco.";
}
