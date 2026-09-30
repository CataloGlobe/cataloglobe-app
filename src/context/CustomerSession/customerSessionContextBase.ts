import { createContext } from "react";
import type { CustomerSessionBlob } from "@/services/customer/customerSessionStorage";

export interface CustomerSessionContextValue {
    session: CustomerSessionBlob | null;
    isActive: boolean;
    clear: () => void;
    refresh: () => void;
    setCustomerName: (name: string | null) => void;
}

export const CustomerSessionContext = createContext<CustomerSessionContextValue | null>(null);
