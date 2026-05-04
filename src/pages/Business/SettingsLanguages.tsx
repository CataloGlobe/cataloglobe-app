import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { Switch } from "@/components/ui/Switch/Switch";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import Text from "@/components/ui/Text/Text";
import {
    listAvailableLanguages,
    listTenantLanguages,
    activateTenantLanguage,
    deactivateTenantLanguage,
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

    const loadData = useCallback(async () => {
        if (!tenantId) return;
        try {
            setLoading(true);
            const [avail, act] = await Promise.all([
                listAvailableLanguages(),
                listTenantLanguages(tenantId)
            ]);
            // Filtra italiano (lingua base, non gestibile da UI)
            setAvailable(avail.filter(l => l.code !== "it"));
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

    const isLangActive = (code: string): boolean =>
        active.some(a => a.language_code === code && a.is_active);

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
        } catch {
            showToast({ message: t("errors.deactivate_failed"), type: "error" });
        }
    };

    return (
        <>
            <PageHeader title={t("languages.title")} subtitle={t("languages.description")} />

            <div className={styles.banner}>
                <Text variant="body-sm" colorVariant="muted">
                    {t("languages.italian_base")}
                </Text>
            </div>

            {loading ? (
                <div className={styles.loading}>
                    <Text variant="body" colorVariant="muted">
                        {t("languages.title")}…
                    </Text>
                </div>
            ) : (
                <div className={styles.list}>
                    {available.map(lang => {
                        const checked = isLangActive(lang.code);
                        return (
                            <div key={lang.code} className={styles.row}>
                                {lang.flag_emoji && (
                                    <span className={styles.flag} aria-hidden>
                                        {lang.flag_emoji}
                                    </span>
                                )}
                                <div className={styles.info}>
                                    <Text variant="body" weight={600}>
                                        {lang.name_it}
                                    </Text>
                                    <span className={styles.code}>{lang.code}</span>
                                </div>
                                <div className={styles.toggle}>
                                    <Switch
                                        checked={checked}
                                        onChange={next => handleToggle(lang, next)}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

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
