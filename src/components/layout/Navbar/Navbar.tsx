import Text from "@/components/ui/Text/Text";
import { IconButton } from "@/components/ui/Button/IconButton";
import { Bell, Menu, UserCircle } from "lucide-react";
import styles from "./Navbar.module.scss";

interface NavbarProps {
    isMobile: boolean;

    // Mobile: apre/chiude overlay sidebar
    onMobileMenuClick: () => void;
    mobileMenuOpen: boolean;

    // Desktop: collapse/expand rail
}

export default function Navbar({ isMobile, onMobileMenuClick, mobileMenuOpen }: NavbarProps) {
    return (
        <header className={styles.navbar}>
            <div className={styles.left}>
                {isMobile && (
                    <IconButton
                        variant="ghost"
                        icon={<Menu size={22} />}
                        aria-label={mobileMenuOpen ? "Chiudi menu" : "Apri menu"}
                        aria-expanded={mobileMenuOpen}
                        aria-controls="dashboard-sidebar"
                        onClick={onMobileMenuClick}
                    />
                )}

                <Text
                    variant="title-md"
                    as="a"
                    href={"/"}
                    colorVariant="primary"
                    aria-label="Vai alla home"
                >
                    CataloGlobe
                </Text>
            </div>

            <div className={styles.right}>
                <IconButton variant="ghost" icon={<Bell size={20} />} aria-label="Notifiche" />
                <IconButton variant="ghost" icon={<UserCircle size={22} />} aria-label="Account" />
            </div>
        </header>
    );
}
