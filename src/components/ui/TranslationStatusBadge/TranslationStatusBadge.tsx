import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    getFieldTranslationStatus,
    retryFailedTranslation,
    type FieldTranslationStatus
} from "@/services/supabase/translationStatus";
import styles from "./TranslationStatusBadge.module.scss";

const POLLING_INTERVAL_MS = 5000;

type Props = {
    tenantId: string;
    entityType: "product";
    entityId: string;
    field: "description" | "notes";
    /** Cambia per forzare refetch (es. dopo save). Default: id-based. */
    refreshKey?: string | number;
};

export function TranslationStatusBadge({
    tenantId,
    entityType,
    entityId,
    field,
    refreshKey
}: Props) {
    const { t } = useTranslation("admin");
    const [status, setStatus] = useState<FieldTranslationStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [retrying, setRetrying] = useState(false);

    const fetchStatus = useCallback(async () => {
        try {
            const result = await getFieldTranslationStatus(
                tenantId,
                entityType,
                entityId,
                field
            );
            setStatus(result);
        } catch (err) {
            console.error("[TranslationStatusBadge] fetch failed:", err);
        } finally {
            setLoading(false);
        }
    }, [tenantId, entityType, entityId, field]);

    // Initial fetch + refetch quando refreshKey cambia (post-save).
    useEffect(() => {
        fetchStatus();
    }, [fetchStatus, refreshKey]);

    // Polling 5s SOLO se ci sono jobs pending. Stop al cambio status.
    useEffect(() => {
        if (!status || status.pendingCount === 0) return;
        const interval = setInterval(() => {
            fetchStatus();
        }, POLLING_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [status, fetchStatus]);

    const handleRetry = async () => {
        setRetrying(true);
        try {
            await retryFailedTranslation(tenantId, entityType, entityId, field);
            await fetchStatus();
        } catch (err) {
            console.error("[TranslationStatusBadge] retry failed:", err);
        } finally {
            setRetrying(false);
        }
    };

    if (loading) return null;
    if (!status) return null;
    if (status.totalLanguages === 0) return null;
    if (status.sourceHash === null) return null;

    const hasStale = status.staleCount > 0;
    const hasPending = status.pendingCount > 0;
    const hasError = status.errorCount > 0;
    const allDone =
        status.doneCount === status.totalLanguages &&
        !hasPending &&
        !hasError &&
        !hasStale;

    return (
        <div className={styles.wrapper}>
            {allDone && (
                <span className={`${styles.label} ${styles.neutral}`}>
                    {t("translation_status.completed", {
                        count: status.totalLanguages
                    })}
                </span>
            )}
            {hasStale && (
                <span className={`${styles.label} ${styles.stale}`}>
                    {t("translation_status.to_review", {
                        count: status.staleCount
                    })}
                </span>
            )}
            {hasPending && (
                <span className={`${styles.label} ${styles.pending}`}>
                    {t("translation_status.in_progress", {
                        done: status.doneCount,
                        total: status.totalLanguages
                    })}
                </span>
            )}
            {hasError && (
                <>
                    <span className={`${styles.label} ${styles.error}`}>
                        ⚠️{" "}
                        {t("translation_status.error", {
                            count: status.errorCount
                        })}
                    </span>
                    <button
                        type="button"
                        onClick={handleRetry}
                        disabled={retrying}
                        className={styles.retryButton}
                    >
                        {retrying ? "…" : t("translation_status.retry")}
                    </button>
                </>
            )}
        </div>
    );
}
