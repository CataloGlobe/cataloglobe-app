import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Badge } from "@/components/ui/Badge/Badge";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { ListRow } from "@/components/ui/ListRow/ListRow";
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
    /** `translations.write` e abbonamento attivo: senza, niente «Torna ad automatica». */
    canWrite: boolean;
}

const REVERTABLE = new Set(["product", "category"]);

function itemKey(it: StaleTranslationItem): string {
    return `${it.entity_type}:${it.entity_id}:${it.field}`;
}

export function ReviewDrawer({ open, tenantId, language, onClose, onResolved, canWrite }: Props) {
    const { t } = useTranslation("admin");
    const { showToast } = useToast();
    const navigate = useNavigate();
    const { businessId } = useParams<{ businessId: string }>();
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const titleId = useId();

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
        canWrite &&
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

    const footer = (
        <Button variant="secondary" onClick={onClose}>
            {t("languages.review.close")}
        </Button>
    );

    const title = language
        ? `${t("languages.review.title")} · ${language.name_it}`
        : t("languages.review.title");

    return (
        <SystemDrawer open={open} onClose={onClose} size="md" aria-labelledby={titleId}>
            <DrawerLayout title={title} titleId={titleId} onClose={onClose} footer={footer}>
                {isLoading ? (
                    <Card flush>
                        <ListRow loading />
                        <ListRow loading />
                        <ListRow loading />
                    </Card>
                ) : error ? (
                    <EmptyState
                        variant="inline"
                        title={t("languages.review.error")}
                        action={
                            <Button variant="secondary" onClick={() => void refetch()}>
                                {t("languages.review.retry")}
                            </Button>
                        }
                    />
                ) : items.length === 0 ? (
                    <EmptyState
                        variant="inline"
                        title={t("languages.review.empty_title")}
                        description={t("languages.review.empty_desc", {
                            lang: language?.name_it ?? ""
                        })}
                    />
                ) : (
                    <div className={styles.body}>
                        <Text as="p" variant="body-sm" colorVariant="muted">
                            {t("languages.review.count", { count: items.length })}.{" "}
                            {t("languages.review.intro")}
                        </Text>

                        <Card flush>
                            {items.map(it => {
                                const key = itemKey(it);
                                const revertable = canRevert(it);
                                const openable = canOpen(it);
                                return (
                                    <ListRow
                                        key={key}
                                        title={it.name}
                                        subtitle={`${fieldLabel(it.field)} · ${formatSource(it)}`}
                                        wrapSubtitle="full"
                                        meta={<Badge variant="neutral">{typeLabel(it.entity_type)}</Badge>}
                                        trailing={
                                            revertable || openable ? (
                                                <span className={styles.actions}>
                                                    {revertable && (
                                                        <Button
                                                            variant="secondary"
                                                            size="sm"
                                                            loading={busyKey === key}
                                                            onClick={() => void handleRevert(it)}
                                                        >
                                                            {t("languages.review.revert")}
                                                        </Button>
                                                    )}
                                                    {openable && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            disabled={busyKey === key}
                                                            onClick={() => void handleOpen(it)}
                                                        >
                                                            {t("languages.review.open")}
                                                        </Button>
                                                    )}
                                                </span>
                                            ) : (
                                                <Text as="span" variant="caption" colorVariant="muted">
                                                    {t("languages.review.info_only")}
                                                </Text>
                                            )
                                        }
                                    />
                                );
                            })}
                        </Card>
                    </div>
                )}
            </DrawerLayout>
        </SystemDrawer>
    );
}

export default ReviewDrawer;
