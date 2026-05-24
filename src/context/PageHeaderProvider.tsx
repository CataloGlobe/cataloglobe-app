import { useCallback, useState, type ReactNode } from "react";
import { PageHeaderContext, type PageHeaderConfig } from "./PageHeaderContext";

export function PageHeaderProvider({ children }: { children: ReactNode }) {
    const [config, setConfigState] = useState<PageHeaderConfig | null>(null);

    const setConfig = useCallback((next: PageHeaderConfig | null) => {
        setConfigState(next);
    }, []);

    return (
        <PageHeaderContext.Provider value={{ config, setConfig }}>
            {children}
        </PageHeaderContext.Provider>
    );
}
