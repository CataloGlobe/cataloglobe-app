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
                <Text variant="title-md" as={"h1"} colorVariant="dark">
                    CataloGlobe
                </Text>
                <nav className={styles.nav}>
                    <a href="#features">
                        <Text colorVariant="dark" weight={500}>
                            Funzionalità
                        </Text>
                    </a>
                    <a href="#pricing">
                        <Text colorVariant="dark" weight={500}>
                            Prezzi
                        </Text>
                    </a>
                    <a href="/dashboard">
                        <Text colorVariant="dark" weight={500}>
                            Accedi
                        </Text>
                    </a>
                </nav>
            </header>

            <main className={styles.main}>{children}</main>

            <Footer />
        </div>
    );
}
