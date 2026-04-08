import { useNavigate } from "react-router-dom";
import { IconTool, IconCalendarOff, IconAlertCircle } from "@tabler/icons-react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui";
import styles from "./NotFound.module.scss";
import { useEffect } from "react";

type NotFoundVariant = "page" | "business" | "business-inactive";

type InactiveReason = "maintenance" | "closed" | "unavailable";

interface NotFoundPageProps {
    variant?: NotFoundVariant;
    inactiveReason?: InactiveReason | null;
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
    },
    "business-inactive": {
        title: "Non disponibile al momento",
        description:
            "Questo catalogo è temporaneamente sospeso. Riprova più tardi o contatta direttamente il locale."
    }
};

const INACTIVE_REASON_COPY: Record<InactiveReason, { title: string; description: string }> = {
    maintenance: {
        title: "In manutenzione",
        description:
            "Il locale è temporaneamente chiuso per lavori o aggiornamenti. Riprova più tardi."
    },
    closed: {
        title: "Chiuso temporaneamente",
        description:
            "Il locale è al momento chiuso per ferie o festività. Riprova più tardi."
    },
    unavailable: {
        title: "Non disponibile al momento",
        description:
            "Questo catalogo non è al momento consultabile. Riprova più tardi o contatta direttamente il locale."
    }
};

const INACTIVE_REASON_ICON: Record<InactiveReason, typeof IconAlertCircle> = {
    maintenance: IconTool,
    closed: IconCalendarOff,
    unavailable: IconAlertCircle
};

const NotFoundPage = ({ variant = "page", inactiveReason }: NotFoundPageProps) => {
    const navigate = useNavigate();
    const copy =
        variant === "business-inactive" && inactiveReason && INACTIVE_REASON_COPY[inactiveReason]
            ? INACTIVE_REASON_COPY[inactiveReason]
            : COPY[variant];

    const InactiveIcon =
        variant === "business-inactive"
            ? (inactiveReason ? INACTIVE_REASON_ICON[inactiveReason] : IconAlertCircle)
            : null;

    useEffect(() => {
        document.title =
            variant === "business" || variant === "business-inactive"
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
                {variant === "business-inactive" && InactiveIcon && (
                    <div className={styles.inactiveIcon}>
                        <InactiveIcon size={56} />
                    </div>
                )}

                {variant !== "business-inactive" && (
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

                    {variant !== "business-inactive" && (
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
