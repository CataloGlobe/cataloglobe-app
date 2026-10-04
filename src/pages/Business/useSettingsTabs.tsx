import { useCallback, useMemo, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { usePermissions } from "@/context/usePermissions";
import { canDoOnTenant } from "@/lib/permissions";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";

/**
 * Impostazioni: una voce, tre tab che navigano (§51.12), come quelle della
 * Scheda della sede. Ogni tab col suo gate di oggi; una tab non permessa non
 * si mostra, e con una tab sola la fila sparisce (non c'è niente da
 * scegliere). Contenuti delle tre pagine invariati.
 */
export type SettingsTab = "azienda" | "team" | "abbonamento";

const TAB_SEGMENT: Record<SettingsTab, string> = {
    azienda: "settings",
    team: "settings/team",
    abbonamento: "settings/abbonamento"
};

const TAB_LABEL: Record<SettingsTab, string> = {
    azienda: "Azienda",
    team: "Team",
    abbonamento: "Abbonamento"
};

export interface SettingsTabsHeader {
    /** La fila di tab per `usePageHeader({ leading })`; `undefined` con una tab sola. */
    leading: ReactNode | undefined;
    /** Le stesse tab per la barra compatta. */
    compact: Pick<PageHeaderCompactConfig, "sections" | "activeSection" | "onSectionChange">;
}

export function useSettingsTabs(): SettingsTabsHeader {
    const { businessId = "" } = useParams<{ businessId: string }>();
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const { permissions } = usePermissions();

    const active: SettingsTab = pathname.endsWith("/settings/team")
        ? "team"
        : pathname.endsWith("/settings/abbonamento")
          ? "abbonamento"
          : "azienda";

    // Permessi non ancora arrivati: solo la tab corrente, niente lampo di tab
    // che poi spariscono.
    const tabs = useMemo<SettingsTab[]>(() => {
        if (!permissions) return [active];
        return (["azienda", "team", "abbonamento"] as const).filter(
            tab =>
                tab === "azienda" ||
                tab === active ||
                (tab === "team" && canDoOnTenant(permissions, "team.read")) ||
                (tab === "abbonamento" && canDoOnTenant(permissions, "billing.read"))
        );
    }, [permissions, active]);

    const goTo = useCallback(
        (tab: SettingsTab) => navigate(`/business/${businessId}/${TAB_SEGMENT[tab]}`),
        [navigate, businessId]
    );

    const leading = useMemo(
        () =>
            tabs.length > 1 ? (
                <Tabs<SettingsTab> value={active} onChange={goTo} variant="line">
                    <Tabs.List>
                        {tabs.map(tab => (
                            <Tabs.Tab key={tab} value={tab}>
                                {TAB_LABEL[tab]}
                            </Tabs.Tab>
                        ))}
                    </Tabs.List>
                </Tabs>
            ) : undefined,
        [tabs, active, goTo]
    );

    const compact = useMemo(
        () => ({
            sections: tabs.length > 1 ? tabs.map(tab => ({ value: tab, label: TAB_LABEL[tab] })) : undefined,
            activeSection: active,
            onSectionChange: (value: string) => goTo(value as SettingsTab)
        }),
        [tabs, active, goTo]
    );

    return { leading, compact };
}
