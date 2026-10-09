import { AppSidebar, type AppSidebarProps } from "@/components/layout/AppSidebar/AppSidebar";
import { SidebarAccount } from "@/components/layout/AppSidebar/SidebarAccount";
import type { CurrentUserProfile } from "@/hooks/useCurrentUserProfile";
import type { NavGroups } from "./useNavGroups";

/**
 * TenantSidebar — la sidebar dell'area business, una sola per azienda e sede
 * (navigazione nuova, artifact v4 approvato da Alex il 2026-10-09): le sei
 * sezioni arrivano già costruite da `useNavGroups` (MainLayout le usa anche
 * per le tab in testa alla pagina). Il markup è tutto di `AppSidebar`.
 */

export interface TenantSidebarProps {
    nav: NavGroups;
    /** Chi è collegato, per il pulsante dell'account (fonte unica: MainLayout). */
    profile: CurrentUserProfile;
    isMobile: boolean;
    mobileOpen: boolean;
    collapsed: boolean;
    onRequestClose: () => void;
    onToggleCollapse: () => void;
    /** Sidebar a tutta altezza (desktop): logo e apri/chiudi. */
    brand?: AppSidebarProps["brand"];
}

export default function TenantSidebar({
    nav,
    profile,
    isMobile,
    mobileOpen,
    collapsed,
    onRequestClose,
    onToggleCollapse,
    brand
}: TenantSidebarProps) {
    return (
        <AppSidebar
            groups={nav.groups}
            accountSlot={
                <SidebarAccount
                    items={nav.account}
                    profile={profile}
                    collapsed={!isMobile && collapsed}
                    isMobile={isMobile}
                    onRequestClose={onRequestClose}
                />
            }
            isMobile={isMobile}
            mobileOpen={mobileOpen}
            collapsed={collapsed}
            onRequestClose={onRequestClose}
            onToggleCollapse={onToggleCollapse}
            brand={brand}
        />
    );
}
