import { useEffect } from "react";
import Text from "@/components/ui/Text/Text";
import { Switch } from "@/components/ui/Switch/Switch";
import { useTheme } from "@/context/Theme/useTheme";
import { textAndActionsSections } from "./sections/textAndActions";
import { formsSections } from "./sections/forms";
import { containersSections } from "./sections/containers";
import { feedbackSections } from "./sections/feedback";
import { overlaysSections } from "./sections/overlays";
import { layoutSections } from "./sections/layout";
import styles from "./DevUiPage.module.scss";

/**
 * Galleria dei componenti — SOLO sviluppo (`/dev/ui`, registrata in App.tsx
 * dietro `import.meta.env.DEV`). Ogni sezione monta il componente reale di
 * `ui/` o `layout/` in tutti gli stati della sua scheda (design system §5).
 * Il toggle chiaro/scuro usa il ThemeProvider dell'app (data-theme sulla
 * radice), quindi la stessa lista si guarda nei due temi senza ricaricare.
 */
const SECTIONS = [
    ...textAndActionsSections,
    ...formsSections,
    ...containersSections,
    ...feedbackSections,
    ...overlaysSections,
    ...layoutSections
];

export default function DevUiPage() {
    const { theme, setTheme } = useTheme();

    useEffect(() => {
        document.title = "Galleria UI | CataloGlobe (dev)";
    }, []);

    return (
        <div className={styles.page}>
            <aside className={styles.index}>
                <div className={styles.indexHeader}>
                    <Text variant="title-sm" weight={600}>
                        Galleria UI
                    </Text>
                    <Text variant="caption" colorVariant="muted">
                        {SECTIONS.length} sezioni · solo sviluppo
                    </Text>
                    <Switch label="Tema scuro" checked={theme === "dark"} onChange={dark => setTheme(dark ? "dark" : "light")} />
                </div>
                <ul className={styles.indexList}>
                    {SECTIONS.map(section => (
                        <li key={section.id}>
                            <a className={styles.indexLink} href={`#${section.id}`}>
                                <Text as="span" variant="body-sm">
                                    {section.title}
                                </Text>
                            </a>
                        </li>
                    ))}
                </ul>
            </aside>

            <main className={styles.main}>
                {SECTIONS.map(({ id, title, sheet, Component }) => (
                    <section key={id} id={id} className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <Text as="h2" variant="title-md" weight={600}>
                                {title}
                            </Text>
                            {sheet && (
                                <Text variant="caption" colorVariant="muted">
                                    Scheda «{sheet}»
                                </Text>
                            )}
                        </div>
                        <Component />
                    </section>
                ))}
            </main>
        </div>
    );
}
