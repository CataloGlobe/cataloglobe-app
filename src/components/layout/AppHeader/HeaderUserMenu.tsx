import { useCallback, useEffect, useMemo, useState } from "react";
import { LogOut } from "lucide-react";
import { useAuth } from "@/context/useAuth";
import { DropdownMenu } from "@/components/ui/DropdownMenu/DropdownMenu";
import { DropdownItem } from "@/components/ui/DropdownMenu/DropdownItem";
import { Avatar } from "@/components/ui/Avatar";
import { getProfile } from "@/services/supabase/profile";
import type { Profile } from "@/types/database";
import { supabase } from "@/services/supabase/client";
import styles from "./AppHeader.module.scss";

function readMetaString(meta: unknown, key: string): string | undefined {
    if (!meta || typeof meta !== "object") return undefined;
    const val = (meta as Record<string, unknown>)[key];
    return typeof val === "string" && val.length > 0 ? val : undefined;
}

export function HeaderUserMenu() {
    const { user, signOut } = useAuth();
    const [profile, setProfile] = useState<Profile | null>(null);

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

    const avatarUrl = useMemo(() => {
        if (!profile?.avatar_url) return undefined;
        const baseUrl = supabase.storage
            .from("avatars")
            .getPublicUrl(profile.avatar_url).data.publicUrl;
        const cacheBuster = profile.updated_at
            ? `?t=${encodeURIComponent(profile.updated_at)}`
            : "";
        return `${baseUrl}${cacheBuster}`;
    }, [profile?.avatar_url, profile?.updated_at]);

    const fullName = useMemo(() => {
        const parts = [profile?.first_name, profile?.last_name].filter(Boolean);
        if (parts.length > 0) return parts.join(" ");
        return readMetaString(user?.user_metadata, "full_name");
    }, [profile?.first_name, profile?.last_name, user?.user_metadata]);

    const email = user?.email ?? "";
    const displayName = fullName ?? "Account";
    const avatarName = fullName ?? email;

    const trigger = (
        <button type="button" className={styles.userButton} aria-label="Profilo utente">
            <Avatar name={avatarName} imageUrl={avatarUrl} size="md" rounded />
        </button>
    );

    return (
        <DropdownMenu trigger={trigger} placement="bottom-end">
            <div className={styles.userInfo}>
                <div className={styles.userName}>{displayName}</div>
                <div className={styles.userEmail}>{email}</div>
            </div>
            {/* TODO: aggiungere route /account quando creata */}
            <DropdownItem danger onClick={() => void signOut()}>
                <LogOut size={14} />
                <span>Esci</span>
            </DropdownItem>
        </DropdownMenu>
    );
}
