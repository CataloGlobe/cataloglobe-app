import Text from "@/components/ui/Text/Text";
import { useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import styles from "./Navbar.module.scss";

interface NavbarProps {
    onMenuClick?: () => void;
}

export default function Navbar({ onMenuClick }: NavbarProps) {
    const location = useLocation();

    const pageTitles: Record<string, string> = {
        "/dashboard": "Panoramica",
        "/dashboard/businesses": "Le tue attività",
        "/dashboard/collections": "Collezioni",
        "/dashboard/reviews": "Recensioni",
        "/dashboard/analytics": "Analytics",
        "/dashboard/settings": "Impostazioni"
    };

    const currentTitle = pageTitles[location.pathname] || "Dashboard";

    return (
        <header className={styles.navbar}>
            <button className={styles.menuBtn} aria-label="Apri menu" onClick={onMenuClick}>
                <Menu size={22} />
            </button>

            <Text variant="title-md" as={"h1"} colorVariant="dark" className={styles.title}>
                {currentTitle}
            </Text>
        </header>
    );
}
