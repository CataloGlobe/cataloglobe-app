import Text from "@/components/ui/Text/Text";
import styles from "./Footer.module.scss";

interface FooterProps {
    shortDescription?: boolean;
}

export const Footer = ({ shortDescription = false }: FooterProps) => {
    return (
        <footer className={styles.footer}>
            <Text variant="caption" colorVariant="muted">
                © {new Date().getFullYear()} CataloGlobe
                {!shortDescription && "— Tutti i diritti riservati."}
            </Text>
        </footer>
    );
};
