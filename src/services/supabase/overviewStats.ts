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
