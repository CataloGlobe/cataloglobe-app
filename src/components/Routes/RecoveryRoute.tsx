import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

type RecoveryRouteProps = {
    children: ReactNode;
};

const RECOVERY_FLAG_KEY = "passwordRecoveryFlow";

function hasRecoveryParams(search: string): boolean {
    const params = new URLSearchParams(search);

    // Supabase può usare diversi parametri a seconda del flow/versione
    const hasCode = params.has("code");
    const hasTokenHash = params.has("token_hash");
    const isRecoveryType = params.get("type") === "recovery";

    return hasCode || hasTokenHash || isRecoveryType;
}

export const RecoveryRoute = ({ children }: RecoveryRouteProps) => {
    const location = useLocation();

    const fromEmailLink = hasRecoveryParams(location.search);
    const recoveryFlag = sessionStorage.getItem(RECOVERY_FLAG_KEY) === "true";

    // Se arrivo dal link, imposto il flag per permettere i re-render / navigazioni nello stesso tab
    if (fromEmailLink && !recoveryFlag) {
        sessionStorage.setItem(RECOVERY_FLAG_KEY, "true");
    }

    // Se non ho né parametri né flag, non devo poter entrare
    if (!fromEmailLink && !recoveryFlag) {
        return (
            <Navigate to="/forgot-password" replace state={{ reason: "recovery-link-required" }} />
        );
    }

    return <>{children}</>;
};
