import { supabase } from "./client";
import type { ItemCategory } from "@/types/database";
import type { CatalogType } from "@/types/catalog";

export async function createItemCategory(data: {
    name: string;
    type: CatalogType;
}): Promise<ItemCategory> {
    const slug = data.name.toLowerCase().trim().replace(/\s+/g, "-");

    const { data: category, error } = await supabase
        .from("item_categories")
        .insert({
            name: data.name,
            slug,
            type: data.type
        })
        .select()
        .single();

    if (error) throw error;
    return category;
}
