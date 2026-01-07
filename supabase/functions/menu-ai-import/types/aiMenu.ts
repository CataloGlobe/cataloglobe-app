// src/types used ONLY inside the function (no external imports)

export type ParsedMenuItem = {
    id: string;
    name: string;
    description?: string;
    price?: number;
    currency?: string;
    allergens?: string[];
};

export type ParsedMenuCategory = {
    id: string;
    name: string;
    notes?: string;
    items: ParsedMenuItem[];
};

export type ParsedMenu = {
    language?: string;
    categories: ParsedMenuCategory[];
};
