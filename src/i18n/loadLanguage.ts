import i18n from "i18next";

/** I namespace della pagina pubblica; `admin` resta fuori. */
const PUBLIC_NAMESPACES = ["common", "public", "errors"] as const;

type Loaders = Record<string, () => Promise<Record<string, unknown>>>;

// Li registra `./public.ts` (bundle pubblico): un chunk lazy per file, si
// scarica solo la lingua chiesta. Nel back office (`./index.ts`, tutte le
// lingue già dentro) restano vuoti e non servono.
let loaders: Loaders = {};

export function registerLanguageLoaders(next: Loaders): void {
    loaders = next;
}

/** Aggiunge a i18n i namespace pubblici di `lng` che mancano. Nel back office
    (`./index.ts`, tutte le lingue già dentro) non scarica niente. */
export async function loadPublicLanguage(lng: string): Promise<void> {
    await Promise.all(
        PUBLIC_NAMESPACES.filter(ns => !i18n.hasResourceBundle(lng, ns)).map(async ns => {
            const load = loaders[`./locales/${lng}/${ns}.json`];
            if (!load) return; // lingua senza file: resta il fallback italiano
            i18n.addResourceBundle(lng, ns, await load(), true, true);
        })
    );
}

let requested: string | null = null;

/**
 * `i18n.changeLanguage` per la pagina pubblica: prima carica la lingua, poi la
 * applica. Se nel frattempo è stata chiesta un'altra lingua, vince l'ultima.
 * Se il caricamento fallisce (rete), cambia lo stesso: i testi mancanti
 * ricadono sull'italiano invece di lasciare la pagina nella lingua vecchia.
 */
export async function changePublicLanguage(lng: string): Promise<void> {
    requested = lng;
    try {
        await loadPublicLanguage(lng);
    } catch {
        /* rete: fallback italiano */
    }
    if (requested !== lng || i18n.language === lng) return;
    await i18n.changeLanguage(lng);
}
