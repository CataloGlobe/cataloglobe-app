import { supabase } from "../client";
import type { V2Activity } from "@/types/v2/activity";

const BUSINESS_COVERS_BUCKET = "business-covers";

/* =====================================================
   HELPERS (privati)
 ===================================================== */

function toSafeSlug(input: string) {
    return input
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
}

function buildActivityFolder(slug: string, activityId: string) {
    const safeSlug = toSafeSlug(slug) || "activity";
    return `${safeSlug}__${activityId}`;
}

function getFileExtension(file: File) {
    const mimeExt = file.type?.split("/")[1]?.toLowerCase();
    if (mimeExt) return mimeExt;
    const nameExt = file.name.split(".").pop()?.toLowerCase();
    return nameExt || "jpg";
}

function buildCoverPath(slug: string, activityId: string, extension: string) {
    return `${buildActivityFolder(slug, activityId)}/cover.${extension}`;
}

/* =====================================================
   QUERY (READ)
 ===================================================== */

/**
 * Recupera tutte le attività per un determinato tenant (user_id).
 */
export async function getActivities(tenantId: string): Promise<V2Activity[]> {
    const { data, error } = await supabase
        .from("v2_activities")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true });

    if (error) throw error;
    return data ?? [];
}

/**
 * Recupera una singola attività tramite slug.
 */
export async function getActivityBySlug(slug: string): Promise<V2Activity | null> {
    const { data, error } = await supabase
        .from("v2_activities")
        .select("*")
        .eq("slug", slug)
        .single();

    if (error) return null;
    return data;
}

/**
 * Recupera una singola attività tramite ID.
 */
export async function getActivityById(id: string): Promise<V2Activity | null> {
    const { data, error } = await supabase.from("v2_activities").select("*").eq("id", id).single();

    if (error) return null;
    return data;
}

/* =====================================================
   MUTATIONS (DB)
 ===================================================== */

export async function createActivity(
    tenantId: string,
    params: {
        name: string;
        slug: string;
        activity_type: string | null;
        city: string | null;
        address: string | null;
    }
): Promise<V2Activity> {
    const { data, error } = await supabase
        .from("v2_activities")
        .insert([
            {
                id: crypto.randomUUID(),
                tenant_id: tenantId,
                ...params,
                status: "active"
            }
        ])
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function updateActivity(
    id: string,
    updates: Partial<Omit<V2Activity, "id" | "tenant_id" | "created_at">>
): Promise<V2Activity> {
    const { data, error } = await supabase
        .from("v2_activities")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function deleteActivity(id: string) {
    // Nota: l'eliminazione atomica (bucket + db) è gestita via Edge Function
    // o manualmente chiamando prima deleteActivityAssets.
    const { error } = await supabase.from("v2_activities").delete().eq("id", id);

    if (error) throw error;
}

/**
 * Eliminazione atomica tramite Edge Function (replica logica legacy)
 */
export async function deleteActivityAtomic(activityId: string) {
    const { error } = await supabase.functions.invoke("delete-business", {
        body: { businessId: activityId }
    });

    if (error) throw error;
}

/* =====================================================
   STORAGE (COVER IMAGE)
 ===================================================== */

export async function uploadActivityCover(
    activity: Pick<V2Activity, "id" | "slug">,
    file: File
): Promise<string> {
    const extension = getFileExtension(file);
    const path = buildCoverPath(activity.slug, activity.id, extension);

    // 1. Upload
    const { error: uploadError } = await supabase.storage
        .from(BUSINESS_COVERS_BUCKET)
        .upload(path, file, {
            upsert: true,
            cacheControl: "3600",
            contentType: file.type || undefined
        });

    if (uploadError) throw uploadError;

    // 2. Get URL
    const { data } = supabase.storage.from(BUSINESS_COVERS_BUCKET).getPublicUrl(path);

    const publicUrl = data.publicUrl;
    if (!publicUrl) throw new Error("Impossibile ottenere public URL");

    // 3. Update DB
    await updateActivity(activity.id, { cover_image: publicUrl });

    return publicUrl;
}
