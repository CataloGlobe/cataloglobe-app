import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@context/useAuth";
import { AppLoader } from "../ui/AppLoader/AppLoader";
import type { ReactNode } from "react";

type ProtectedRouteProps = {
    children: ReactNode;
};

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
    const { user, loading, otpVerified, otpLoading } = useAuth();
    const location = useLocation();

    // Bootstrap auth
    if (loading) {
        return <AppLoader intent="auth" />;
    }

    if (!user) {
        return (
            <Navigate to="/login" replace state={{ from: location, reason: "login-required" }} />
        );
    }

    // Verifica OTP
    if (otpLoading) {
        return <AppLoader intent="otp" />;
    }

    if (!otpVerified) {
        return <Navigate to="/verify-otp" replace />;
    }

    return <>{children}</>;
};
