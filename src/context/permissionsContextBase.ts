import { createContext } from "react";
import type { UserPermissions } from "@/lib/permissions";

export interface PermissionsContextValue {
    permissions: UserPermissions | null;
    loading: boolean;
    refresh: () => Promise<void>;
}

export const PermissionsContext = createContext<PermissionsContextValue>({
    permissions: null,
    loading: true,
    refresh: async () => {}
});
