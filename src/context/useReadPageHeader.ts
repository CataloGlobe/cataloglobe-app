import { useContext } from "react";
import { PageHeaderContext } from "./PageHeaderContext";

/** Hook getter, usato solo dal PageHeaderSlot in MainLayout. */
export function useReadPageHeader() {
    const ctx = useContext(PageHeaderContext);
    if (!ctx) {
        throw new Error("useReadPageHeader must be used within PageHeaderProvider");
    }
    return ctx.config;
}
