import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@context/useAuth";
import { AppLoader } from "../ui/AppLoader/AppLoader";
import type { ReactNode } from "react";

type OtpRouteProps = {
    children: ReactNode;
};

export const OtpRoute = ({ children }: OtpRouteProps) => {
    const isRecovery = sessionStorage.getItem("passwordRecoveryFlow") === "true";
    const { user, loading } = useAuth();
    const location = useLocation();

    if (isRecovery) {
        return <>{children}</>;
    }

    if (loading) return <AppLoader />;

    // Non loggato → login
    if (!user) {
        return <Navigate to="/login" replace state={{ from: location }} />;
    }

    // OTP già verificato → dashboard
    const isOtpVerified = !!user?.app_metadata?.otp_verified;

    if (isOtpVerified) {
        return <Navigate to="/dashboard" replace />;
    }

    // Utente loggato ma OTP non verificato → ok
    return <>{children}</>;
};
