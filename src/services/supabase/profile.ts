import { supabase } from "@/services/supabase/client";
import { compressImage, COMPRESS_PROFILES } from "@/utils/compressImage";
import type { Profile } from "@/types/database";

export async function getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, phone, avatar_url, created_at, updated_at")
        .eq("id", userId)
        .maybeSingle();

    if (error) {
        console.error("Errore nel recupero profilo:", error.message);
        return null;
    }

    if (!data) return null;

    return data as Profile;
}

type ProfileUpdates = {
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    avatar_url?: string | null;
};

export async function updateProfile(userId: string, updates: ProfileUpdates) {
    const cleaned = Object.fromEntries(
        Object.entries(updates).filter(([, value]) => value !== undefined)
    );

    const payload = {
        id: userId,
        ...cleaned,
        updated_at: new Date().toISOString()
    };

    const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
    if (error) throw error;
}

export async function uploadAvatar(
    userId: string,
    file: File
): Promise<string> {
    const maxSizeMb = 10;
    const maxSizeBytes = maxSizeMb * 1024 * 1024;
    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
        throw new Error("Formato avatar non supportato. Usa PNG, JPG o WEBP.");
    }

    if (file.size > maxSizeBytes) {
        throw new Error("File troppo grande. Max 5MB.");
    }

    const compressed = await compressImage(file, COMPRESS_PROFILES.avatar);

    const ext =
        compressed.type === "image/png"
            ? "png"
            : compressed.type === "image/webp"
                ? "webp"
                : "jpg";
    const filePath = `${userId}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, compressed, { upsert: true, contentType: compressed.type });

    if (uploadError) throw uploadError;

    return filePath;
}

export async function updateProfileAvatar(userId: string, avatar_url: string) {
    const { error } = await supabase
        .from("profiles")
        .update({ avatar_url, updated_at: new Date().toISOString() })
        .eq("id", userId);
    if (error) throw error;
}

export async function deleteAvatar(avatarPath: string): Promise<void> {
    const { error } = await supabase.storage.from("avatars").remove([avatarPath]);
    if (error) throw error;
}

export async function clearProfileAvatar(userId: string): Promise<void> {
    const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: null, updated_at: new Date().toISOString() })
        .eq("id", userId);
    if (error) throw error;
}
