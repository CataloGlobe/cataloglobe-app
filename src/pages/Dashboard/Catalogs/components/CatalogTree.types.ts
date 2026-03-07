import { V2CatalogCategory } from "@/services/supabase/v2/catalogs";

export type CatalogTreeNodeData = V2CatalogCategory & {
    children: CatalogTreeNodeData[];
    directProductCount: number;
    totalProductCount: number;
};

export type CatalogTreeFlatNode = {
    node: CatalogTreeNodeData;
    depth: number;
    hasChildren: boolean;
    isExpanded: boolean;
};

