import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { usePageHeader } from "@/context/usePageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { StatusStrip, type StatusStripTone } from "@/components/ui/StatusStrip/StatusStrip";
import { LanguageRow } from "@/components/SettingsLanguages/LanguageRow";
import { ReviewDrawer } from "@/components/SettingsLanguages/ReviewDrawer/ReviewDrawer";
import { useBusinessOutletContext } from "@/layouts/MainLayout/outletContext";
import {
    listAvailableLanguages,
    listTenantLanguages,
    activateTenantLanguage,
    deactivateTenantLanguage,
    retryAllFailedTranslations,
    countLanguageBackfill,
    earliestNextRunAt,
    sumWaiting,
    type SupportedLanguage,
    type TenantLanguage
} from "@/services/supabase/tenantLanguages";
import { usePermissions } from "@/context/usePermissions";
import { canDoOnAnyActivity, canDoOnTenant } from "@/lib/permissions";
import { useEnsureActive } from "@/hooks/useEnsureActive";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { PageGate } from "@/components/PageGate/PageGate";
import { useNow } from "@/hooks/useNow";
import { translateNow } from "@/services/supabase/translationJobs";
import { minutesUntil } from "@/services/translation/waiting";
import { LOOK_D } from "@styles/lookD";
import styles from "./SettingsLanguages.module.scss";

/** Il tono della striscia di stato, dallo stato d'insieme delle traduzioni. */
const STRIP_TONE: Record<"queued" | "waiting" | "errors" | "done", StatusStripTone> = {
    queued: "info",
    waiting: "info",
    errors: "warning",
    done: "success"
};

export default function SettingsLanguages() {
    const tenantId = useTenantId();
    const { showToast } = useToast();
    const { t } = useTranslation("admin");
    const { permissions } = usePermissions();
    const { canEdit, ensureActive } = useEnsureActive();
    // Lettura via proxy `catalogs.read` finché `translations.read` non esiste
    // (§25.10, M15); il gate è prima di ogni fetch.
    const canRead = permissions != null && canDoOnAnyActivity(permissions, "catalogs.read");
    const hasWritePermission = permissions != null && canDoOnTenant(permissions, "translations.write");
    // Chi non scrive (o ha l'abbonamento fermo) vede la pagina com'è, con gli
    // interruttori spenti e un banner che dice perché (L4).
    const canWrite = hasWritePermission && canEdit;

    const [available, setAvailable] = useState<SupportedLanguage[]>([]);
    const [active, setActive] = useState<TenantLanguage[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [pendingLang, setPendingLang] = useState<SupportedLanguage | null>(null);
    const [reviewLang, setReviewLang] = useState<SupportedLanguage | null>(null);

    // Fonte UNICA: la coverage è montata in MainLayout e passata via Outlet
    // context → niente secondo mount dell'hook (no doppio poll, no doppio toast
    // di completamento). `wakeTranslations` forza un refetch dopo le azioni che
    // accodano job (attivazione, disattivazione, retry, review risolta).
    const outletCtx = useBusinessOutletContext();
    const coverage = outletCtx?.translationCoverage ?? null;
    const wakeTranslations = outletCtx?.wakeTranslations;
    const aiUsage = outletCtx?.aiUsage ?? null;

    // Conferma all'accensione: quanti testi accoderà il recupero. null =
    // conteggio in corso; se fallisce resta la frase generica.
    const [activationCount, setActivationCount] = useState<number | null>(null);
    const [activationCountFailed, setActivationCountFailed] = useState(false);
    useEffect(() => {
        if (!pendingLang || !tenantId) return;
        let cancelled = false;
        setActivationCount(null);
        setActivationCountFailed(false);
        countLanguageBackfill(tenantId, pendingLang.code)
            .then(count => {
                if (!cancelled) setActivationCount(count);
            })
            .catch(err => {
                console.error("Conteggio testi da tradurre:", err);
                if (!cancelled) setActivationCountFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, [pendingLang, tenantId]);

    usePageHeader({
        title: t("languages.title"),
    });

    const loadData = useCallback(async () => {
        if (!tenantId || !canRead) return;
        try {
            setLoading(true);
            setLoadError(false);
            const [avail, act] = await Promise.all([
                listAvailableLanguages(),
                listTenantLanguages(tenantId)
            ]);
            setAvailable(avail);
            setActive(act);
        } catch (error) {
            // Un errore non è «0 lingue attive · tutto aggiornato»: la pagina
            // lo dice, con «Riprova».
            console.error("Caricamento lingue:", error);
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, [tenantId, canRead]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Italiano sempre primo, resto in ordine già fornito dal service (sort_order).
    // Nella D prima le accese, poi le spente (v28).
    const orderedLangs = useMemo(() => {
        const it = available.find(l => l.code === "it");
        let others = available.filter(l => l.code !== "it");
        if (LOOK_D) {
            const on = (code: string) => active.some(a => a.language_code === code && a.is_active);
            others = [...others.filter(l => on(l.code)), ...others.filter(l => !on(l.code))];
        }
        return it ? [it, ...others] : others;
    }, [available, active]);

    const isLangActive = (code: string): boolean =>
        active.some(a => a.language_code === code && a.is_active);

    const coverageByLang = useCallback(
        (code: string) => coverage?.[code],
        [coverage]
    );

    // Metriche per la riga di riepilogo (solo estetica, nessun nuovo fetch).
    const summary = useMemo(() => {
        const values = coverage ? Object.values(coverage) : [];
        const unitTotal = values[0]?.total ?? 0; // total identico su ogni lingua (universo)
        const activeTargetCount = active.filter(
            a => a.is_active && a.language_code !== "it"
        ).length;
        const totalPending = values.reduce((s, c) => s + c.pending, 0);
        const totalWaiting = coverage ? sumWaiting(coverage) : 0;
        const nextRunAt = coverage ? earliestNextRunAt(coverage) : null;
        const totalFailed = values.reduce((s, c) => s + c.failed, 0);
        const state: "queued" | "waiting" | "errors" | "done" =
            totalPending > 0
                ? "queued"
                : totalWaiting > 0
                  ? "waiting"
                  : totalFailed > 0
                    ? "errors"
                    : "done";
        return { unitTotal, activeTargetCount, totalPending, totalWaiting, nextRunAt, state };
    }, [coverage, active]);

    const handleToggle = (lang: SupportedLanguage, checked: boolean) => {
        if (!checked) {
            handleDeactivate(lang);
        } else {
            setPendingLang(lang);
        }
    };

    const handleConfirmActivate = async (): Promise<boolean> => {
        if (!pendingLang || !tenantId || !canWrite) return false;
        if (!ensureActive()) return false;
        try {
            const { jobsCreated } = await activateTenantLanguage(tenantId, pendingLang.code);
            const messageKey =
                jobsCreated > 0 ? "languages.activated" : "languages.activated_no_jobs";
            showToast({
                message: t(messageKey, { lang: pendingLang.name_it, count: jobsCreated }),
                type: "success"
            });
            await loadData();
            wakeTranslations?.();
            return true;
        } catch {
            showToast({ message: t("errors.activate_failed"), type: "error" });
            return false;
        }
    };

    const handleDeactivate = async (lang: SupportedLanguage): Promise<void> => {
        if (!tenantId || !canWrite || !ensureActive()) return;
        try {
            await deactivateTenantLanguage(tenantId, lang.code);
            showToast({
                message: t("languages.deactivated", { lang: lang.name_it }),
                type: "success"
            });
            await loadData();
            wakeTranslations?.();
        } catch {
            showToast({ message: t("errors.deactivate_failed"), type: "error" });
        }
    };

    // «Traduci ora»: anticipa tutte le traduzioni in attesa dell'azienda. La
    // RPC chiede solo di essere membro (come chi accoda modificando un testo),
    // quindi il pulsante non dipende da `translations.write`.
    const [isTranslatingNow, setIsTranslatingNow] = useState(false);
    const now = useNow(30_000, summary.totalWaiting > 0);
    const handleTranslateNow = async (): Promise<void> => {
        if (!tenantId || !ensureActive()) return;
        setIsTranslatingNow(true);
        try {
            await translateNow(tenantId);
            showToast({ message: t("languages.progress.translate_now_done"), type: "success" });
            wakeTranslations?.();
        } catch {
            showToast({ message: t("languages.progress.translate_now_error"), type: "error" });
        } finally {
            setIsTranslatingNow(false);
        }
    };

    const handleRetryErrors = async (): Promise<void> => {
        if (!tenantId || !canWrite || !ensureActive()) return;
        try {
            const count = await retryAllFailedTranslations(tenantId);
            showToast({
                message: t("languages.progress.retry_success", { count }),
                type: "success"
            });
            wakeTranslations?.();
        } catch {
            showToast({
                message: t("languages.progress.retry_error"),
                type: "error"
            });
        }
    };

    function confirmMessage(lang: SupportedLanguage | null): string {
        if (!lang) return "";
        const what = activationCountFailed
            ? t("languages.confirm_description")
            : activationCount === null
              ? t("languages.confirm_counting")
              : activationCount === 0
                ? t("languages.confirm_count_zero", { lang: lang.name_it })
                : t("languages.confirm_count", { count: activationCount, lang: lang.name_it });
        // Il credito AI solo se già letto (MainLayout): percentuale, mai costi.
        const credit =
            aiUsage && (aiUsage.status === "blocked" || aiUsage.status === "not_eligible")
                ? t("languages.confirm_ai_blocked")
                : aiUsage?.percent != null
                  ? t("languages.confirm_ai_used", { percent: Math.round(aiUsage.percent) })
                  : t("languages.confirm_ai_credit");
        return activationCount === 0 && !activationCountFailed ? what : `${what} ${credit}`;
    }

    return (
        <PageGate readPermission="catalogs.read">
        {() => (
        <>
            <div className={styles.page}>
                {!canWrite && permissions != null && (
                    <InlineBanner variant="info">
                        {hasWritePermission
                            ? t("languages.read_only_subscription")
                            : t("languages.read_only_role")}
                    </InlineBanner>
                )}
                {loading ? (
                    <Card flush>
                        <div aria-busy="true" aria-label={t("languages.title")}>
                            <ListRow loading />
                            <ListRow loading />
                            <ListRow loading />
                        </div>
                    </Card>
                ) : loadError ? (
                    <EmptyState
                        variant="page"
                        icon={<Languages />}
                        title={t("errors.load_failed")}
                        description={t("languages.load_error_desc")}
                        action={
                            <Button variant="secondary" onClick={() => void loadData()}>
                                {t("languages.review.retry")}
                            </Button>
                        }
                    />
                ) : (
                    <>
                        {/* Lo stato della pagina in una striscia: quante lingue,
                            quanti elementi, e se c'è qualcosa in corso o da
                            risolvere. */}
                        <StatusStrip
                            tone={STRIP_TONE[summary.state]}
                            badge={t(`languages.summary.badge_${summary.state}`)}
                            title={`${t("languages.summary.active_count", { count: summary.activeTargetCount })} · ${t("languages.summary.translatable", { count: summary.unitTotal })}`}
                            // T13: la frase che stava sotto la testata, qui in coda.
                            description={`${
                                summary.state === "queued"
                                    ? t("languages.summary.queued", { count: summary.totalPending })
                                    : summary.state === "waiting"
                                      ? t("languages.summary.waiting", { count: summary.totalWaiting })
                                      : summary.state === "errors"
                                      ? t("languages.summary.has_errors")
                                      : t("languages.summary.all_done")
                            } · ${t("languages.summary.auto_note")}`}
                        />
                        {summary.totalWaiting > 0 && (
                            <InlineBanner
                                variant="info"
                                action={
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => void handleTranslateNow()}
                                        loading={isTranslatingNow}
                                        disabled={isTranslatingNow}
                                    >
                                        {t("languages.progress.translate_now")}
                                    </Button>
                                }
                            >
                                {`${t("languages.progress.waiting", {
                                    count: summary.totalWaiting,
                                    minutes: summary.nextRunAt ? minutesUntil(summary.nextRunAt, now) : 10
                                })}. ${t("languages.progress.waiting_hint")}`}
                            </InlineBanner>
                        )}
                        <Card flush className={LOOK_D ? styles.langCard : undefined} bodyClassName={LOOK_D ? styles.langGrid : undefined}>
                            {orderedLangs.map(lang => {
                                const isBase = lang.code === "it";
                                return (
                                    <LanguageRow
                                        key={lang.code}
                                        code={lang.code}
                                        name={lang.name_it}
                                        flagEmoji={lang.flag_emoji}
                                        isActive={isLangActive(lang.code)}
                                        isBase={isBase}
                                        coverage={coverageByLang(lang.code)}
                                        unitTotal={isBase ? summary.unitTotal : undefined}
                                        canToggle={isBase ? false : canWrite}
                                        readOnly={!canWrite}
                                        onToggle={
                                            isBase
                                                ? undefined
                                                : next => handleToggle(lang, next)
                                        }
                                        onRetryErrors={
                                            isBase ? undefined : handleRetryErrors
                                        }
                                        onReviewClick={
                                            isBase ? undefined : () => setReviewLang(lang)
                                        }
                                    />
                                );
                            })}
                        </Card>
                    </>
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
                message={confirmMessage(pendingLang)}
                confirmLabel={t("languages.confirm_button")}
                confirmVariant="primary"
            />

            <ReviewDrawer
                open={reviewLang !== null}
                tenantId={tenantId}
                language={reviewLang}
                onClose={() => setReviewLang(null)}
                onResolved={() => wakeTranslations?.()}
                canWrite={canWrite}
            />
        </>
        )}
        </PageGate>
    );
}
