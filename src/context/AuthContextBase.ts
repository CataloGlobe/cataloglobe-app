import { createContext } from "react";
import type { User } from "@supabase/supabase-js";

export interface AuthContextType {
    user: User | null;
    loading: boolean;
    signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    signOut: async () => {}
});
