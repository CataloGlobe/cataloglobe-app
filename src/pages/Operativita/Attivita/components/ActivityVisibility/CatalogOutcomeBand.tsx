import { Card } from "@/components/ui/Card/Card";
import Text from "@/components/ui/Text/Text";
import type { RomeDateTime } from "@/services/supabase/schedulingNow";
import type { Outcome } from "@/utils/catalogExplanation";
import styles from "./CatalogOutcomeBand.module.scss";

type CatalogOutcomeBandProps = {
    at: RomeDateTime;
    outcome: Outcome;
    /** «1 visibile · 1 nascosto · 1 non disponibile», solo se mostrano un menù. */
    counts: string | null;
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * La banda dell'esito di «Cosa vedono i clienti» (§19.2): cosa trova adesso
 * chi inquadra il QR della sede. Statica, senza cursore (§50.20, D3).
 */
export function CatalogOutcomeBand({ at, outcome, counts }: CatalogOutcomeBandProps) {
    const warning = outcome.kind !== "showing";
    return (
        <div role="region" aria-label="Cosa vedono i clienti">
            <Card className={`${styles.band}${warning ? ` ${styles.warning}` : ""}`}>
                <div className={styles.body}>
                    <Text as="p" variant="caption" colorVariant="muted" className={styles.eyebrow}>
                        {`Adesso, alle ${pad(at.hour)}:${pad(at.minute)}`}
                    </Text>
                    <Text as="h2" variant="title-sm" weight={600}>
                        {outcome.headline}
                    </Text>
                    {counts && (
                        <Text as="p" variant="body-sm" colorVariant="muted">
                            {counts}
                        </Text>
                    )}
                </div>
            </Card>
        </div>
    );
}
