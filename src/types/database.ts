import type { CatalogTheme } from "@/types/theme";
import { CatalogType } from "./catalog";

/* ============================
   GENERIC TYPES
============================ */

export interface User {
    id: string;
    email: string;
    name: string;
    created_at: string;
}

export interface Profile {
    id: string;
    name: string | null;
    avatar_url: string | null;
    created_at: string;
}

export interface Review {
    id: string;
    user_id: string;
    business_id: string | null;
    rating: number;
    comment: string;
    source: string;
    created_at: string;
    updated_at: string;
    response?: string | null;
    response_date?: string | null;
    tags?: string[];
}

/* ============================
   BUSINESS
============================ */

export type BusinessType =
    | "restaurant"
    | "bar"
    | "hotel"
    | "hairdresser"
    | "beauty"
    | "shop"
    | "other";

export interface Business {
    id: string;
    user_id: string;
    name: string;
    city: string | null;
    address: string | null;
    slug: string;
    type: BusinessType;
    cover_image: string | null;
    theme: CatalogTheme | null;
    // active_collection_id: string | null;
    // active_special_collection_id: string | null;
    created_at: string;
    updated_at: string;
}

/* ============================
   DOMAIN TYPES
============================ */

export interface Item {
    id: string;
    name: string;
    description: string | null;
    base_price: number | null;
    duration: number | null;
    metadata: { image?: string | null; allergens?: string[] } | null;
    category_id: string;
    created_at: string;
    updated_at: string;
}

export interface ItemCategory {
    id: string;
    name: string;
    slug: string;
    type: CatalogType;
    created_at: string;
}

export interface ItemWithCategory extends Item {
    category: ItemCategory;
}

export interface Collection {
    id: string;
    name: string;
    description: string | null;
    collection_type: CatalogType;
    style: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
    kind: "standard" | "special";
}

export interface CollectionSection {
    id: string;
    collection_id: string;
    base_category_id: string;
    label: string;
    order_index: number;
}

export interface CollectionItem {
    id: string;
    collection_id: string;
    section_id: string;
    item_id: string;
    order_index: number;
    visible: boolean;
}

export interface BusinessCollection {
    id: string;
    business_id: string;
    collection_id: string;
    is_active: boolean;
    order_index: number;
    created_at: string;
}

export interface BusinessCollectionItemOverride {
    id: string;
    business_id: string;
    collection_id: string;
    item_id: string;
    price_override: number | null;
    visible_override: boolean | null;
    updated_at: string;
}

export interface BusinessItemOverride {
    id: string;
    business_id: string;
    item_id: string;
    price_override: number | null;
    visible_override: boolean | null;
    created_at: string;
    updated_at: string;
}

export interface CollectionItemWithItem {
    id: string;
    collection_id: string;
    section_id: string;
    order_index: number;
    visible: boolean;
    item: ItemWithCategory;
}

export interface OverrideRowForUI {
    item_id: string;
    price_override: number | null;
    visible_override: boolean | null;
}
