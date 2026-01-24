import { Navigate } from "react-router-dom";
import { useAuth } from "@context/useAuth";
import { AppLoader } from "./ui/AppLoader/AppLoader";
import type { ReactNode } from "react";

type ProtectedRouteProps = {
    children: ReactNode;
};

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
    const { user, loading } = useAuth();

    // ⏳ loading
    if (loading) return <AppLoader />;

    // ❌ non loggato
    if (!user) return <Navigate to="/login" replace />;

    // ❌ OTP non validato
    const otpValidated = localStorage.getItem("otpValidated");
    if (otpValidated !== "true") {
        return <Navigate to="/verify-otp" replace />;
    }

    // ✅ accesso consentito
    return <>{children}</>;
};
