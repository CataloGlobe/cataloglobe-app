import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { usePageHeader } from "@/context/usePageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import Text from "@/components/ui/Text/Text";
import { LanguageRow } from "@/components/SettingsLanguages/LanguageRow";
import { useTranslationProgress } from "@/hooks/useTranslationProgress";
import {
    listAvailableLanguages,
    listTenantLanguages,
    activateTenantLanguage,
    deactivateTenantLanguage,
    retryAllFailedTranslations,
    type SupportedLanguage,
    type TenantLanguage
} from "@/services/supabase/tenantLanguages";
import styles from "./SettingsLanguages.module.scss";

export default function SettingsLanguages() {
    const tenantId = useTenantId();
    const { showToast } = useToast();
    const { t } = useTranslation("admin");

    const [available, setAvailable] = useState<SupportedLanguage[]>([]);
    const [active, setActive] = useState<TenantLanguage[]>([]);
    const [loading, setLoading] = useState(true);
    const [pendingLang, setPendingLang] = useState<SupportedLanguage | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const progress = useTranslationProgress(tenantId, refreshKey);

    usePageHeader({
        title: t("languages.title"),
        subtitle: t("languages.description"),
        sticky: true,
    });

    const loadData = useCallback(async () => {
        if (!tenantId) return;
        try {
            setLoading(true);
            const [avail, act] = await Promise.all([
                listAvailableLanguages(),
                listTenantLanguages(tenantId)
            ]);
            setAvailable(avail);
            setActive(act);
        } catch {
            showToast({ message: t("errors.load_failed"), type: "error" });
        } finally {
            setLoading(false);
        }
    }, [tenantId, showToast, t]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Italiano sempre primo, resto in ordine già fornito dal service (sort_order).
    const orderedLangs = useMemo(() => {
        const it = available.find(l => l.code === "it");
        const others = available.filter(l => l.code !== "it");
        return it ? [it, ...others] : others;
    }, [available]);

    const isLangActive = (code: string): boolean =>
        active.some(a => a.language_code === code && a.is_active);

    const progressByLang = useCallback(
        (code: string) => progress?.by_lang.find(b => b.lang === code),
        [progress]
    );

    const handleToggle = (lang: SupportedLanguage, checked: boolean) => {
        if (!checked) {
            handleDeactivate(lang);
        } else {
            setPendingLang(lang);
        }
    };

    const handleConfirmActivate = async (): Promise<boolean> => {
        if (!pendingLang || !tenantId) return false;
        try {
            const { jobsCreated } = await activateTenantLanguage(tenantId, pendingLang.code);
            const messageKey =
                jobsCreated > 0 ? "languages.activated" : "languages.activated_no_jobs";
            showToast({
                message: t(messageKey, { lang: pendingLang.name_it, count: jobsCreated }),
                type: "success"
            });
            await loadData();
            setRefreshKey(k => k + 1);
            return true;
        } catch {
            showToast({ message: t("errors.activate_failed"), type: "error" });
            return false;
        }
    };

    const handleDeactivate = async (lang: SupportedLanguage): Promise<void> => {
        if (!tenantId) return;
        try {
            await deactivateTenantLanguage(tenantId, lang.code);
            showToast({
                message: t("languages.deactivated", { lang: lang.name_it }),
                type: "success"
            });
            await loadData();
            setRefreshKey(k => k + 1);
        } catch {
            showToast({ message: t("errors.deactivate_failed"), type: "error" });
        }
    };

    const handleRetryErrors = async (): Promise<void> => {
        if (!tenantId) return;
        try {
            const count = await retryAllFailedTranslations(tenantId);
            showToast({
                message: t("languages.progress.retry_success", { count }),
                type: "success"
            });
            setRefreshKey(k => k + 1);
        } catch {
            showToast({
                message: t("languages.progress.retry_error"),
                type: "error"
            });
        }
    };

    return (
        <>
            <div className={styles.page}>
                {loading ? (
                    <div className={styles.loading}>
                        <Text variant="body" colorVariant="muted">
                            {t("languages.title")}…
                        </Text>
                    </div>
                ) : (
                    <div className={styles.list}>
                        {orderedLangs.map((lang, idx) => {
                            const isBase = lang.code === "it";
                            return (
                                <LanguageRow
                                    key={lang.code}
                                    code={lang.code}
                                    name={lang.name_it}
                                    flagEmoji={lang.flag_emoji}
                                    isActive={isLangActive(lang.code)}
                                    isBase={isBase}
                                    progress={progressByLang(lang.code)}
                                    rowIndex={idx}
                                    onToggle={
                                        isBase
                                            ? undefined
                                            : next => handleToggle(lang, next)
                                    }
                                    onRetryErrors={
                                        isBase ? undefined : handleRetryErrors
                                    }
                                />
                            );
                        })}
                    </div>
                )}
            </div>

            <ConfirmDialog
                isOpen={pendingLang !== null}
                onClose={() => setPendingLang(null)}
                onConfirm={handleConfirmActivate}
                title={
                    pendingLang
                        ? t("languages.confirm_title", { lang: pendingLang.name_it })
                        : ""
                }
                message={t("languages.confirm_description")}
                confirmLabel={t("languages.confirm_button")}
                confirmVariant="primary"
            />
        </>
    );
}
