import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import type { TenantStorySettings } from "@/services/supabase/tenants";
import styles from "./StoryBrandCard.module.scss";

type StoryBrandCardProps = {
    /** L'introduzione salvata; null mentre carica. */
    saved: TenantStorySettings | null;
    loadError: boolean;
    onRetry: () => void;
    /** Assente per chi non scrive: la card si legge e basta. */
    onEdit?: () => void;
};

/**
 * L'introduzione delle Storie (già «il cappello», correzioni UI SR2;
 * §34.8/1, §50.11/4): l'intestazione della lista,
 * mostrata com'è pubblicamente, sopra l'elenco. Non è una collezione sorella:
 * si modifica dal suo drawer e scrive subito.
 */
export function StoryBrandCard({ saved, loadError, onRetry, onEdit }: StoryBrandCardProps) {
    const isEmpty =
        saved != null && !saved.story_cover && !saved.story_title && !saved.story_intro && !saved.website;

    return (
        <Card
            title="Introduzione"
            subtitle="Il testo che i clienti leggono prima delle storie. Vale per tutte le sedi."
            actions={
                onEdit && saved && !isEmpty ? (
                    <Button variant="secondary" size="sm" onClick={onEdit}>
                        Modifica
                    </Button>
                ) : undefined
            }
        >
            {loadError ? (
                <div className={styles.row}>
                    <Text variant="body-sm" colorVariant="muted">
                        Non è stato possibile caricare l'introduzione.
                    </Text>
                    <Button variant="secondary" size="sm" onClick={onRetry}>
                        Riprova
                    </Button>
                </div>
            ) : !saved ? (
                <Skeleton height="72px" />
            ) : isEmpty ? (
                <div className={styles.row}>
                    <Text variant="body-sm" colorVariant="muted">
                        Nessuna introduzione
                    </Text>
                    {onEdit && (
                        <Button variant="secondary" size="sm" onClick={onEdit}>
                            Aggiungi
                        </Button>
                    )}
                </div>
            ) : (
                // Foto 16:9 da 224 a sinistra, testo al centro, sito a destra;
                // al telefono la foto va sopra.
                <div className={styles.preview}>
                    {saved.story_cover && (
                        <img className={styles.cover} src={saved.story_cover} alt="" loading="lazy" />
                    )}
                    <div className={styles.text}>
                        {saved.story_title && (
                            <Text variant="body" weight={600}>
                                {saved.story_title}
                            </Text>
                        )}
                        {saved.story_intro && (
                            <Text variant="body-sm" colorVariant="muted" className={styles.intro}>
                                {saved.story_intro}
                            </Text>
                        )}
                    </div>
                    {saved.website && (
                        <Text variant="caption" colorVariant="muted" className={styles.website}>
                            {saved.website.replace(/^https?:\/\//, "")}
                        </Text>
                    )}
                </div>
            )}
        </Card>
    );
}
