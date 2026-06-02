import { useContext, useEffect } from "react";
import { PageHeaderContext, type PageHeaderConfig } from "./PageHeaderContext";

/**
 * Dichiara il PageHeader della pagina corrente.
 * Registra al mount, pulisce al unmount.
 * Deve essere chiamato in pagine che vivono dentro MainLayout.
 *
 * Deps: title/subtitle/sticky (primitivi, value-compared) + actions/titleAddon
 * (ReactNode, reference-compared). La pagina DEVE memoizzare actions/titleAddon
 * via useMemo, altrimenti il re-create per render scatena un loop di setConfig.
 */
export function usePageHeader(config: PageHeaderConfig | null) {
    const ctx = useContext(PageHeaderContext);
    if (!ctx) {
        throw new Error("usePageHeader must be used within PageHeaderProvider");
    }
    const { setConfig } = ctx;

    useEffect(() => {
        setConfig(config);
        return () => setConfig(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        config?.title,
        config?.subtitle,
        config?.sticky,
        config?.leading,
        config?.actions,
        config?.titleAddon,
        setConfig,
    ]);
}
