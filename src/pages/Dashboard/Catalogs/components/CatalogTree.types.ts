import { V2CatalogCategory } from "@/services/supabase/catalogs";

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

/** Le parole del verticale (§22), già in minuscolo: «sezione», «sezioni», «prodotto», «prodotti». */
export type CatalogTreeLabels = {
    category: string;
    categoryPlural: string;
    product: string;
    productPlural: string;
};
