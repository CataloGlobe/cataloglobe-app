import { ReactNode } from "react";
import Text from "@/components/ui/Text/Text";
import styles from "./SiteLayout.module.scss";
import { Footer } from "@/components/layout/Footer/Footer";

interface SiteLayoutProps {
    children: ReactNode;
}

export default function SiteLayout({ children }: SiteLayoutProps) {
    return (
        <div className={styles.layout}>
            <header className={styles.header}>
                <span className={styles.logo}>CataloGlobe</span>
                <nav className={styles.nav}>
                    <a href="#come-funziona">Come funziona</a>
                    <a href="#benefici">Benefici</a>
                    <a href="/login">Accedi</a>
                </nav>
            </header>

            <main className={styles.main}>{children}</main>

            <Footer />
        </div>
    );
}
