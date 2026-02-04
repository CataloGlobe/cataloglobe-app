import { Navigate } from "react-router-dom";
import { useAuth } from "@context/useAuth";
import { AppLoader } from "../ui/AppLoader/AppLoader";
import type { ReactNode } from "react";

type GuestRouteProps = {
    children: ReactNode;
};

export const GuestRoute = ({ children }: GuestRouteProps) => {
    const isRecovery = sessionStorage.getItem("passwordRecoveryFlow") === "true";
    const { user, loading, otpVerified, otpLoading } = useAuth();

    if (isRecovery) {
        return <>{children}</>;
    }

    // Bootstrap auth (sessione, utente, token, ecc.)
    if (loading) {
        return <AppLoader intent="auth" />;
    }

    // Verifica OTP in corso
    if (user && otpLoading) {
        return <AppLoader intent="otp" />;
    }

    if (user) {
        return <Navigate to={otpVerified ? "/dashboard" : "/verify-otp"} replace />;
    }

    return <>{children}</>;
};
