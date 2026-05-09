import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { Switch } from "@/components/ui/Switch/Switch";
import Text from "@/components/ui/Text/Text";
import type { LanguageProgress } from "@/services/supabase/tenantLanguages";
import styles from "./LanguageRow.module.scss";

interface Props {
    code: string;
    name: string;
    flagEmoji: string | null;
    isActive: boolean;
    isBase: boolean;
    progress?: LanguageProgress;
    rowIndex?: number;
    onToggle?: (next: boolean) => void;
    onRetryErrors?: () => Promise<void> | void;
}

type Status = "idle" | "done" | "in_progress" | "error";

function deriveStatus(isActive: boolean, progress?: LanguageProgress): Status {
    if (!isActive) return "idle";
    if (!progress || progress.total === 0) return "idle";
    if (progress.error > 0) return "error";
    if (progress.done < progress.total) return "in_progress";
    return "done";
}

export function LanguageRow({
    code,
    name,
    flagEmoji,
    isActive,
    isBase,
    progress,
    rowIndex = 0,
    onToggle,
    onRetryErrors
}: Props) {
    const { t } = useTranslation("admin");
    const [isRetrying, setIsRetrying] = useState(false);

    const status = isBase ? "done" : deriveStatus(isActive, progress);
    const checked = isBase ? true : isActive;
    const pct =
        progress && progress.total > 0
            ? Math.round((progress.done / progress.total) * 100)
            : 0;

    const handleRetry = async () => {
        if (!onRetryErrors || isRetrying) return;
        setIsRetrying(true);
        try {
            await onRetryErrors();
        } finally {
            setIsRetrying(false);
        }
    };

    return (
        <div
            className={`${styles.row} ${isBase ? styles.baseRow : ""} ${styles[`status_${status}`]}`}
            style={{ ["--row-index" as string]: rowIndex }}
            data-status={status}
        >
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
                    {isBase && (
                        <span className={styles.basePill}>
                            {t("languages.base_label")}
                        </span>
                    )}
                </div>
            </div>

            <div className={styles.indicator}>
                {status === "done" && !isBase && (
                    <span
                        className={styles.doneIcon}
                        aria-label={t("languages.progress.translated_aria")}
                    >
                        <Check size={14} strokeWidth={2.5} />
                    </span>
                )}

                {status === "in_progress" && progress && (
                    <span
                        className={styles.progressInfo}
                        aria-label={t("languages.progress.in_progress_aria")}
                    >
                        <span className={styles.spinner} aria-hidden />
                        <span className={styles.counter}>
                            {progress.done} / {progress.total}
                        </span>
                    </span>
                )}

                {status === "error" && progress && (
                    <button
                        type="button"
                        className={styles.errorPill}
                        onClick={handleRetry}
                        disabled={isRetrying}
                    >
                        <span className={styles.errorDot} aria-hidden />
                        {t("languages.progress.retry_count_label", {
                            count: progress.error
                        })}
                    </button>
                )}
            </div>

            <div className={styles.toggle}>
                <Switch
                    checked={checked}
                    disabled={isBase}
                    onChange={next => onToggle?.(next)}
                />
            </div>

            {status === "in_progress" && (
                <span
                    className={styles.progressBar}
                    style={{ width: `${pct}%` }}
                    aria-hidden
                />
            )}
        </div>
    );
}

export default LanguageRow;
