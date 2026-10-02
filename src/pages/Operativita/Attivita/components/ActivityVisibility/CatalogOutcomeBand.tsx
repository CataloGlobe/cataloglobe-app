import { useId } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card/Card";
import Text from "@/components/ui/Text/Text";
import type { RomeDateTime } from "@/services/supabase/schedulingNow";
import { CircleAlert } from "lucide-react";
import { MISSING_STEP_LABEL, type MissingStep, type Outcome, type RuleRef } from "@/utils/catalogExplanation";
import styles from "./CatalogOutcomeBand.module.scss";

type CatalogOutcomeBandProps = {
    at: RomeDateTime;
    outcome: Outcome;
    /** «1 visibile · 1 nascosto · 1 non disponibile», solo se mostrano un menù. */
    counts: string | null;
    /** Riga 1 della catena (§19.3): il menù che vince e la sua regola. */
    menu: { catalogName: string; rule: RuleRef | null; ruleHref: string | null } | null;
    /** Dove si sistema ogni passo di «Cosa manca»; senza, il passo non ha link. */
    fixes: Partial<Record<MissingStep, { label: string; href: string }>>;
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * La banda dell'esito di «Cosa vedono i clienti» (§19.2): cosa trova adesso
 * chi inquadra il QR della sede. Statica, senza cursore (§50.20, D3).
 */
export function CatalogOutcomeBand({ at, outcome, counts, menu, fixes }: CatalogOutcomeBandProps) {
    const warning = outcome.kind !== "showing";
    const missingId = useId();
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
                    {menu && (
                        <p className={styles.chainRow}>
                            <Text as="span" variant="body-sm">
                                Menù <strong>{menu.catalogName}</strong>
                                {menu.rule && (
                                    <>
                                        {" "}
                                        · regola <strong>{menu.rule.name}</strong>
                                    </>
                                )}
                            </Text>
                            {menu.ruleHref && (
                                <Link to={menu.ruleHref} className={styles.link}>
                                    Vedi la regola
                                </Link>
                            )}
                        </p>
                    )}
                    {outcome.missing.length > 0 && (
                        <div className={styles.missing}>
                            <Text as="p" variant="body-sm" weight={600} id={missingId}>
                                Cosa manca
                            </Text>
                            <ul aria-labelledby={missingId} className={styles.missingList}>
                                {outcome.missing.map(step => (
                                    <li key={step} className={styles.missingItem}>
                                        <CircleAlert size={16} aria-hidden className={styles.missingIcon} />
                                        <Text as="span" variant="body-sm">
                                            {MISSING_STEP_LABEL[step]}
                                        </Text>
                                        {fixes[step] && (
                                            <Link to={fixes[step].href} className={styles.link}>
                                                {fixes[step].label}
                                            </Link>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
}
