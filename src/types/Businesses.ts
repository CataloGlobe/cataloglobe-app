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
    business: Business;
    onEdit: (business: Business) => void;
    onDelete: (id: string) => void;
    onOpenReviews: (businessId: string) => void;
}

export interface BusinessListProps {
    businesses: Business[];
    onEdit: (business: Business) => void;
    onDelete: (id: string) => void;
    onOpenReviews: (id: string) => void;
}
