import React from "react";
import Text from "@components/ui/Text/Text";
import { BusinessCard } from "../BusinessCard/BusinessCard";
import type { BusinessListProps } from "@/types/Businesses";
import styles from "./BusinessList.module.scss";

export const BusinessList: React.FC<BusinessListProps> = ({
    businesses,
    onEdit,
    onDelete,
    onOpenReviews
}) => {
    if (businesses.length === 0) {
        return (
            <div className={styles.emptyState}>
                <Text as="h3" variant="title-sm" weight={600}>
                    Nessuna attività trovata
                </Text>
                <Text variant="body" colorVariant="muted">
                    Aggiungi una nuova attività usando il form sulla sinistra.
                </Text>
            </div>
        );
    }

    return (
        <div className={styles.listWrapper}>
            {businesses.map(business => (
                <BusinessCard
                    key={business.id}
                    business={business}
                    totalBusinesses={businesses.length}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onOpenReviews={onOpenReviews}
                />
            ))}
        </div>
    );
};
