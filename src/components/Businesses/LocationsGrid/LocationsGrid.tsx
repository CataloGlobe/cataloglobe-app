import React from "react";
import { BusinessCard } from "../BusinessCard/BusinessCard";
import type { BusinessWithCapabilities } from "@/types/Businesses";
import type { ActiveCatalogMeta } from "@/services/supabase/activeCatalog";
import type { CatalogFetchStatus } from "@/utils/activeCatalogStatus";
import { CardGrid } from "@/components/ui/CardGrid/CardGrid";

interface LocationsGridProps {
    businesses: BusinessWithCapabilities[];
    isLoading?: boolean;
    onEdit: (business: BusinessWithCapabilities) => void;
    onDelete?: (id: string) => void;
    activeCatalogsMap?: Record<string, ActiveCatalogMeta>;
    catalogsStatus?: CatalogFetchStatus;
    onManageAvailability?: (id: string, name: string) => void;
    pendingReservationsMap?: Record<string, number>;
}

export const LocationsGrid: React.FC<LocationsGridProps> = ({
    businesses,
    isLoading = false,
    onEdit,
    onDelete,
    activeCatalogsMap,
    catalogsStatus,
    onManageAvailability,
    pendingReservationsMap
}) => {
    return (
        <CardGrid loading={isLoading} skeletonCount={3} aria-label="Sedi">
            {businesses.map(business => (
                <BusinessCard
                    key={business.id}
                    business={business}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    activeCatalog={activeCatalogsMap?.[business.id]}
                    catalogsStatus={catalogsStatus}
                    onManageAvailability={onManageAvailability}
                    pendingReservations={pendingReservationsMap?.[business.id]}
                />
            ))}
        </CardGrid>
    );
};
