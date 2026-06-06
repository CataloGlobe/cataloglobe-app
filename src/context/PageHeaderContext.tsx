import { createContext, type ReactNode } from "react";

export interface PageHeaderConfig {
    /** Titolo legacy — ignorato dal `PageHeaderSlot` post-breadcrumb (vive nel
     *  NavbarBreadcrumb). Mantenuto opzionale per backward compat con i call site. */
    title?: string;
    /** Sottotitolo legacy — ignorato post-slim. */
    subtitle?: string;
    /** Addon legacy accanto al titolo — ignorato post-slim. */
    titleAddon?: ReactNode;
    /** Slot sinistro: tab controllati, filtri primari, ecc. */
    leading?: ReactNode;
    /** Slot destro: search, filtri secondari, CTA. */
    actions?: ReactNode;
    /** Sticky legacy — ignorato post-slim. */
    sticky?: boolean;
}

export interface PageHeaderContextType {
    config: PageHeaderConfig | null;
    setConfig: (config: PageHeaderConfig | null) => void;
}

export const PageHeaderContext = createContext<PageHeaderContextType | null>(null);
