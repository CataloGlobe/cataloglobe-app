import { NavLink } from "react-router-dom";
import { Building2, Users, CreditCard, Settings } from "lucide-react";
import styles from "./WorkspaceSidebar.module.scss";

const SECTIONS = [
    {
        label: "Attività",
        items: [{ to: "/workspace", label: "Attività", icon: <Building2 size={16} />, end: true }]
    },
    {
        label: "Team",
        items: [{ to: "/workspace/team", label: "Team", icon: <Users size={16} /> }]
    },
    {
        label: "Account",
        items: [
            { to: "/workspace/billing", label: "Abbonamento", icon: <CreditCard size={16} /> },
            { to: "/workspace/settings", label: "Impostazioni", icon: <Settings size={16} /> }
        ]
    }
];

export default function WorkspaceSidebar() {
    return (
        <aside className={styles.sidebar}>
            <div className={styles.header}>
                <a href="/" className={styles.appName}>
                    Cataloglobe
                </a>
                <span className={styles.badge}>Workspace</span>
            </div>

            <nav className={styles.nav}>
                {SECTIONS.map(section => (
                    <div key={section.label} className={styles.section}>
                        <span className={styles.sectionLabel}>{section.label}</span>
                        {section.items.map(item => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.end}
                                className={({ isActive }) =>
                                    [styles.link, isActive ? styles.active : ""].join(" ")
                                }
                            >
                                {item.icon}
                                {item.label}
                            </NavLink>
                        ))}
                    </div>
                ))}
            </nav>
        </aside>
    );
}
