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

    if (loading || otpLoading) return <AppLoader />;

    // Se già loggato, non deve stare in login/signup/reset
    if (user) {
        return <Navigate to={otpVerified ? "/dashboard" : "/verify-otp"} replace />;
    }

    return <>{children}</>;
};
