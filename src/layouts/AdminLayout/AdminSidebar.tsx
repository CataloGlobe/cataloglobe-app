import { ArrowLeft, Activity, Bot, CalendarClock, LifeBuoy, UserPlus, Wallet } from "lucide-react";
import {
    AppSidebar,
    type AppSidebarNavGroup
} from "@/components/layout/AppSidebar/AppSidebar";

/**
 * Navigazione dell'area admin: gruppo CRM in cima, poi Piattaforma (grafica
 * del CRM decisa il 2026-10-05). Aggiungere una sezione = aggiungere una voce
 * a `buildGroups`. La voce «Tenant», mai navigabile, è uscita.
 *
 * Il ritorno al workspace è un secondo gruppo, non un footer custom: l'area
 * admin si raggiunge solo dal menu utente e senza via d'uscita esplicita
 * sarebbe un vicolo cieco. Modellarlo come voce di nav gli fa ereditare
 * divider, stato collassato e tooltip dal guscio condiviso, invece di
 * duplicarne lo stile in un secondo modulo CSS che i selettori di
 * `.sidebar[data-collapsed]` non raggiungerebbero.
 */
function buildGroups(supportPending: boolean): AppSidebarNavGroup[] {
    return [
        {
            title: "CRM",
            items: [
                { to: "/admin/lead", label: "Lead", icon: <UserPlus size={18} /> },
                { to: "/admin/agenda", label: "Agenda", icon: <CalendarClock size={18} /> },
                { to: "/admin/agenti", label: "Agenti", icon: <Bot size={18} /> },
                { to: "/admin/costi", label: "Costi", icon: <Wallet size={18} /> }
            ]
        },
        {
            title: "Piattaforma",
            items: [
                {
                    to: "/admin/supporto",
                    label: "Supporto",
                    icon: <LifeBuoy size={18} />,
                    showDot: supportPending,
                    dotLabel: "Ci sono richieste in attesa di risposta"
                },
                { to: "/admin/status-incidents", label: "Incidenti", icon: <Activity size={18} /> }
            ]
        },
        {
            items: [{ to: "/workspace", label: "Torna al workspace", icon: <ArrowLeft size={18} /> }]
        }
    ];
}

interface AdminSidebarProps {
    isMobile: boolean;
    mobileOpen: boolean;
    collapsed: boolean;
    onRequestClose: () => void;
    onToggleCollapse: () => void;
    /**
     * Almeno una richiesta di supporto aspetta una risposta. Calcolato una
     * volta in `AdminLayout` (fonte unica): la sidebar è montata su ogni pagina
     * dell'area admin e non deve interrogare il DB da sé.
     */
    supportPending?: boolean;
}

export default function AdminSidebar({ supportPending = false, ...props }: AdminSidebarProps) {
    return <AppSidebar groups={buildGroups(supportPending)} {...props} />;
}
