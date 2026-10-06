import { NavLink } from "react-router-dom";
import { CalendarClock, Ellipsis, House, UserPlus } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import type { NavSignal } from "@/utils/crm/crmHome";
import styles from "./CrmShell.module.scss";

interface CrmBottomBarProps {
    home: NavSignal;
    lead: NavSignal;
}

const ITEMS = [
    { to: "/admin", label: "Home", icon: House, end: true, signal: "home" },
    { to: "/admin/lead", label: "Lead", icon: UserPlus, end: false, signal: "lead" },
    { to: "/admin/agenda", label: "Agenda", icon: CalendarClock, end: false, signal: null },
    { to: "/admin/altro", label: "Altro", icon: Ellipsis, end: false, signal: null }
] as const;

/** Al telefono (U8): Home · Lead · Agenda · Altro, coi contatori della barra. */
export function CrmBottomBar({ home, lead }: CrmBottomBarProps) {
    return (
        <nav className={styles.bottomBar} aria-label="Menu principale">
            {ITEMS.map(item => {
                const signal = item.signal === "home" ? home : item.signal === "lead" ? lead : null;
                const Icon = item.icon;
                return (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) => `${styles.bottomItem} ${isActive ? styles.bottomItemActive : ""}`}
                    >
                        <span className={styles.bottomIcon}>
                            <Icon size={20} aria-hidden="true" />
                            {signal && signal.count > 0 && (
                                <span className={styles.bottomBadge} data-ring={signal.ring ?? undefined}>
                                    {signal.count > 99 ? "99+" : signal.count}
                                </span>
                            )}
                        </span>
                        <Text as="span" variant="caption-xs" color="inherit">
                            {item.label}
                        </Text>
                        {signal && signal.count > 0 && <span className="visually-hidden">, {signal.count} in attesa</span>}
                    </NavLink>
                );
            })}
        </nav>
    );
}
