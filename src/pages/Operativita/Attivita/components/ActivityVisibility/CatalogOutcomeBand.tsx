import { useId } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card/Card";
import Text from "@/components/ui/Text/Text";
import type { RomeDateTime } from "@/services/supabase/schedulingNow";
import { CircleAlert, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { MISSING_STEP_LABEL, type MissingStep, type Outcome, type RuleRef } from "@/utils/catalogExplanation";
import styles from "./CatalogOutcomeBand.module.scss";

type CatalogOutcomeBandProps = {
    at: RomeDateTime;
    outcome: Outcome;
    /** Riga 1 della catena (§19.3): il menù che vince e la sua regola. */
    menu: { catalogName: string; rule: RuleRef | null; ruleHref: string | null } | null;
    /** La pagina pubblica della sede: quello che vede davvero il cliente. */
    publicUrl: string;
    /** Dove si sistema ogni passo di «Cosa manca»; senza, il passo non ha link. */
    fixes: Partial<Record<MissingStep, { label: string; href: string }>>;
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * La banda dell'esito di «Cosa vedono i clienti» (§19.2): cosa trova adesso
 * chi inquadra il QR della sede. Statica, senza cursore (§50.20, D3). Due
 * righe (correzioni UI V1): l'esito con l'ora, poi la regola che lo decide.
 * Il nome della sede è già nella testata, i conteggi nella tabella sotto.
 */
export function CatalogOutcomeBand({ at, outcome, menu, publicUrl, fixes }: CatalogOutcomeBandProps) {
    const warning = outcome.kind !== "showing";
    const missingId = useId();
    return (
        <div role="region" aria-label="Cosa vedono i clienti">
            <Card
                title="Cosa vedono i clienti"
                actions={
                    <Button
                        as="a"
                        variant="secondary"
                        size="sm"
                        href={publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        rightIcon={<ExternalLink size={14} />}
                    >
                        Apri pagina pubblica
                    </Button>
                }
                className={`${styles.band}${warning ? ` ${styles.warning}` : ""}`}
            >
                <div className={styles.body}>
                    <Text as="p" variant="body">
                        {`Adesso, alle ${pad(at.hour)}:${pad(at.minute)}, `}
                        {outcome.kind === "showing" && menu ? (
                            <>
                                vedono <strong>{menu.catalogName}</strong>
                            </>
                        ) : (
                            outcome.verdict
                        )}
                    </Text>
                    {menu?.rule && (
                        <p className={styles.chainRow}>
                            <Text as="span" variant="body-sm" colorVariant="muted">
                                Per la regola {menu.rule.name}
                            </Text>
                            {menu.ruleHref && (
                                <>
                                    <Text as="span" variant="body-sm" colorVariant="muted" aria-hidden>
                                        ·
                                    </Text>
                                    <Text as="span" variant="body-sm">
                                        <Link to={menu.ruleHref} className={styles.link}>
                                            Vedi la regola
                                        </Link>
                                    </Text>
                                </>
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
