import { createContext, ReactNode } from "react";

export type DrawerSize = "sm" | "md" | "lg";

export interface DrawerOptions {
    title?: string;
    content: ReactNode;
    footer?: ReactNode;
    size?: DrawerSize;
    ariaLabelledBy?: string;
    ariaDescribedBy?: string;
}

export interface DrawerContextType {
    openDrawer: (options: DrawerOptions) => void;
    closeDrawer: () => void;
}

export const DrawerContext = createContext<DrawerContextType | undefined>(undefined);
