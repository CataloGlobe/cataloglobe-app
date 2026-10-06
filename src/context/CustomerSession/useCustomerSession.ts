import { useContext } from "react";
import { CustomerSessionContext, type CustomerSessionContextValue } from "./customerSessionContextBase";

export function useCustomerSession(): CustomerSessionContextValue {
    const ctx = useContext(CustomerSessionContext);
    if (!ctx) {
        throw new Error("useCustomerSession must be used within CustomerSessionProvider");
    }
    return ctx;
}

export function useOptionalCustomerSession(): CustomerSessionContextValue | null {
    return useContext(CustomerSessionContext);
}
