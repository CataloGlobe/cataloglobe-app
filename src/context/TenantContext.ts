import { createContext } from "react";
import type { V2Tenant } from "@/types/tenant";

export interface TenantContextType {
    tenants: V2Tenant[];
    selectedTenant: V2Tenant | null;
    selectedTenantId: string | null;
    userRole: "owner" | "admin" | "member" | null;
    loading: boolean;
    selectTenant: (id: string) => void;
    refreshTenants: () => Promise<void>;
    /** In-memory patch of the currently selected tenant (no network refetch).
     * Used to reflect authoritative post-commit values ahead of the async webhook. */
    patchSelectedTenant: (patch: Partial<Pick<V2Tenant, "plan" | "paid_seats">>) => void;
}

export const TenantContext = createContext<TenantContextType>({
    tenants: [],
    selectedTenant: null,
    selectedTenantId: null,
    userRole: null,
    loading: true,
    selectTenant: () => {},
    refreshTenants: async () => {},
    patchSelectedTenant: () => {}
});
