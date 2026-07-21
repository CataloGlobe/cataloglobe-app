import { useNavigate } from "react-router-dom";
import { IconAlertCircle } from "@tabler/icons-react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui";
import styles from "./NotFound.module.scss";
import { useEffect } from "react";

type NotFoundVariant = "page" | "business" | "business-empty" | "business-inactive" | "subscription-inactive";

interface NotFoundPageProps {
    variant?: NotFoundVariant;
}

// business-inactive e subscription-inactive condividono STESSO messaggio
// generico: un visitatore anonimo non deve poter dedurre se la sede è
// sospesa dal proprietario (maintenance/closed/unavailable) o se è
// l'abbonamento del tenant a essere scaduto — info-disclosure verso
// visitatori/competitor. Il motivo reale resta visibile solo al
// proprietario in dashboard (vedi formatInactiveReason).
const INACTIVE_COPY = {
    title: "Non disponibile al momento",
    description: "Questo menù non è al momento disponibile. Riprova più tardi."
};

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
    },
    "business-empty": {
        title: "Nessun contenuto disponibile",
        description:
            "Questo catalogo non ha contenuti disponibili al momento. Riprova più tardi."
    },
    "business-inactive": INACTIVE_COPY,
    "subscription-inactive": INACTIVE_COPY
};

const NotFoundPage = ({ variant = "page" }: NotFoundPageProps) => {
    const navigate = useNavigate();
    const copy = COPY[variant];

    const isInactiveVariant = variant === "business-inactive" || variant === "subscription-inactive";

    const InactiveIcon = isInactiveVariant ? IconAlertCircle : null;

    useEffect(() => {
        document.title =
            variant === "business" || isInactiveVariant
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
                {isInactiveVariant && InactiveIcon && (
                    <div className={styles.inactiveIcon}>
                        <InactiveIcon size={56} />
                    </div>
                )}

                {!isInactiveVariant && (
                    <Text as="span" className={styles.code} aria-hidden>
                        404
                    </Text>
                )}

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

                    {!isInactiveVariant && (
                        <Button variant="secondary" onClick={() => navigate(-1)}>
                            Torna indietro
                        </Button>
                    )}
                </div>
            </section>
        </main>
    );
};

export default NotFoundPage;
