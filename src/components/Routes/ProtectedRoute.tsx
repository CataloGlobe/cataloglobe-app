import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@context/useAuth";
import { AppLoader } from "../ui/AppLoader/AppLoader";
import { isOtpValidated } from "@/services/supabase/auth";
import type { ReactNode } from "react";

type ProtectedRouteProps = {
    children: ReactNode;
};

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
    const { user, loading } = useAuth();
    const location = useLocation();

    // ⏳ loading
    if (loading) return <AppLoader />;

    // ❌ non loggato
    if (!user) {
        return (
            <Navigate to="/login" replace state={{ from: location, reason: "login-required" }} />
        );
    }

    // ❌ OTP non validato
    if (!isOtpValidated(user.id)) {
        return (
            <Navigate to="/verify-otp" replace state={{ from: location, reason: "otp-required" }} />
        );
    }

    // ✅ accesso consentito
    return <>{children}</>;
};
