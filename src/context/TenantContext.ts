import { createContext } from "react";
import type { V2Tenant } from "@/types/v2/tenant";

export interface TenantContextType {
    tenants: V2Tenant[];
    selectedTenant: V2Tenant | null;
    selectedTenantId: string | null;
    userRole: "owner" | "admin" | "member" | null;
    loading: boolean;
    selectTenant: (id: string) => void;
}

export const TenantContext = createContext<TenantContextType>({
    tenants: [],
    selectedTenant: null,
    selectedTenantId: null,
    userRole: null,
    loading: true,
    selectTenant: () => {}
});
