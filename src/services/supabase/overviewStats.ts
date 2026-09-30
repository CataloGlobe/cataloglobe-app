import { supabase } from "@/services/supabase/client";

/**
 * Stato di configurazione del tenant per la checklist della Panoramica.
 *
 * Ogni campo risponde a "il passo è stato compiuto?", NON a "quale sede è
 * coperta?": la verifica per-sede (che deve espandere `apply_to_all` e i
 * target `activity_group`) non serve alla checklist e vive altrove.
 *
 * I criteri sono volutamente più severi di un `count > 0` sulla tabella
 * principale, che mente in tre casi su quattro: una sede sospesa non è
 * raggiungibile, un catalogo appena creato è vuoto, una regola in bozza (o con
 * `catalog_id` NULL) fa risolvere la pagina pubblica senza menù.
 */
export type TenantSetupStatus = {
    /** ≥1 sede, in qualunque stato. Distingue "non ne hai" da "ce l'hai ma è
     *  sospesa": due situazioni con azioni diverse, non un unico "manca". */
    hasAnyLocation: boolean;
    /** ≥1 sede con `status='active'`: una sede sospesa non serve la pagina pubblica. */
    hasActiveLocation: boolean;
    hasProducts: boolean;
    /** ≥1 prodotto associato a una categoria di un menù. Un menù senza prodotti
     *  esiste in `catalogs` ma resta vuoto per il cliente. */
    hasPopulatedCatalog: boolean;
    /** ≥1 regola `layout` attiva con un catalogo collegato. */
    hasActiveLayoutRule: boolean;
};

/**
 * Sedi del tenant. `onlyActive` restringe alle sedi pubblicate: una sede
 * `inactive` esiste ma non è raggiungibile dal QR, quindi le due domande
 * ("ne hai?" / "ne hai una online?") hanno risposte diverse e azioni diverse.
 */
async function countLocations(tenantId: string, onlyActive: boolean): Promise<number> {
    let query = supabase
        .from("activities")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId);

    if (onlyActive) query = query.eq("status", "active");

    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
}

async function countProducts(tenantId: string): Promise<number> {
    const { count, error } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId);

    if (error) throw error;
    return count ?? 0;
}

/**
 * Associazioni prodotto↔categoria di un menù. Una sola query copre entrambe le
 * domande: "il menù ha prodotti" e "esiste un prodotto finito in un menù".
 * Il drawer di creazione menù chiede solo il nome, quindi un catalogo vuoto è
 * lo stato normale subito dopo la creazione, non un caso limite.
 */
async function countCatalogProducts(tenantId: string): Promise<number> {
    const { count, error } = await supabase
        .from("catalog_category_products")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId);

    if (error) throw error;
    return count ?? 0;
}

/**
 * Regola `layout` pubblicabile: `enabled=true` E con un `schedule_layout`
 * collegato che punta a un catalogo.
 *
 * Due dettagli dello schema che rendono il filtro necessario:
 * - `schedules.enabled` ha DEFAULT `true`, quindi l'esistenza della riga non
 *   dice nulla sullo stato: va letto il valore.
 * - `schedule_layout.catalog_id` è NULLABLE. Con `catalog_id` NULL il resolver
 *   ritorna il payload senza catalogo e la pagina pubblica resta vuota, quindi
 *   una regola così non conta come passo compiuto.
 *
 * `!inner` forza l'INNER JOIN: senza, PostgREST conterebbe anche le regole
 * prive di riga in `schedule_layout`.
 */
async function countActiveLayoutRules(tenantId: string): Promise<number> {
    const { count, error } = await supabase
        .from("schedules")
        .select("id, schedule_layout!inner(catalog_id)", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("rule_type", "layout")
        .eq("enabled", true)
        .not("schedule_layout.catalog_id", "is", null);

    if (error) throw error;
    return count ?? 0;
}

/**
 * Stato di configurazione del tenant in una sola chiamata (5 query in
 * parallelo). Propaga l'errore al chiamante come gli altri service: un
 * fallimento RLS non deve degradare silenziosamente in "non configurato".
 */
export async function getTenantSetupStatus(tenantId: string): Promise<TenantSetupStatus> {
    const [locations, activeLocations, products, catalogProducts, layoutRules] = await Promise.all([
        countLocations(tenantId, false),
        countLocations(tenantId, true),
        countProducts(tenantId),
        countCatalogProducts(tenantId),
        countActiveLayoutRules(tenantId)
    ]);

    return {
        hasAnyLocation: locations > 0,
        hasActiveLocation: activeLocations > 0,
        hasProducts: products > 0,
        hasPopulatedCatalog: catalogProducts > 0,
        hasActiveLayoutRule: layoutRules > 0
    };
}

/**
 * Le otto capacità del blocco «Cosa hai attivato» (Panoramica, §38.3):
 * non "quanti ne ho" ma "cosa di questo prodotto sto usando". Ogni voce
 * porta i numeri che il dettaglio mostra; `active` è derivato qui, una
 * volta, così la pagina non ripete il criterio.
 *
 * Traduzioni non è qui: è «In arrivo» per definizione (§25.10), nessuna
 * query.
 */
export type TenantCapabilities = {
    styles: { active: boolean; total: number; inUse: number };
    featured: { active: boolean; total: number; published: number };
    ordering: { active: boolean; locations: number; tables: number; ordersToday: number };
    reservations: { active: boolean; locations: number; pending: number };
    reviews: { active: boolean; total: number; pending: number };
    stories: { active: boolean; published: number };
    team: { active: boolean; members: number };
};

async function countRows(
    build: () => PromiseLike<{ count: number | null; error: { message: string } | null }>
): Promise<number> {
    const { count, error } = await build();
    if (error) throw error;
    return count ?? 0;
}

/**
 * Tredici count in parallelo più la RPC del giorno operativo (che precede il
 * count degli ordini): 14 chiamate, tutte `head: true`, nessuna riga
 * scaricata. Misurato su staging (McDonald's, 4 sedi, 21/09/2026): ~200–260 ms
 * a connessione calda, 1,3 s la prima volta; le 5 count della checklist
 * costano 184 ms. Stesso ordine di grandezza, non una seconda pagina.
 */
export async function getTenantCapabilities(tenantId: string): Promise<TenantCapabilities> {
    const t = (table: Parameters<typeof supabase.from>[0]) =>
        supabase.from(table).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);

    const ordersToday = async () => {
        const { data: dayStart, error } = await supabase.rpc("get_operative_day_start");
        if (error) throw error;
        return countRows(() => t("orders").gte("submitted_at", dayStart as string));
    };

    const [
        stylesTotal,
        stylesInUse,
        featuredTotal,
        featuredPublished,
        orderingLocations,
        tables,
        orders,
        reservationLocations,
        reservationsPending,
        reviewsTotal,
        reviewsPending,
        storiesPublished,
        members
    ] = await Promise.all([
        countRows(() => t("styles").eq("is_system", false)),
        countRows(() => t("schedule_layout")),
        countRows(() => t("featured_contents")),
        countRows(() => t("featured_contents").eq("status", "published")),
        countRows(() => t("activities").eq("status", "active").eq("ordering_enabled", true)),
        countRows(() => t("tables").is("deleted_at", null)),
        ordersToday(),
        countRows(() => t("activities").eq("status", "active").eq("enable_reservations", true)),
        countRows(() => t("reservations").eq("status", "pending")),
        countRows(() => t("reviews")),
        countRows(() => t("reviews").eq("status", "pending")),
        countRows(() => t("stories").eq("status", "published")),
        // Membri accettati, più il proprietario che non ha riga (CLAUDE.md).
        countRows(() => t("tenant_memberships").eq("status", "active")).then(n => n + 1)
    ]);

    return {
        styles: { active: stylesTotal > 0, total: stylesTotal, inUse: stylesInUse },
        featured: { active: featuredPublished > 0, total: featuredTotal, published: featuredPublished },
        ordering: { active: orderingLocations > 0, locations: orderingLocations, tables, ordersToday: orders },
        reservations: { active: reservationLocations > 0, locations: reservationLocations, pending: reservationsPending },
        reviews: { active: reviewsTotal > 0, total: reviewsTotal, pending: reviewsPending },
        stories: { active: storiesPublished > 0, published: storiesPublished },
        team: { active: members > 1, members }
    };
}
