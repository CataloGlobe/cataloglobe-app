import { Building2, CreditCard, Settings } from "lucide-react";
import {
    AppSidebar,
    type AppSidebarNavGroup
} from "@/components/layout/AppSidebar/AppSidebar";

const GROUPS: AppSidebarNavGroup[] = [
    {
        items: [{ to: "/workspace", label: "Attività", icon: <Building2 size={18} />, end: true }]
    },
    {
        items: [
            { to: "/workspace/billing", label: "Abbonamento", icon: <CreditCard size={18} /> },
            { to: "/workspace/settings", label: "Impostazioni", icon: <Settings size={18} /> }
        ]
    }
];

interface WorkspaceSidebarProps {
    isMobile: boolean;
    mobileOpen: boolean;
    collapsed: boolean;
    onRequestClose: () => void;
    onToggleCollapse: () => void;
}

export default function WorkspaceSidebar(props: WorkspaceSidebarProps) {
    return <AppSidebar groups={GROUPS} {...props} />;
}
