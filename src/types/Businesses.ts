import type { V2Activity } from "./activity";
import type { ActiveCatalogMeta } from "@/services/supabase/activeCatalog";

export type { ActiveCatalogMeta, V2Activity };

export type BusinessType = V2Activity["activity_type"];

export interface BusinessFormValues {
    name: string;
    city: string;
    address: string;
    street_number: string;
    postal_code: string;
    province: string;
    slug: string;
    coverPreview: string | null;
}

/**
 * Stato inline del campo slug nei form sede (create + edit).
 * - warning: solo edit, slug diverso dall'originale
 * - conflict: slug già usato, con suggerimenti alternativi verificati
 */
export type SlugInlineState =
    | { type: "idle" }
    | { type: "warning" }
    | { type: "conflict"; suggestions: string[] };

export interface BusinessCardProps {
    business: BusinessWithCapabilities;
    onEdit: (business: BusinessWithCapabilities) => void;
    onDelete?: (id: string) => void;
    onOpenReviews: (businessId: string) => void;
    activeCatalog?: ActiveCatalogMeta | null;
    catalogsLoading?: boolean;
    onManageAvailability?: (id: string, name: string) => void;
}

export interface BusinessListProps {
    businesses: BusinessWithCapabilities[];
    viewMode?: "grid" | "list";
    onEdit: (business: BusinessWithCapabilities) => void;
    onDelete?: (id: string) => void;
    onOpenReviews: (id: string) => void;
    activeCatalogsMap?: Record<string, ActiveCatalogMeta>;
    catalogsLoading?: boolean;
    onManageAvailability?: (id: string, name: string) => void;
    onCreateClick?: () => void;
    /**
     * Calcolata dal chiamante (che possiede gli stati dei filtri) e usata per
     * distinguere "nessuna sede esiste" da "la ricerca non ha prodotto
     * risultati": `businesses` arriva già filtrata, quindi da sola non permette
     * di riconoscere i due casi.
     */
    hasActiveFilter?: boolean;
}

export type BusinessWithCapabilities = V2Activity & {
    // Campi legacy per retrocompatibilità UI
    compatible_collection_count?: number;
    scheduled_compatible_collection_count?: number;
    active_primary_collection_name?: string | null;
    fallback_primary_collection_name?: string | null;
    active_special_collection_name?: string | null;
};
