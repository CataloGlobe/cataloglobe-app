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

    if (loading) return <AppLoader />;

    if (!user)
        return (
            <Navigate to="/login" replace state={{ from: location, reason: "login-required" }} />
        );

    if (otpLoading) return <AppLoader message="Verifica accesso in corso..." />;

    if (!otpVerified) return <Navigate to="/verify-otp" replace />;

    return <>{children}</>;
};
