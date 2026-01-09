import { supabase } from "./client";
import type { Business } from "@/types/database";
import type { CatalogTheme } from "@/types/theme";

/* =====================================================
   COSTANTI & HELPERS (privati)
===================================================== */

const BUSINESS_COVERS_BUCKET = "business-covers";

function toSafeSlug(input: string) {
    return input
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-") // tutto ciò che non è alfanumerico diventa "-"
        .replace(/^-+|-+$/g, "") // via i "-" all’inizio/fine
        .slice(0, 60); // limite ragionevole (evita path lunghissimi)
}

function buildBusinessFolder(slug: string, businessId: string) {
    const safeSlug = toSafeSlug(slug) || "business";
    return `${safeSlug}__${businessId}`;
}

function getFileExtension(file: File) {
    const mimeExt = file.type?.split("/")[1]?.toLowerCase();
    if (mimeExt) return mimeExt;

    const nameExt = file.name.split(".").pop()?.toLowerCase();
    return nameExt || "jpg";
}

function buildCoverPath(slug: string, businessId: string, extension: string) {
    return `${buildBusinessFolder(slug, businessId)}/cover.${extension}`;
}
/* =====================================================
   QUERY (READ)
===================================================== */

export async function getUserBusinesses(userId: string): Promise<Business[]> {
    const { data, error } = await supabase
        .from("businesses")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

    if (error) throw error;
    return data ?? [];
}

export async function getBusinessBySlug(slug: string): Promise<Business | null> {
    const { data, error } = await supabase.from("businesses").select("*").eq("slug", slug).single();

    if (error) return null;
    return data;
}

/* =====================================================
   MUTATIONS (DB)
===================================================== */

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

export async function deleteBusinessAtomic(businessId: string) {
    const { error } = await supabase.functions.invoke("delete-business", {
        body: { businessId }
    });

    if (error) throw error;
}

/* =====================================================
   THEME
===================================================== */

export async function updateBusinessTheme(businessId: string, theme: CatalogTheme) {
    const { error } = await supabase.from("businesses").update({ theme }).eq("id", businessId);

    if (error) throw error;
}

/* =====================================================
   STORAGE (COVER IMAGE)
===================================================== */

export async function uploadBusinessCover(
    business: Pick<Business, "id" | "slug">,
    file: File
): Promise<string> {
    const extension = getFileExtension(file);
    const path = buildCoverPath(business.slug, business.id, extension);

    // 1. Upload (upsert per sovrascrivere)
    const { error: uploadError } = await supabase.storage
        .from(BUSINESS_COVERS_BUCKET)
        .upload(path, file, {
            upsert: true,
            cacheControl: "3600",
            contentType: file.type || undefined
        });

    if (uploadError) throw uploadError;

    // 2. Public URL
    const { data } = supabase.storage.from(BUSINESS_COVERS_BUCKET).getPublicUrl(path);

    const publicUrl = data.publicUrl;
    if (!publicUrl) {
        throw new Error("Impossibile ottenere la public URL della cover.");
    }

    // 3. Update DB
    const { error: dbError } = await supabase
        .from("businesses")
        .update({ cover_image: publicUrl })
        .eq("id", business.id);

    if (dbError) throw dbError;

    return publicUrl;
}

export async function deleteBusinessAssets(businessId: string) {
    const bucket = supabase.storage.from(BUSINESS_COVERS_BUCKET);

    // 1. Lista tutto il bucket (primo livello)
    const { data: folders, error: listError } = await bucket.list("", {
        limit: 1000
    });

    if (listError) throw listError;
    if (!folders || folders.length === 0) return;

    // 2. Trova le "cartelle" che finiscono con __{businessId}
    const targetFolders = folders
        .filter(item => item.name.endsWith(`__${businessId}`))
        .map(item => item.name);

    if (targetFolders.length === 0) return;

    // 3. Lista tutti i file dentro ogni cartella
    const filesToDelete: string[] = [];

    for (const folder of targetFolders) {
        const { data: files, error } = await bucket.list(folder, {
            limit: 1000
        });

        if (error) throw error;

        files?.forEach(file => {
            filesToDelete.push(`${folder}/${file.name}`);
        });
    }

    if (filesToDelete.length === 0) return;

    // 4. Rimuovi tutti i file
    const { error: removeError } = await bucket.remove(filesToDelete);
    if (removeError) throw removeError;
}
