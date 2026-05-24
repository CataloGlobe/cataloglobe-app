import { createContext, type ReactNode } from "react";

export interface PageHeaderConfig {
    title: string;
    subtitle?: string;
    titleAddon?: ReactNode;
    actions?: ReactNode;
    sticky?: boolean;
}

export interface PageHeaderContextType {
    config: PageHeaderConfig | null;
    setConfig: (config: PageHeaderConfig | null) => void;
}

export const PageHeaderContext = createContext<PageHeaderContextType | null>(null);
