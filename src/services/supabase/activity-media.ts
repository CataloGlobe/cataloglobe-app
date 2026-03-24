import { supabase } from "@/services/supabase/client";
import { updateActivity } from "@/services/supabase/activities";
import type { ActivityMedia } from "@/types/activity-media";
import type { V2Activity } from "@/types/activity";

const BUCKET = "business-covers";

function buildGalleryPath(activity: Pick<V2Activity, "id" | "slug">, file: File): string {
    const safeSlug = activity.slug
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "activity";
    const ext =
        file.type?.split("/")[1]?.toLowerCase() ||
        file.name.split(".").pop()?.toLowerCase() ||
        "jpg";
    return `${safeSlug}__${activity.id}/gallery/${crypto.randomUUID()}.${ext}`;
}

export async function getActivityMedia(activityId: string): Promise<ActivityMedia[]> {
    const { data, error } = await supabase
        .from("activity_media")
        .select("*")
        .eq("activity_id", activityId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

    if (error) throw error;
    return data ?? [];
}

export async function uploadAndInsertActivityMedia(
    activity: Pick<V2Activity, "id" | "slug" | "tenant_id">,
    file: File
): Promise<ActivityMedia> {
    const path = buildGalleryPath(activity, file);

    const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
            upsert: false,
            cacheControl: "3600",
            contentType: file.type || undefined
        });

    if (uploadError) throw uploadError;

    const {
        data: { publicUrl }
    } = supabase.storage.from(BUCKET).getPublicUrl(path);

    if (!publicUrl) throw new Error("Impossibile ottenere public URL");

    const { data, error } = await supabase
        .from("activity_media")
        .insert({ activity_id: activity.id, url: publicUrl, type: "image" })
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function deleteActivityMedia(id: string): Promise<void> {
    const { error } = await supabase
        .from("activity_media")
        .delete()
        .eq("id", id);

    if (error) throw error;
}

export async function setMediaAsCover(
    mediaId: string,
    mediaUrl: string,
    activity: Pick<V2Activity, "id" | "tenant_id">
): Promise<void> {
    // Reset all covers for this activity
    const { error: resetError } = await supabase
        .from("activity_media")
        .update({ is_cover: false })
        .eq("activity_id", activity.id);

    if (resetError) throw resetError;

    // Mark selected as cover
    const { error } = await supabase
        .from("activity_media")
        .update({ is_cover: true })
        .eq("id", mediaId);

    if (error) throw error;

    // Sync activity.cover_image
    await updateActivity(activity.id, activity.tenant_id, { cover_image: mediaUrl });
}
