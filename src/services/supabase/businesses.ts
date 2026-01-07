import { supabase } from "./client";
import type { Business } from "@/types/database";
import type { CatalogTheme } from "@/types/theme";

export async function getUserBusinesses(userId: string): Promise<Business[]> {
    const { data, error } = await supabase
        .from("businesses")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

    if (error) throw error;
    return data ?? [];
}

export async function addBusiness(
    userId: string,
    name: string,
    city: string,
    address: string,
    slug: string,
    type: string
): Promise<Business> {
    const { data, error } = await supabase
        .from("businesses")
        .insert([{ user_id: userId, name, city, address, slug, type }])
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function updateBusiness(
    id: string,
    updates: Partial<Omit<Business, "id" | "user_id" | "created_at">>
) {
    const { error } = await supabase.from("businesses").update(updates).eq("id", id);
    if (error) throw error;
}

export async function deleteBusiness(id: string) {
    const { error } = await supabase.from("businesses").delete().eq("id", id);
    if (error) throw error;
}

export async function getBusinessBySlug(slug: string): Promise<Business | null> {
    const { data, error } = await supabase.from("businesses").select("*").eq("slug", slug).single();

    if (error) return null;
    return data;
}

export async function updateBusinessTheme(businessId: string, theme: CatalogTheme) {
    const { error } = await supabase.from("businesses").update({ theme }).eq("id", businessId);

    if (error) throw error;
}
