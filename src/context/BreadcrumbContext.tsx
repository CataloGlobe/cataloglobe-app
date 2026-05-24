import { createContext } from "react";
import type { BreadcrumbItem } from "@/components/ui/Breadcrumb/Breadcrumb";

export interface BreadcrumbContextType {
    items: BreadcrumbItem[];
    setBreadcrumb: (items: BreadcrumbItem[]) => void;
    clearBreadcrumb: () => void;
}

export const BreadcrumbContext = createContext<BreadcrumbContextType | null>(null);
