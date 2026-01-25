import type { Business } from "./database";

export type BusinessType = Business["type"];

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
    totalBusinesses: number;
    onEdit: (business: BusinessWithCapabilities) => void;
    onDelete: (id: string) => void;
    onOpenReviews: (businessId: string) => void;
}

export interface BusinessListProps {
    businesses: BusinessWithCapabilities[];
    onEdit: (business: BusinessWithCapabilities) => void;
    onDelete: (id: string) => void;
    onOpenReviews: (id: string) => void;
}

export type BusinessWithCapabilities = Business & {
    compatible_collection_count: number;
    scheduled_compatible_collection_count: number;
};
