import { useContext, useEffect } from "react";
import { PageHeaderContext, type PageHeaderConfig } from "./PageHeaderContext";

/**
 * Dichiara il PageHeader della pagina corrente.
 * Registra al mount, pulisce al unmount.
 * Deve essere chiamato in pagine che vivono dentro MainLayout.
 *
 * Deps: title/subtitle (primitivi, value-compared) + leading/actions/titleAddon
 * (ReactNode, reference-compared). La pagina DEVE memoizzare actions/titleAddon
 * via useMemo, altrimenti il re-create per render scatena un loop di setConfig.
 *
 * `enabled = false`: la pagina è montata dentro un'altra che ha già la sua
 * testata (Comande dentro In servizio nella D) e non tocca niente.
 */
export function usePageHeader(config: PageHeaderConfig | null, enabled = true) {
    const ctx = useContext(PageHeaderContext);
    if (!ctx) {
        throw new Error("usePageHeader must be used within PageHeaderProvider");
    }
    const { setConfig } = ctx;

    useEffect(() => {
        if (!enabled) return;
        setConfig(config);
        return () => setConfig(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        config?.title,
        config?.subtitle,
        config?.leading,
        config?.actions,
        config?.compact,
        config?.titleAddon,
        config?.titleSide,
        setConfig,
        enabled,
    ]);
}
