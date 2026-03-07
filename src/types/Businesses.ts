import type { V2Activity } from "./v2/activity";
import type { ActiveCatalogMeta } from "@/services/supabase/v2/activeCatalog";

export type { ActiveCatalogMeta, V2Activity };

export type BusinessType = V2Activity["activity_type"];

export interface BusinessFormValues {
    name: string;
    city: string;
    address: string;
    slug: string;
    type: BusinessType;
    coverPreview: string | null;
}

export interface BusinessCardProps {
    business: BusinessWithCapabilities;
    onEdit: (business: BusinessWithCapabilities) => void;
    onDelete: (id: string) => void;
    onOpenReviews: (businessId: string) => void;
    activeCatalog?: ActiveCatalogMeta | null;
    onManageAvailability?: (id: string, name: string) => void;
}

export interface BusinessListProps {
    businesses: BusinessWithCapabilities[];
    viewMode?: "grid" | "list";
    onEdit: (business: BusinessWithCapabilities) => void;
    onDelete: (id: string) => void;
    onOpenReviews: (id: string) => void;
    activeCatalogsMap?: Record<string, ActiveCatalogMeta>;
    onManageAvailability?: (id: string, name: string) => void;
}

export type BusinessWithCapabilities = V2Activity & {
    // Campi legacy per retrocompatibilità UI
    compatible_collection_count?: number;
    scheduled_compatible_collection_count?: number;
    active_primary_collection_name?: string | null;
    fallback_primary_collection_name?: string | null;
    active_special_collection_name?: string | null;
};
