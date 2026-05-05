import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    getTranslationProgress,
    retryAllFailedTranslations,
    type TranslationProgress
} from "@/services/supabase/tenantLanguages";
import { useToast } from "@/context/Toast/ToastContext";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import styles from "./TranslationProgressWidget.module.scss";

const POLL_INTERVAL_MS = 5000;

type Props = {
    tenantId: string | null | undefined;
    refreshKey?: number;
};

export function TranslationProgressWidget({ tenantId, refreshKey }: Props) {
    const { t } = useTranslation("admin");
    const { showToast } = useToast();
    const [progress, setProgress] = useState<TranslationProgress | null>(null);
    const [isRetrying, setIsRetrying] = useState(false);
    const isMountedRef = useRef(true);
    // Track precedente total_pending per detect transition pending→done.
    // Reset a null al cambio tenantId/refreshKey: l'utente ha appena
    // (ri)attivato una lingua, il prossimo "done" sarà la prima completion
    // osservata in questo ciclo e merita il toast.
    const prevPendingRef = useRef<number | null>(null);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        prevPendingRef.current = null;
    }, [tenantId, refreshKey]);

    const fetchProgress = useCallback(async () => {
        if (!tenantId) return;
        try {
            const data = await getTranslationProgress(tenantId);
            if (!isMountedRef.current) return;

            const prev = prevPendingRef.current;
            const curr = data.total_pending;
            // Transition pending>0 → 0 senza errori = traduzione completata.
            // prev=null al primo fetch evita toast spurio al mount con stato già done.
            if (prev !== null && prev > 0 && curr === 0 && data.total_error === 0) {
                showToast({
                    message: t("languages.progress.completed", { count: data.total_done }),
                    type: "success"
                });
            }
            prevPendingRef.current = curr;

            setProgress(data);
        } catch (err) {
            // Widget non-critical: log only, no toast spam su polling.
            console.error("[TranslationProgressWidget]", err);
        }
    }, [tenantId, showToast, t]);

    useEffect(() => {
        if (!tenantId) return;
        fetchProgress();
    }, [tenantId, fetchProgress, refreshKey]);

    useEffect(() => {
        if (!progress || progress.total_pending === 0) return;
        const interval = setInterval(fetchProgress, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [progress, fetchProgress]);

    const handleRetry = async () => {
        if (!tenantId) return;
        setIsRetrying(true);
        try {
            const count = await retryAllFailedTranslations(tenantId);
            showToast({
                message: t("languages.progress.retry_success", { count }),
                type: "success"
            });
            await fetchProgress();
        } catch (err) {
            console.error(err);
            showToast({
                message: t("languages.progress.retry_error"),
                type: "error"
            });
        } finally {
            if (isMountedRef.current) setIsRetrying(false);
        }
    };

    if (!progress) return null;
    if (progress.total_pending === 0 && progress.total_error === 0) return null;

    return (
        <div className={styles.widget}>
            <div className={styles.header}>
                <Text variant="body" weight={600}>
                    {t("languages.progress.title")}
                </Text>
                {progress.total_pending > 0 && (
                    <Text variant="body-sm" colorVariant="muted">
                        {t("languages.progress.in_progress", { count: progress.total_pending })}
                    </Text>
                )}
            </div>

            <div className={styles.list}>
                {progress.by_lang.map(lang => {
                    const pct =
                        lang.total > 0 ? Math.round((lang.done / lang.total) * 100) : 0;
                    const status: "done" | "pending" | "error" =
                        lang.error > 0 ? "error" : lang.pending > 0 ? "pending" : "done";

                    return (
                        <div key={lang.lang} className={styles.langRow}>
                            <span className={styles.langCode}>{lang.lang.toUpperCase()}</span>
                            <div className={styles.barContainer}>
                                <div
                                    className={`${styles.bar} ${styles[`bar_${status}`]}`}
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                            <span className={styles.counter}>
                                <span className={styles.counterText}>
                                    {lang.done}/{lang.total}
                                </span>
                                {lang.error > 0 && (
                                    <span className={styles.errorBadge}>
                                        {t("languages.progress.errors_count", { count: lang.error })}
                                    </span>
                                )}
                            </span>
                        </div>
                    );
                })}
            </div>

            {progress.total_error > 0 && (
                <div className={styles.footer}>
                    <Button
                        variant="danger"
                        size="sm"
                        loading={isRetrying}
                        disabled={isRetrying}
                        onClick={handleRetry}
                    >
                        {t("languages.progress.retry_all", { count: progress.total_error })}
                    </Button>
                </div>
            )}
        </div>
    );
}

export default TranslationProgressWidget;
