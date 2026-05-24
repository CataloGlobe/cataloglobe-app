import { useCallback, useState, type ReactNode } from "react";
import { BreadcrumbContext } from "./BreadcrumbContext";
import type { BreadcrumbItem } from "@/components/ui/Breadcrumb/Breadcrumb";

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<BreadcrumbItem[]>([]);

    const setBreadcrumb = useCallback((next: BreadcrumbItem[]) => {
        setItems(next);
    }, []);

    const clearBreadcrumb = useCallback(() => {
        setItems([]);
    }, []);

    return (
        <BreadcrumbContext.Provider value={{ items, setBreadcrumb, clearBreadcrumb }}>
            {children}
        </BreadcrumbContext.Provider>
    );
}
