import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { useStaleTranslations } from "@/hooks/useStaleTranslations";
import { revertManualTranslation } from "@/services/supabase/translations";
import { getCategoryCatalogId } from "@/services/supabase/catalogs";
import type {
    SupportedLanguage,
    StaleTranslationItem
} from "@/services/supabase/tenantLanguages";
import styles from "./ReviewDrawer.module.scss";

interface Props {
    open: boolean;
    tenantId: string | null | undefined;
    language: SupportedLanguage | null;
    onClose: () => void;
    /** Notifica il parent (refresh coverage) dopo un revert riuscito. */
    onResolved: () => void;
}

const REVERTABLE = new Set(["product", "category"]);

function itemKey(it: StaleTranslationItem): string {
    return `${it.entity_type}:${it.entity_id}:${it.field}`;
}

export function ReviewDrawer({ open, tenantId, language, onClose, onResolved }: Props) {
    const { t } = useTranslation("admin");
    const { showToast } = useToast();
    const navigate = useNavigate();
    const { businessId } = useParams<{ businessId: string }>();
    const [busyKey, setBusyKey] = useState<string | null>(null);

    const { items, isLoading, error, refetch, removeItem } = useStaleTranslations(
        tenantId,
        open ? (language?.code ?? null) : null
    );

    const typeLabel = (entityType: string): string =>
        t(`languages.review.types.${entityType}`, { defaultValue: entityType });
    const fieldLabel = (field: string): string =>
        t(`languages.review.fields.${field}`, { defaultValue: field });

    // Le note prodotto sono ProductNote[] serializzate: mostra "label: value".
    const formatSource = (it: StaleTranslationItem): string => {
        if (it.field === "notes") {
            try {
                const parsed: unknown = JSON.parse(it.source_text);
                if (Array.isArray(parsed)) {
                    return parsed
                        .map(n => {
                            const note = n as { label?: string; value?: string };
                            return [note.label, note.value].filter(Boolean).join(": ");
                        })
                        .filter(Boolean)
                        .join("\n");
                }
            } catch {
                /* fallback al raw sotto */
            }
        }
        return it.source_text;
    };

    const canRevert = (it: StaleTranslationItem): boolean =>
        REVERTABLE.has(it.entity_type) &&
        (it.status === "manual" || it.status === "overridden");

    const canOpen = (it: StaleTranslationItem): boolean =>
        REVERTABLE.has(it.entity_type);

    async function handleRevert(it: StaleTranslationItem) {
        if (!tenantId || !language) return;
        const key = itemKey(it);
        setBusyKey(key);
        try {
            await revertManualTranslation({
                tenantId,
                entityType: it.entity_type,
                entityId: it.entity_id,
                field: it.field,
                languageCode: language.code
            });
            removeItem(it.entity_type, it.entity_id, it.field);
            showToast({ message: t("languages.review.reverted_toast"), type: "success" });
            onResolved();
        } catch {
            showToast({ message: t("languages.review.revert_error"), type: "error" });
        } finally {
            setBusyKey(null);
        }
    }

    async function handleOpen(it: StaleTranslationItem) {
        if (!businessId) return;
        if (it.entity_type === "product") {
            navigate(
                `/business/${businessId}/products/${it.entity_id}?tab=translations`
            );
            onClose();
            return;
        }
        if (it.entity_type === "category") {
            let target = `/business/${businessId}/catalogs`;
            try {
                if (tenantId) {
                    const catalogId = await getCategoryCatalogId(it.entity_id, tenantId);
                    target = `/business/${businessId}/catalogs/${catalogId}`;
                }
            } catch {
                /* fallback alla lista cataloghi */
            }
            navigate(target);
            onClose();
        }
    }

    const header = (
        <div className={styles.header}>
            {language?.flag_emoji && (
                <span className={styles.flag} aria-hidden>
                    {language.flag_emoji}
                </span>
            )}
            <div>
                <Text variant="title-sm" weight={600}>
                    {t("languages.review.title")}
                </Text>
                {language && (
                    <Text variant="caption" colorVariant="muted">
                        {language.name_it} · {t("languages.review.count", { count: items.length })}
                    </Text>
                )}
            </div>
        </div>
    );

    const footer = (
        <Button variant="secondary" onClick={onClose}>
            {t("languages.review.close")}
        </Button>
    );

    return (
        <SystemDrawer open={open} onClose={onClose} width={520}>
            <DrawerLayout header={header} footer={footer}>
                {isLoading ? (
                    <div className={styles.stateBox}>
                        <Text variant="body" colorVariant="muted">
                            {t("languages.review.loading")}
                        </Text>
                    </div>
                ) : error ? (
                    <div className={styles.stateBox}>
                        <Text variant="body" colorVariant="muted">
                            {t("languages.review.error")}
                        </Text>
                        <Button variant="secondary" onClick={() => void refetch()}>
                            {t("languages.review.retry")}
                        </Button>
                    </div>
                ) : items.length === 0 ? (
                    <div className={styles.stateBox}>
                        <Text variant="title-sm" weight={600}>
                            {t("languages.review.empty_title")}
                        </Text>
                        <Text variant="body" colorVariant="muted">
                            {t("languages.review.empty_desc", {
                                lang: language?.name_it ?? ""
                            })}
                        </Text>
                    </div>
                ) : (
                    <div className={styles.body}>
                        <Text variant="body" colorVariant="muted" className={styles.intro}>
                            {t("languages.review.intro")}
                        </Text>

                        <ul className={styles.list}>
                            {items.map(it => {
                                const key = itemKey(it);
                                const revertable = canRevert(it);
                                const openable = canOpen(it);
                                return (
                                    <li key={key} className={styles.item}>
                                        <div className={styles.itemHead}>
                                            <span className={styles.typePill}>
                                                {typeLabel(it.entity_type)}
                                            </span>
                                            <span className={styles.fieldLabel}>
                                                {fieldLabel(it.field)}
                                            </span>
                                        </div>

                                        <Text variant="body" weight={600}>
                                            {it.name}
                                        </Text>
                                        <p className={styles.source}>{formatSource(it)}</p>

                                        <div className={styles.actions}>
                                            {revertable && (
                                                <Button
                                                    variant="primary"
                                                    size="sm"
                                                    loading={busyKey === key}
                                                    onClick={() => void handleRevert(it)}
                                                >
                                                    {t("languages.review.revert")}
                                                </Button>
                                            )}
                                            {openable && (
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    disabled={busyKey === key}
                                                    onClick={() => void handleOpen(it)}
                                                >
                                                    {t("languages.review.open")}
                                                </Button>
                                            )}
                                            {!revertable && !openable && (
                                                <Text
                                                    variant="caption"
                                                    colorVariant="muted"
                                                >
                                                    {t("languages.review.info_only")}
                                                </Text>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
            </DrawerLayout>
        </SystemDrawer>
    );
}

export default ReviewDrawer;
