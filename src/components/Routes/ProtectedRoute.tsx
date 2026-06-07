import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@context/useAuth";
import { AppLoader } from "../ui/AppLoader/AppLoader";
import { OtpCheckErrorScreen } from "../OtpCheckErrorScreen/OtpCheckErrorScreen";
import type { ReactNode } from "react";

type ProtectedRouteProps = {
    children: ReactNode;
};

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
    const { user, loading, otpVerified, otpLoading, otpRefreshing, otpCheckFailed, forceOtpCheck } =
        useAuth();
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
    if (otpLoading && !otpRefreshing) {
        return <AppLoader intent="otp" />;
    }

    // Errore di rete sulla query di check OTP: non sappiamo se l'utente è
    // verificato. Non rediriggere a /verify-otp (che farebbe partire un
    // send-otp non richiesto). Retry in-place senza perdere lo stato SPA.
    if (otpCheckFailed) {
        return <OtpCheckErrorScreen onRetry={forceOtpCheck} />;
    }

    if (!otpVerified && !otpRefreshing) {
        return <Navigate to="/verify-otp" replace />;
    }

    return <>{children}</>;
};
