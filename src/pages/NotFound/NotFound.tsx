import { useNavigate } from "react-router-dom";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui";
import styles from "./NotFound.module.scss";
import { useEffect } from "react";

type NotFoundVariant = "page" | "business";

interface NotFoundPageProps {
    variant?: NotFoundVariant;
}

const COPY: Record<NotFoundVariant, { title: string; description: string }> = {
    page: {
        title: "Pagina non trovata",
        description:
            "La pagina che stai cercando non esiste, è stata spostata oppure il link è semplicemente sbagliato."
    },
    business: {
        title: "Attività non disponibile",
        description:
            "Questa attività non esiste oppure non è più disponibile. Il link potrebbe essere scaduto o errato."
    }
};

const NotFoundPage = ({ variant = "page" }: NotFoundPageProps) => {
    const navigate = useNavigate();
    const copy = COPY[variant];

    useEffect(() => {
        document.title =
            variant === "business"
                ? "Attività non disponibile | CataloGlobe"
                : "Pagina non trovata | CataloGlobe";

        let meta = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
        const created = !meta;

        if (!meta) {
            meta = document.createElement("meta");
            meta.name = "robots";
            document.head.appendChild(meta);
        }

        meta.content = "noindex";

        return () => {
            if (created && meta) {
                meta.remove();
            }
        };
    }, [variant]);

    return (
        <main className={styles.container} role="main" aria-labelledby="not-found-title">
            <section className={styles.card}>
                <Text as="span" className={styles.code} aria-hidden>
                    404
                </Text>

                <Text as="h1" variant="title-md" id="not-found-title" align="center">
                    {copy.title}
                </Text>

                <Text as="p" color="secondary" align="center">
                    {copy.description}
                </Text>

                <div className={styles.actions}>
                    <Button variant="primary" onClick={() => navigate("/")}>
                        Torna alla home
                    </Button>

                    <Button variant="secondary" onClick={() => navigate(-1)}>
                        Torna indietro
                    </Button>
                </div>
            </section>
        </main>
    );
};

export default NotFoundPage;
