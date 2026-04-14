import { useEffect, useState } from "react";
import { useAuth } from "@context/useAuth";
import { getProfile } from "@services/supabase/profile";
import type { Profile } from "@/types/database";

export function useProfile() {
    const { user } = useAuth();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(false);

    const userId = user?.id;

    useEffect(() => {
        if (!userId) {
            setProfile(null);
            return;
        }

        setLoading(true);
        getProfile(userId)
            .then(data => setProfile(data))
            .finally(() => setLoading(false));
    }, [userId]);

    return { profile, loading };
}
