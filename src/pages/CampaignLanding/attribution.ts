/**
 * Provenienza della visita per il form contatti: UTM, referrer e pagina
 * d'arrivo, letti all'arrivo sulla landing e conservati in sessionStorage
 * finché la scheda resta aperta (il form sta in fondo, dopo navigazioni
 * interne come lo sheet delle demo). Ogni accesso allo storage è in
 * try/catch: in navigazione privata o con i dati bloccati si invia quello che
 * c'è nell'URL corrente.
 */

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

export type Attribution = Partial<Record<(typeof UTM_KEYS)[number], string>> & {
    referrer?: string;
    landing_path?: string;
};

const STORAGE_KEY = "cg-landing-attribution";

/** UTM presenti in una query string (vuote scartate). */
export function readUtm(search: string): Attribution {
    const params = new URLSearchParams(search);
    const out: Attribution = {};
    for (const key of UTM_KEYS) {
        const value = params.get(key)?.trim();
        if (value) out[key] = value;
    }
    return out;
}

function load(): Attribution | null {
    try {
        const raw = window.sessionStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as Attribution) : null;
    } catch {
        return null;
    }
}

let current: Attribution | null = null;

/**
 * All'arrivo sulla landing. Se l'URL porta UTM, vincono (una nuova campagna
 * sostituisce la precedente); altrimenti resta quanto salvato prima.
 */
export function captureAttribution(): void {
    if (typeof window === "undefined") return;
    const utm = readUtm(window.location.search);
    const saved = load();
    if (saved && Object.keys(utm).length === 0) {
        current = saved;
        return;
    }
    current = {
        ...utm,
        referrer: document.referrer || undefined,
        landing_path: window.location.pathname
    };
    try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
        // storage non disponibile: resta in memoria per questa pagina
    }
}

/** Provenienza da inviare col form. */
export function getAttribution(): Attribution {
    return current ?? load() ?? {};
}
