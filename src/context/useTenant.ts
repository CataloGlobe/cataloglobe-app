import { useContext } from "react";
import { TenantContext } from "./TenantContext";
import type { TenantContextType } from "./TenantContext";

export const useTenant = (): TenantContextType => useContext(TenantContext);
