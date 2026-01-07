import { supabase } from "./client";
import type { Profile } from "@/types/database";

export async function getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();

    if (error) {
        console.error("Errore nel recupero profilo:", error.message);
        return null;
    }

    return data;
}

export async function updateProfile(
    userId: string,
    updates: { name?: string; avatar_url?: string }
) {
    const { error } = await supabase.from("profiles").update(updates).eq("id", userId);
    if (error) throw error;
}

/** Elimina un file dallo storage (se esiste) */
export async function deleteAvatar(filePath: string) {
    try {
        const { error } = await supabase.storage.from("avatars").remove([filePath]);
        if (error) console.warn("Errore rimozione avatar:", error.message);
    } catch (e) {
        console.error("Impossibile rimuovere avatar:", e);
    }
}

/** Carica immagine nel bucket avatars e ritorna l’URL pubblico */
export async function uploadAvatar(
    userId: string,
    file: File,
    previousUrl?: string
): Promise<string> {
    if (previousUrl) {
        const oldPath = previousUrl.split("/avatars/")[1];
        if (oldPath) await deleteAvatar(oldPath);
    }

    const fileExt = file.name.split(".").pop();
    const filePath = `${userId}-${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);

    return data.publicUrl;
}

export async function updateProfileAvatar(userId: string, avatar_url: string) {
    const { error } = await supabase.from("profiles").update({ avatar_url }).eq("id", userId);
    if (error) throw error;
}
