import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/Badge/Badge";
import { Button } from "@/components/ui/Button/Button";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { ProgressBar } from "@/components/ui/ProgressBar/ProgressBar";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { Switch } from "@/components/ui/Switch/Switch";
import Text from "@/components/ui/Text/Text";
import type { LanguageCoverage } from "@/services/supabase/tenantLanguages";
import styles from "./LanguageRow.module.scss";

interface Props {
    code: string;
    name: string;
    flagEmoji: string | null;
    isActive: boolean;
    isBase: boolean;
    coverage?: LanguageCoverage;
    /** Totale unità traducibili (universo), per il sottotesto della lingua base. */
    unitTotal?: number;
    canToggle?: boolean;
    /**
     * Sola lettura: l'interruttore resta visibile e spento (non sparisce) e
     * gli stati non diventano bottoni. Senza, chi legge vedeva «Aggiornata» su
     * una lingua con traduzioni fallite.
     */
    readOnly?: boolean;
    onToggle?: (next: boolean) => void;
    onRetryErrors?: () => Promise<void> | void;
    /** Apre il drawer "Da rivedere" per questa lingua. */
    onReviewClick?: (languageCode: string) => void;
}

type Status = "idle" | "done" | "in_progress" | "error" | "to_review";

// Priorità identica alla RPC get_translation_coverage:
// pending > (fresh==total) ; failed prima di stale/missing.
function deriveStatus(isActive: boolean, coverage?: LanguageCoverage): Status {
    if (!isActive) return "idle";
    if (!coverage || coverage.total === 0) return "done"; // nessun contenuto da tradurre
    if (coverage.pending > 0) return "in_progress";
    if (coverage.failed > 0) return "error";
    if (coverage.fresh >= coverage.total) return "done";
    return "to_review"; // stale + missing > 0
}

// Tempo relativo nella lingua dell'interfaccia (la pagina è l'unica del
// pannello su react-i18next): `utils/relativeTime` parla solo italiano.
function formatRelative(iso: string, locale: string): string {
    const then = new Date(iso).getTime();
    const diffSec = Math.round((then - Date.now()) / 1000); // negativo = passato
    const abs = Math.abs(diffSec);
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    if (abs < 60) return rtf.format(Math.round(diffSec), "second");
    if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
    if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
    return rtf.format(Math.round(diffSec / 86400), "day");
}

/**
 * Una lingua nell'elenco di Lingue: `ListRow` con la bandiera, il nome e il
 * codice, la copertura sotto (numero + barra), lo stato a destra e
 * l'interruttore in coda. Gli stati su cui si agisce («N da riprovare», «N da
 * rivedere») sono bottoni; gli altri sono `StatusBadge`.
 */
export function LanguageRow({
    code,
    name,
    flagEmoji,
    isActive,
    isBase,
    coverage,
    unitTotal,
    canToggle = true,
    readOnly = false,
    onToggle,
    onRetryErrors,
    onReviewClick
}: Props) {
    const { t, i18n } = useTranslation("admin");
    const [isRetrying, setIsRetrying] = useState(false);

    const status = isBase ? "done" : deriveStatus(isActive, coverage);
    const checked = isBase ? true : isActive;

    const total = coverage?.total ?? 0;
    const fresh = coverage?.fresh ?? 0;
    const reviewCount = (coverage?.stale ?? 0) + (coverage?.missing ?? 0);

    async function handleRetry() {
        if (!onRetryErrors || isRetrying) return;
        setIsRetrying(true);
        try {
            await onRetryErrors();
        } finally {
            setIsRetrying(false);
        }
    }

    function renderSubtitle() {
        if (isBase) {
            return typeof unitTotal === "number" && unitTotal > 0
                ? t("languages.base_source", { count: unitTotal })
                : t("languages.base_source_empty");
        }
        if (!isActive) return t("languages.coverage.inactive_hint");
        if (status === "done") {
            if (!coverage?.last_updated) return undefined;
            return t("languages.coverage.last_updated", {
                time: formatRelative(coverage.last_updated, i18n.language || "it")
            });
        }
        // in_progress / error / to_review → la frazione onesta, con la barra.
        const bar = (
            <ProgressBar
                inline
                value={fresh}
                max={total}
                variant={status === "in_progress" ? "brand" : "warning"}
                label={t("languages.coverage.fraction", { fresh, total })}
            />
        );
        if (status !== "to_review") return bar;
        return (
            <span className={styles.stack}>
                {bar}
                <span>{t("languages.coverage.to_review_hint")}</span>
            </span>
        );
    }

    function renderStatus() {
        if (isBase) return <Badge variant="neutral">{t("languages.base_label")}</Badge>;
        if (!isActive) return null;

        if (status === "in_progress") {
            return (
                <StatusBadge
                    variant="info"
                    label={t("languages.coverage.queued", { count: coverage?.pending ?? 0 })}
                />
            );
        }
        if (status === "error") {
            const label = t("languages.progress.retry_count_label", { count: coverage?.failed ?? 0 });
            return readOnly || !canToggle ? (
                <StatusBadge variant="warning" label={label} />
            ) : (
                <Button variant="secondary" size="sm" onClick={() => void handleRetry()} loading={isRetrying}>
                    {label}
                </Button>
            );
        }
        if (status === "to_review") {
            const label = t("languages.coverage.to_review", { count: reviewCount });
            return onReviewClick ? (
                <Button variant="secondary" size="sm" onClick={() => onReviewClick(code)}>
                    {label}
                </Button>
            ) : (
                <StatusBadge variant="warning" label={label} />
            );
        }
        return <StatusBadge variant="success" label={t("languages.coverage.up_to_date")} />;
    }

    return (
        <ListRow
            leading={
                flagEmoji ? (
                    // La bandiera è un'emoji: la sua misura la dà la scala del
                    // testo, non un font-size di pagina.
                    <span className={styles.flag} aria-hidden>
                        <Text as="span" variant="title-sm">{flagEmoji}</Text>
                    </span>
                ) : undefined
            }
            title={
                <span className={styles.nameLine}>
                    <span>{name}</span>
                    <Text as="span" variant="caption" colorVariant="muted" className={styles.code}>
                        {code}
                    </Text>
                </span>
            }
            subtitle={renderSubtitle()}
            wrapSubtitle={status === "to_review"}
            meta={renderStatus()}
            trailing={
                canToggle || (readOnly && !isBase) ? (
                    <Switch
                        checked={checked}
                        disabled={isBase || readOnly}
                        ariaLabel={name}
                        onChange={next => onToggle?.(next)}
                    />
                ) : undefined
            }
            muted={!isBase && !isActive}
        />
    );
}

export default LanguageRow;
