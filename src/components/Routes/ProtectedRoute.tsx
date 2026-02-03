import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@context/useAuth";
import { AppLoader } from "../ui/AppLoader/AppLoader";
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
    const isOtpVerified = !!user?.app_metadata?.otp_verified;

    if (!isOtpVerified) {
        return <Navigate to="/verify-otp" replace />;
    }

    // ✅ accesso consentito
    return <>{children}</>;
};
