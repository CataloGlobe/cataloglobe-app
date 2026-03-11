import { supabase } from "@/services/supabase/client";
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
    const maxSizeMb = 5;
    const maxSizeBytes = maxSizeMb * 1024 * 1024;
    const allowedTypes = ["image/png", "image/jpeg"];

    if (!allowedTypes.includes(file.type)) {
        throw new Error("Formato avatar non supportato. Usa PNG o JPG.");
    }

    if (file.size > maxSizeBytes) {
        throw new Error("File troppo grande. Max 5MB.");
    }

    const filePath = `${userId}/avatar.jpg`;

    const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true, contentType: file.type });

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
