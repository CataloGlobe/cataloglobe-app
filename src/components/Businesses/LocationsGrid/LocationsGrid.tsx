import React from "react";
import { BusinessCard } from "../BusinessCard/BusinessCard";
import type { BusinessWithCapabilities } from "@/types/Businesses";
import type { ActiveCatalogMeta } from "@/services/supabase/activeCatalog";
import styles from "./LocationsGrid.module.scss";

interface LocationsGridProps {
    businesses: BusinessWithCapabilities[];
    onEdit: (business: BusinessWithCapabilities) => void;
    onDelete: (id: string) => void;
    onOpenReviews: (id: string) => void;
    activeCatalogsMap?: Record<string, ActiveCatalogMeta>;
    catalogsLoading?: boolean;
    onManageAvailability?: (id: string, name: string) => void;
}

export const LocationsGrid: React.FC<LocationsGridProps> = ({
    businesses,
    onEdit,
    onDelete,
    onOpenReviews,
    activeCatalogsMap,
    catalogsLoading,
    onManageAvailability
}) => {
    return (
        <div className={styles.grid}>
            {businesses.map(business => (
                <BusinessCard
                    key={business.id}
                    business={business}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onOpenReviews={onOpenReviews}
                    activeCatalog={activeCatalogsMap?.[business.id]}
                    catalogsLoading={catalogsLoading}
                    onManageAvailability={onManageAvailability}
                />
            ))}
        </div>
    );
};
