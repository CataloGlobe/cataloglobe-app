import { ArrowLeft, Activity, Bot, CalendarClock, HeartHandshake, House, LifeBuoy, UserPlus, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import {
    AppSidebar,
    type AppSidebarNavGroup,
    type AppSidebarNavItem
} from "@/components/layout/AppSidebar/AppSidebar";
import type { NavSignal } from "@/utils/crm/crmHome";

/** Il contatore (indaco) con l'anello del colore della cosa più urgente (U7). */
function signalProps(signal: NavSignal | undefined): Partial<AppSidebarNavItem> {
    if (!signal || signal.count === 0) return {};
    return { badge: signal.count, badgeTone: "brand", badgeRing: signal.ring ?? undefined };
}

/**
 * Navigazione dell'area admin: gruppo CRM in cima, poi Piattaforma (grafica
 * del CRM decisa il 2026-10-05). Aggiungere una sezione = aggiungere una voce
 * a `buildGroups`. La voce «Tenant», mai navigabile, è uscita.
 *
 * Il ritorno al workspace è una voce del piede (`footerItems`), non un footer
 * custom: l'area admin si raggiunge solo dal menu utente e senza via d'uscita
 * esplicita sarebbe un vicolo cieco. Come voce eredita stato chiuso e tooltip
 * dal guscio condiviso.
 */
function buildGroups(supportPending: boolean, home?: NavSignal, lead?: NavSignal): AppSidebarNavGroup[] {
    return [
        {
            title: "CRM",
            items: [
                { to: "/admin", label: "Home", icon: <House size={18} />, end: true, ...signalProps(home) },
                { to: "/admin/lead", label: "Lead", icon: <UserPlus size={18} />, ...signalProps(lead) },
                { to: "/admin/clienti", label: "Clienti", icon: <HeartHandshake size={18} /> },
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
        }
    ];
}

/** In fondo, sopra «Chiudi la barra» (7A2): l'uscita dall'area admin. */
const FOOTER: AppSidebarNavItem[] = [{ to: "/workspace", label: "Torna al workspace", icon: <ArrowLeft size={18} /> }];

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
    /** Contatori di Home e Lead (`useCrmNavData`). */
    home?: NavSignal;
    lead?: NavSignal;
    /** Marchio e Cerca ⌘K in cima. */
    headerSlot?: ReactNode;
}

export default function AdminSidebar({ supportPending = false, home, lead, ...props }: AdminSidebarProps) {
    return (
        <AppSidebar
            groups={buildGroups(supportPending, home, lead)}
            footerItems={FOOTER}
            collapseLabel="Chiudi la barra"
            {...props}
        />
    );
}
