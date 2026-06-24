import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Clock, Info } from "lucide-react";
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
    rowIndex?: number;
    canToggle?: boolean;
    onToggle?: (next: boolean) => void;
    onRetryErrors?: () => Promise<void> | void;
    /** Apre il drawer "Da rivedere" per questa lingua (chip stale → button). */
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

// Tempo relativo onesto ("2 minuti fa"). Intl localizza in base alla lingua UI.
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

export function LanguageRow({
    code,
    name,
    flagEmoji,
    isActive,
    isBase,
    coverage,
    unitTotal,
    rowIndex = 0,
    canToggle = true,
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
    // Barra di copertura: per tutte le lingue attive non-base.
    const showBar = !isBase && isActive && total > 0;
    const pct = total > 0 ? Math.round((fresh / total) * 100) : 0;

    return (
        <div
            className={`${styles.row} ${isBase ? styles.baseRow : ""} ${!isBase && !isActive ? styles.inactiveRow : ""} ${styles[`status_${status}`] ?? ""}`}
            style={{ ["--row-index" as string]: rowIndex }}
            data-status={status}
        >
            <div className={styles.topLine}>
                {flagEmoji && (
                    <span className={styles.flag} aria-hidden>
                        {flagEmoji}
                    </span>
                )}

                <div className={styles.info}>
                    <div className={styles.nameLine}>
                        <Text variant="body" weight={600}>
                            {name}
                        </Text>
                        <span className={styles.code}>{code}</span>
                    </div>
                    {renderSubText()}
                </div>

                <div className={styles.indicator}>
                    {isBase ? (
                        <span className={styles.basePill}>
                            {t("languages.base_label")}
                        </span>
                    ) : (
                        renderChip()
                    )}
                </div>

                {canToggle && (
                    <div className={styles.toggle}>
                        <Switch
                            checked={checked}
                            disabled={isBase}
                            onChange={next => onToggle?.(next)}
                        />
                    </div>
                )}
            </div>

            {showBar && (
                <div className={styles.track} aria-hidden>
                    <span
                        className={`${styles.fill} ${styles[`fill_${status}`]} ${status === "in_progress" ? styles.fillAnimated : ""}`}
                        style={{ width: `${pct}%` }}
                    />
                </div>
            )}

            {status === "to_review" && (
                <Text
                    variant="caption"
                    colorVariant="muted"
                    className={styles.reviewHint}
                >
                    {t("languages.coverage.to_review_hint")}
                </Text>
            )}
        </div>
    );

    // ── sub-render helpers ──────────────────────────────────────────────────

    function renderSubText() {
        if (isBase) {
            return (
                <Text variant="caption" colorVariant="muted" className={styles.subText}>
                    {typeof unitTotal === "number" && unitTotal > 0
                        ? t("languages.base_source", { count: unitTotal })
                        : t("languages.base_source_empty")}
                </Text>
            );
        }
        if (!isActive) {
            return (
                <Text variant="caption" colorVariant="muted" className={styles.subText}>
                    {t("languages.coverage.inactive_hint")}
                </Text>
            );
        }
        if (status === "done") {
            if (!coverage?.last_updated) return null;
            return (
                <span className={styles.subTextRow}>
                    <Clock size={12} strokeWidth={2} aria-hidden className={styles.subIcon} />
                    <Text variant="caption" colorVariant="muted">
                        {t("languages.coverage.last_updated", {
                            time: formatRelative(coverage.last_updated, i18n.language || "it")
                        })}
                    </Text>
                </span>
            );
        }
        // in_progress / error / to_review → frazione onesta
        return (
            <Text variant="caption" colorVariant="muted" className={styles.subText}>
                {t("languages.coverage.fraction", { fresh, total })}
            </Text>
        );
    }

    function renderChip() {
        if (isBase) return null;
        if (!isActive) return null;

        if (status === "in_progress") {
            return (
                <span
                    className={styles.queuedPill}
                    aria-label={t("languages.progress.in_progress_aria")}
                >
                    <span className={styles.spinner} aria-hidden />
                    {t("languages.coverage.queued", { count: coverage?.pending ?? 0 })}
                </span>
            );
        }
        if (status === "error" && canToggle) {
            return (
                <button
                    type="button"
                    className={styles.errorPill}
                    onClick={handleRetry}
                    disabled={isRetrying}
                >
                    <span className={styles.errorDot} aria-hidden />
                    {t("languages.progress.retry_count_label", {
                        count: coverage?.failed ?? 0
                    })}
                </button>
            );
        }
        if (status === "to_review") {
            const label = (
                <>
                    <Info size={13} strokeWidth={2} aria-hidden />
                    {t("languages.coverage.to_review", { count: reviewCount })}
                </>
            );
            return onReviewClick ? (
                <button
                    type="button"
                    className={styles.reviewPill}
                    onClick={() => onReviewClick(code)}
                >
                    {label}
                </button>
            ) : (
                <span className={styles.reviewPill}>{label}</span>
            );
        }
        // done
        return (
            <span
                className={styles.donePill}
                aria-label={t("languages.progress.translated_aria")}
            >
                <Check size={13} strokeWidth={2.5} aria-hidden />
                {t("languages.coverage.up_to_date")}
            </span>
        );
    }

    async function handleRetry() {
        if (!onRetryErrors || isRetrying) return;
        setIsRetrying(true);
        try {
            await onRetryErrors();
        } finally {
            setIsRetrying(false);
        }
    }
}

export default LanguageRow;
