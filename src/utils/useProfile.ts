import { useEffect, useState } from "react";
import { useAuth } from "@context/useAuth";
import { getProfile } from "@services/supabase/profile";
import type { Profile } from "@/types/database";

export function useProfile() {
    const { user } = useAuth();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!user) {
            setProfile(null);
            return;
        }

        setLoading(true);
        getProfile(user.id)
            .then(data => setProfile(data))
            .finally(() => setLoading(false));
    }, [user]);

    return { profile, loading };
}
