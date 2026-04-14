import { createContext } from "react";
import type { User } from "@supabase/supabase-js";

export interface AuthContextType {
    user: User | null;
    loading: boolean;
    otpVerified: boolean;
    otpLoading: boolean;
    otpRefreshing: boolean;
    refreshOtp: () => Promise<void>;
    forceOtpCheck: () => Promise<void>;
    signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    otpVerified: false,
    otpLoading: true,
    otpRefreshing: false,
    refreshOtp: async () => {},
    forceOtpCheck: async () => {},
    signOut: async () => {}
});
