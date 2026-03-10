import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTenant } from "./useTenant";

/**
 * Returns the currently selected tenant ID, or null if none is selected.
 *
 * Guard: if tenant loading has completed and no tenant is selected, the user
 * is redirected to /workspace. This handles edge cases like:
 *   - localStorage cleared mid-session
 *   - invalid stored tenant ID after token refresh
 *   - race conditions between TenantProvider redirect and component render
 *
 * Note: no query cache invalidation is needed — the project uses direct Supabase
 * calls via useState, so navigation to /dashboard triggers a full re-mount and
 * all data is re-fetched with the new tenantId automatically.
 */
export const useTenantId = (): string | null => {
    const { selectedTenantId, loading } = useTenant();
    const navigate = useNavigate();

    useEffect(() => {
        if (!loading && !selectedTenantId) {
            navigate("/workspace", { replace: true });
        }
    }, [loading, selectedTenantId, navigate]);

    return selectedTenantId;
};
