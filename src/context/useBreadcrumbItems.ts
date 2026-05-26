import { useEffect } from "react";
import { useBreadcrumb } from "./useBreadcrumb";
import type { BreadcrumbItem } from "@/components/ui/Breadcrumb/Breadcrumb";

/**
 * Dichiara il breadcrumb globale (mostrato in AppHeader) per la pagina corrente.
 * Registra al mount, pulisce al unmount.
 * La pagina DEVE memoizzare `items` via useMemo: per content invariato, mantenere
 * stesso reference evita re-set inutili.
 */
export function useBreadcrumbItems(items: BreadcrumbItem[]) {
    const { setBreadcrumb, clearBreadcrumb } = useBreadcrumb();

    useEffect(() => {
        setBreadcrumb(items);
        return () => clearBreadcrumb();
    }, [items, setBreadcrumb, clearBreadcrumb]);
}
