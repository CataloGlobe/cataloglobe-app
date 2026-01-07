import { Footer } from "../Footer/Footer";
import Text from "@/components/ui/Text/Text";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Store, Settings, X, LibraryBig, Star, ChartPie } from "lucide-react";
import styles from "./Sidebar.module.scss";

const links = [
    { to: "/dashboard", label: "Panoramica", icon: <LayoutDashboard /> },
    { to: "/dashboard/businesses", label: "Le tue Attività", icon: <Store /> },
    { to: "/dashboard/collections", label: "I tuoi Cataloghi", icon: <LibraryBig /> },
    { to: "/dashboard/reviews", label: "Recensioni", icon: <Star /> },
    { to: "/dashboard/analytics", label: "Analytics", icon: <ChartPie /> },
    { to: "/dashboard/settings", label: "Impostazioni", icon: <Settings /> }
];

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
    return (
        <aside
            className={`${styles.sidebar} ${isOpen ? styles.open : ""}`}
            aria-label="Menu dashboard"
        >
            <div className={styles.logo}>
                <a href="/">
                    <Text variant="title-md" as={"h1"} colorVariant="primary" align="center">
                        CataloGlobe
                    </Text>
                </a>

                <button className={styles.closeBtn} aria-label="Chiudi menu" onClick={onClose}>
                    <X size={20} />
                </button>
            </div>

            <nav>
                <ul>
                    {links.map(link => (
                        <li key={link.to}>
                            <NavLink
                                to={link.to}
                                end={link.to === "/dashboard"}
                                className={({ isActive }) => (isActive ? styles.active : undefined)}
                                onClick={onClose}
                            >
                                {link.icon}
                                <span>{link.label}</span>
                            </NavLink>
                        </li>
                    ))}
                </ul>
            </nav>

            <Footer shortDescription={true} />
        </aside>
    );
}
