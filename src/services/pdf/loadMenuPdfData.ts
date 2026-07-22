// Orchestrazione client-side del data layer PDF menu (Stage 1b).
// Compone i pezzi condivisi in sola lettura (nessuna duplicazione dei resolver):
//   loadCatalogById → activity_product_overrides → applyActivityVisibilityOverridesToCatalog
//   + catena stile (regola layout corrente → stile system → DEFAULT_STYLE_TOKENS)
//   + logo tenant + cover/indirizzo sede
// Semantica di stampa v1: override `hide` rimuovono, `disable` ignorati (prodotti
// normali), regole schedule visibilità/prezzo NON applicate (menù atemporale).

import { supabase } from "@/services/supabase/client";
import {
    applyActivityVisibilityOverridesToCatalog,
    loadCatalogById,
    type ActivityProductOverrideRow
} from "@/services/supabase/resolveActivityCatalogs";
import { resolveRulesForActivity } from "@/services/supabase/scheduleResolver";
import { getNowInRome } from "@/services/supabase/schedulingNow";
import { getStyle, listStyles } from "@/services/supabase/styles";
import { getActivityById } from "@/services/supabase/activities";
import { getTenantLogoPublicUrl, getTenantPublicInfo } from "@/services/supabase/tenants";
import { parseTokens } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import type { V2Activity } from "@/types/activity";
import { mapCatalogToMenuPdfData } from "./mapCatalogToMenuPdfData";
import type { MenuPdfBrand, MenuPdfData } from "./menuPdfTypes";

/** Stesso pattern di composizione della pagina pubblica (PublicCatalogReady). */
function composeAddress(activity: V2Activity): string | null {
    const street = [activity.address, activity.street_number].filter(Boolean).join(", ");
    const location = [activity.postal_code, activity.city].filter(Boolean).join(" ");
    return [street, location].filter(Boolean).join(" — ") || null;
}

/**
 * Catena stile: se `styleId` è passato (override runtime dal drawer di export)
 * usa la config di quello stile; altrimenti stile pubblico corrente della sede →
 * stile system del tenant → DEFAULT_STYLE_TOKENS (via parseTokens(null)).
 * Override NON risolvibile (stile eliminato/senza config) → fallback graceful
 * alla catena attuale (non crasha).
 */
async function resolveBrandStyle(
    tenantId: string,
    activityId: string,
    styleId?: string
): Promise<Pick<MenuPdfBrand, "tokens" | "styleName">> {
    if (styleId) {
        const style = await getStyle(styleId, tenantId);
        if (style?.current_version?.config) {
            return { tokens: parseTokens(style.current_version.config), styleName: style.name };
        }
        console.warn(
            `[loadMenuPdfData] stile ${styleId} non risolvibile (eliminato o senza config): fallback alla catena stile della sede.`
        );
    }

    const ruleResolution = await resolveRulesForActivity({
        supabase,
        activityId,
        tenantId,
        now: getNowInRome(),
        includeLayoutStyle: true,
        ruleTypes: ["layout"]
    });

    const layoutStyle = ruleResolution.layout.styleData;
    if (layoutStyle?.config) {
        return { tokens: parseTokens(layoutStyle.config), styleName: layoutStyle.name };
    }

    const styles = await listStyles(tenantId);
    const systemStyle = styles.find(s => s.is_system);
    if (systemStyle?.current_version?.config) {
        return {
            tokens: parseTokens(systemStyle.current_version.config),
            styleName: systemStyle.name
        };
    }

    return { tokens: parseTokens(null), styleName: null };
}

/**
 * Id dello stile pubblico corrente della sede — STESSA catena di
 * `resolveBrandStyle` (regola layout vincente → stile system del tenant), così
 * il drawer di export può preselezionare esattamente lo stile che si otterrebbe
 * senza override. Null se nessuno stile risolvibile (il caller decide il
 * fallback difensivo lato UI). Read-only, nessun side effect.
 */
export async function resolveCurrentStyleId(
    tenantId: string,
    activityId: string
): Promise<string | null> {
    const ruleResolution = await resolveRulesForActivity({
        supabase,
        activityId,
        tenantId,
        now: getNowInRome(),
        includeLayoutStyle: true,
        ruleTypes: ["layout"]
    });

    const layoutStyle = ruleResolution.layout.styleData;
    if (layoutStyle?.config) return layoutStyle.id;

    const styles = await listStyles(tenantId);
    return styles.find(s => s.is_system)?.id ?? null;
}

export async function loadMenuPdfData(
    tenantId: string,
    activityId: string,
    catalogId: string,
    styleId?: string
): Promise<MenuPdfData> {
    const [activity, catalog, tenantInfo, brandStyle] = await Promise.all([
        getActivityById(activityId, tenantId),
        loadCatalogById(catalogId, tenantId),
        getTenantPublicInfo(tenantId),
        resolveBrandStyle(tenantId, activityId, styleId)
    ]);

    if (!activity) throw new Error("Sede non trovata.");
    if (!catalog) throw new Error("Catalogo non trovato.");

    // Override per-sede: solo per i prodotti del catalogo scelto (stesso filtro
    // del resolver condiviso). Le regole schedule NON entrano qui per design.
    const productIds = (catalog.categories ?? []).flatMap(category =>
        category.products.map(p => p.id)
    );

    let overridesByProductId: Record<string, ActivityProductOverrideRow> = {};
    if (productIds.length > 0) {
        const { data, error } = await supabase
            .from("activity_product_overrides")
            .select("product_id, visible_override, mode")
            .eq("activity_id", activityId)
            .in("product_id", productIds);
        if (error) throw error;

        overridesByProductId = Object.fromEntries(
            ((data ?? []) as ActivityProductOverrideRow[]).map(row => [row.product_id, row])
        );
    }

    // baseCatalog = catalog stesso: nessun layer schedule da "ripristinare".
    const curatedCatalog =
        applyActivityVisibilityOverridesToCatalog(catalog, catalog, overridesByProductId) ??
        catalog;

    const brand: MenuPdfBrand = {
        ...brandStyle,
        logoUrl: tenantInfo?.logo_url ? getTenantLogoPublicUrl(tenantInfo.logo_url) : null,
        coverUrl: activity.cover_image ?? null
    };

    return mapCatalogToMenuPdfData(curatedCatalog, {
        brand,
        activityName: activity.name,
        slug: activity.slug,
        address: composeAddress(activity)
    });
}
