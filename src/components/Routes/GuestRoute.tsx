import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@context/useAuth";
import { AppLoader } from "../ui/AppLoader/AppLoader";
import { fromPathOf, internalPathOr } from "@/utils/internalPath";
import { peekPendingRedirect } from "@/utils/pendingRedirect";
import type { ReactNode } from "react";

type GuestRouteProps = {
    children: ReactNode;
};

export const GuestRoute = ({ children }: GuestRouteProps) => {
    const isRecovery = sessionStorage.getItem("passwordRecoveryFlow") === "true";
    const { user, loading, otpVerified, otpLoading, otpRefreshing } = useAuth();
    const location = useLocation();

    if (isRecovery) {
        return <>{children}</>;
    }

    // Bootstrap auth (sessione, utente, token, ecc.)
    if (loading) {
        return <AppLoader intent="auth" />;
    }

    // Verifica OTP in corso
    if (user && otpLoading && !otpRefreshing) {
        return <AppLoader intent="auth" />;
    }

    // Subito dopo il login la verifica parte come "refresh" e otpVerified è
    // ancora false: senza attesa si andava a /verify-otp per un istante e poi
    // al workspace (chi ha già l'OTP valido vedeva la pagina del codice
    // lampeggiare). Si aspetta l'esito, poi si decide.
    if (user && otpRefreshing && !otpVerified) {
        return <AppLoader intent="auth" />;
    }

    if (user) {
        // ZD-3: quando arriva l'utente questa Navigate può partire prima di quella
        // di Login: deve portare con sé il deep link (state.from di ProtectedRoute),
        // o dopo l'OTP si finisce sempre nel Workspace.
        const from = fromPathOf(location.state);
        if (otpVerified) {
            // Senza deep link, quello salvato prima della registrazione (invito).
            return <Navigate to={internalPathOr(from ?? peekPendingRedirect(), "/workspace")} replace />;
        }
        return <Navigate to="/verify-otp" state={from ? { from } : undefined} replace />;
    }

    return <>{children}</>;
};
