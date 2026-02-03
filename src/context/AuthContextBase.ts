import { createContext } from "react";
import type { User } from "@supabase/supabase-js";

export interface AuthContextType {
    user: User | null;
    loading: boolean;
    otpVerified: boolean;
    otpLoading: boolean;
    refreshOtp: () => Promise<void>;
    signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    otpVerified: false,
    otpLoading: true,
    refreshOtp: async () => {},
    signOut: async () => {}
});
