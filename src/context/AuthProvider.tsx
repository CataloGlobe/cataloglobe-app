import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@services/supabase/client";
import { AuthContext } from "./AuthContextBase";
import type { User } from "@supabase/supabase-js";

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const initAuth = async () => {
            const { data } = await supabase.auth.getUser();
            setUser(data.user ?? null);
            setLoading(false);
        };
        initAuth();

        const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        return () => listener.subscription.unsubscribe();
    }, []);

    async function handleSignOut() {
        await supabase.auth.signOut();
        setUser(null);
    }

    return (
        <AuthContext.Provider value={{ user, loading, signOut: handleSignOut }}>
            {children}
        </AuthContext.Provider>
    );
}
