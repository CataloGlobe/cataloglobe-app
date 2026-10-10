import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/useAuth";
import { getProfile } from "@/services/supabase/profile";
import { isPlatformAdmin } from "@/services/supabase/platformAdmin";
import { supabase } from "@/services/supabase/client";
import type { Profile } from "@/types/database";

function readMetaString(meta: unknown, key: string): string | undefined {
    if (!meta || typeof meta !== "object") return undefined;
    const val = (meta as Record<string, unknown>)[key];
    return typeof val === "string" && val.length > 0 ? val : undefined;
}

export interface CurrentUserProfile {
    /** Nome e cognome del profilo, o il `full_name` dei metadati; `undefined` se mancano entrambi. */
    fullName: string | undefined;
    email: string;
    avatarUrl: string | undefined;
    /** Voce «Area admin»: solo per chi amministra la piattaforma. */
    showAdminEntry: boolean;
}

/**
 * Chi è collegato, come lo mostrano i menù dell'account (testata del
 * workspace e dell'admin, piede della sidebar dell'azienda).
 */
export function useCurrentUserProfile(): CurrentUserProfile {
    const { user } = useAuth();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [showAdminEntry, setShowAdminEntry] = useState(false);

    const fetchProfile = useCallback(() => {
        if (!user?.id) return;
        getProfile(user.id)
            .then(data => setProfile(data))
            .catch(() => {});
    }, [user?.id]);

    useEffect(() => {
        fetchProfile();
    }, [fetchProfile]);

    useEffect(() => {
        window.addEventListener("profile:updated", fetchProfile);
        return () => window.removeEventListener("profile:updated", fetchProfile);
    }, [fetchProfile]);

    /* Voce "Area admin": una sola chiamata per mount del menu. Il componente
       resta montato attraverso i cambi di route (vive nel layout), quindi la
       RPC non riparte a ogni navigazione. `user?.id` in deps copre il cambio
       di utente, non la navigazione. `isPlatformAdmin` è fail-closed: errore
       o chiamata in volo → voce assente, mai un menu che aspetta. */
    useEffect(() => {
        if (!user?.id) {
            setShowAdminEntry(false);
            return;
        }
        let cancelled = false;
        void isPlatformAdmin().then(result => {
            if (!cancelled) setShowAdminEntry(result);
        });
        return () => {
            cancelled = true;
        };
    }, [user?.id]);

    const avatarUrl = useMemo(() => {
        if (!profile?.avatar_url) return undefined;
        const baseUrl = supabase.storage.from("avatars").getPublicUrl(profile.avatar_url).data.publicUrl;
        const cacheBuster = profile.updated_at ? `?t=${encodeURIComponent(profile.updated_at)}` : "";
        return `${baseUrl}${cacheBuster}`;
    }, [profile?.avatar_url, profile?.updated_at]);

    const fullName = useMemo(() => {
        const parts = [profile?.first_name, profile?.last_name].filter(Boolean);
        if (parts.length > 0) return parts.join(" ");
        return readMetaString(user?.user_metadata, "full_name");
    }, [profile?.first_name, profile?.last_name, user?.user_metadata]);

    return { fullName, email: user?.email ?? "", avatarUrl, showAdminEntry };
}
