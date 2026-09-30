import TenantSidebar, { type TenantSidebarProps } from "./TenantSidebar";

let warned = false;

/**
 * @deprecated `Sidebar` si chiama `TenantSidebar` (costruttore dei gruppi
 * della sidebar business, che rende `AppSidebar`). Alias di compatibilità —
 * si rimuove nel lotto 6.
 */
export default function Sidebar(props: TenantSidebarProps) {
    if (import.meta.env.DEV && !warned) {
        warned = true;
        console.warn("[Sidebar] deprecato: importa TenantSidebar da components/layout/Sidebar/TenantSidebar");
    }
    return <TenantSidebar {...props} />;
}
