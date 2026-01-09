import { Navigate } from "react-router-dom";
import { useAuth } from "@context/useAuth";
import { AppLoader } from "./ui/AppLoader/AppLoader";

export const ProtectedRoute = ({ children }: { children: Element }) => {
    const { user, loading } = useAuth();

    // ⏳ 1) Se sta caricando la sessione, aspetta
    if (loading) return <AppLoader />;

    // ❌ 2) Se NON c’è utente → login
    if (!user) return <Navigate to="/login" replace />;

    // ❌ 3) SE l’utente è loggato MA NON ha verificato OTP → verify-otp
    const otpValidated = localStorage.getItem("otpValidated");
    if (otpValidated !== "true") {
        return <Navigate to="/verify-otp" replace />;
    }

    // ✔️ 4) TUTTO OK → accesso consentito
    return children;
};
