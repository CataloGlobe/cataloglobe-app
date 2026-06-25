import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { Button } from "@/components/ui/Button/Button";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { Languages, Pencil, Sparkles } from "lucide-react";
import {
    listTranslationsForEntity,
    getActiveTenantLanguages,
    getTenantBaseLanguage,
    upsertManualTranslation,
    revertManualTranslation
} from "@/services/supabase/translations";
import { updateProduct } from "@/services/supabase/products";
import { updateCategory } from "@/services/supabase/catalogs";
import { getPendingJobLanguages } from "@/services/supabase/translationJobs";
import {
    listAvailableLanguages,
    type SupportedLanguage
} from "@/services/supabase/tenantLanguages";
import { computeFieldHash } from "@/services/translation/hashUtils";
import type {
    Translation,
    TranslationEntityType,
    TranslationField
} from "@/types/translations";
import { TranslationRow } from "./TranslationRow";
import styles from "./TranslationsTab.module.scss";

/** Item sorgente per la vista note (read-only). */
export interface TranslationsNoteItem {
    label: string;
    value: string;
}

/**
 * Campo secondario read-only mostrato in un secondo segmento (es. note
 * prodotto). Solo per i prodotti — le categorie non lo passano.
 */
export interface TranslationsSecondaryField {
    entityType: TranslationEntityType;
    field: TranslationField;
    /** Etichetta del segmento (es. "Note"). */
    label: string;
    /** Note italiane sorgente, per il riferimento read-only. */
    sourceItems: TranslationsNoteItem[];
}

interface TranslationsTabProps {
    entityType: TranslationEntityType;
    entityId: string;
    tenantId: string;
    sourceText: string;
    fieldKey: TranslationField;
    sectionLabel: string;
    sectionDescription: string;
    placeholderItalian?: string;
    flush?: boolean;
    /** Etichetta del segmento primario (es. "Descrizione" / "Nome"). */
    primaryLabel?: string;
    /** Campo secondario read-only (note prodotto). */
    secondaryField?: TranslationsSecondaryField;
    /** Notifica il parent dopo edit inline del testo italiano sorgente. */
    onSourceUpdated?: (newText: string) => void;
}

type StatusKind = "manual" | "auto" | "missing";
type ViewMode = "primary" | "secondary";

function getStatusKind(translation: Translation | undefined): StatusKind {
    if (!translation) return "missing";
    if (translation.status === "manual") return "manual";
    return "auto";
}

/**
 * Le note prodotto sono `ProductNote[]` serializzate in JSON. Parsa e
 * formatta "label: value" per riga; fallback al raw. Stesso pattern di
 * ReviewDrawer.formatSource.
 */
function formatNotePayload(raw: string): string {
    try {
        const parsed: unknown = JSON.parse(raw);
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
        /* fallback al raw */
    }
    return raw;
}

function formatNoteItems(items: TranslationsNoteItem[]): string {
    return items
        .map(n => [n.label, n.value].filter(Boolean).join(": "))
        .filter(Boolean)
        .join("\n");
}

export function TranslationsTab({
    entityType,
    entityId,
    tenantId,
    sourceText,
    fieldKey,
    sectionLabel,
    sectionDescription,
    placeholderItalian,
    flush = false,
    primaryLabel,
    secondaryField,
    onSourceUpdated
}: TranslationsTabProps) {
    const { t } = useTranslation("admin");
    const { showToast } = useToast();
    const gridClass = clsx(styles.grid, flush && styles.gridFlush);

    const [isLoading, setIsLoading] = useState(true);
    const [translations, setTranslations] = useState<Translation[]>([]);
    const [secondaryTranslations, setSecondaryTranslations] = useState<Translation[]>([]);
    const [supportedOrdered, setSupportedOrdered] = useState<SupportedLanguage[]>([]);
    const [activeCodes, setActiveCodes] = useState<string[]>([]);
    const [baseLanguage, setBaseLanguage] = useState<string>("it");
    const [currentSourceHash, setCurrentSourceHash] = useState<string | null>(null);

    const [view, setView] = useState<ViewMode>("primary");
    const [expandedLang, setExpandedLang] = useState<string | null>(null);
    const [draftValues, setDraftValues] = useState<Record<string, string>>({});
    const [savingLang, setSavingLang] = useState<string | null>(null);
    const [revertConfirmFor, setRevertConfirmFor] = useState<string | null>(null);
    // Lingue con job di ri-traduzione in corso (pending/processing) per il
    // source_hash corrente — fonte autoritativa dal DB, guida il badge
    // "In traduzione" e il polling. Assorbe il vecchio tracking manuale.
    const [pendingLangs, setPendingLangs] = useState<Set<string>>(new Set());

    // Override locale del sorgente IT dopo edit inline, finché il parent non
    // sincronizza la prop sourceText. Reset quando la prop cambia.
    const [sourceOverride, setSourceOverride] = useState<string | null>(null);
    const [isEditingSource, setIsEditingSource] = useState(false);
    const [sourceDraft, setSourceDraft] = useState("");
    const [isSavingSource, setIsSavingSource] = useState(false);

    useEffect(() => {
        setSourceOverride(null);
    }, [sourceText]);

    const effectiveSource = sourceOverride ?? sourceText;
    const hasSource = effectiveSource.trim().length > 0;
    const textareaPlaceholder = placeholderItalian ?? t("translations_tab.manual_placeholder");

    // Edit inline del sorgente supportato solo per i campi mappati a un update
    // di entità esistente (descrizione prodotto / nome categoria).
    const canEditSource =
        (entityType === "product" && fieldKey === "description") ||
        (entityType === "category" && fieldKey === "name");

    const secondaryEntityType = secondaryField?.entityType;
    const secondaryFieldKey = secondaryField?.field;

    // `silent`: refresh in background (polling) senza flash di loading né
    // azzeramento delle bozze in corso di scrittura.
    const loadData = useCallback(async (silent = false) => {
        try {
            if (!silent) setIsLoading(true);
            // Hash calcolato prima: serve come filtro per i job pending.
            const sourceHash = await computeFieldHash(effectiveSource);
            const [supported, active, base, allTranslations, secondaryAll, pending] =
                await Promise.all([
                    listAvailableLanguages(),
                    getActiveTenantLanguages(tenantId),
                    getTenantBaseLanguage(tenantId),
                    listTranslationsForEntity(tenantId, entityType, entityId),
                    secondaryEntityType
                        ? listTranslationsForEntity(tenantId, secondaryEntityType, entityId)
                        : Promise.resolve<Translation[]>([]),
                    sourceHash
                        ? getPendingJobLanguages(
                              tenantId,
                              entityType,
                              entityId,
                              fieldKey,
                              sourceHash
                          )
                        : Promise.resolve(new Set<string>())
                ]);

            setSupportedOrdered(supported);
            setActiveCodes(active.map(l => l.language_code));
            setBaseLanguage(base);
            setTranslations(
                allTranslations.filter(
                    tr => tr.field === fieldKey && tr.entity_type === entityType
                )
            );
            setSecondaryTranslations(
                secondaryFieldKey
                    ? secondaryAll.filter(
                          tr =>
                              tr.field === secondaryFieldKey &&
                              tr.entity_type === secondaryEntityType
                      )
                    : []
            );
            setCurrentSourceHash(sourceHash);
            setPendingLangs(pending);
            if (!silent) setDraftValues({});
        } catch {
            if (!silent) {
                showToast({ message: t("translations_tab.load_error"), type: "error" });
            }
        } finally {
            if (!silent) setIsLoading(false);
        }
    }, [
        entityId,
        entityType,
        fieldKey,
        tenantId,
        effectiveSource,
        secondaryEntityType,
        secondaryFieldKey,
        showToast,
        t
    ]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Auto-refresh: finché ci sono job in corso per questa entità, ricarica
    // ogni 5s (rifetcha righe + hash + pending). Stop quando pendingLangs si
    // svuota. Pattern identico a TranslationStatusBadge / useTranslationCoverage.
    useEffect(() => {
        if (pendingLangs.size === 0) return;
        const id = setInterval(() => {
            void loadData(true);
        }, 5000);
        return () => clearInterval(id);
    }, [pendingLangs, loadData]);

    const targetLanguages = useMemo<SupportedLanguage[]>(() => {
        const activeSet = new Set(activeCodes);
        return supportedOrdered.filter(
            lang => activeSet.has(lang.code) && lang.code !== baseLanguage
        );
    }, [activeCodes, baseLanguage, supportedOrdered]);

    const baseMeta = useMemo<SupportedLanguage | undefined>(
        () => supportedOrdered.find(l => l.code === baseLanguage),
        [supportedOrdered, baseLanguage]
    );

    const translationsByCode = useMemo<Record<string, Translation>>(() => {
        const map: Record<string, Translation> = {};
        for (const tr of translations) map[tr.language_code] = tr;
        return map;
    }, [translations]);

    const secondaryByCode = useMemo<Record<string, Translation>>(() => {
        const map: Record<string, Translation> = {};
        for (const tr of secondaryTranslations) map[tr.language_code] = tr;
        return map;
    }, [secondaryTranslations]);

    const toggleLang = (code: string) =>
        setExpandedLang(prev => (prev === code ? null : code));

    const handleSaveManual = async (languageCode: string) => {
        const translation = translationsByCode[languageCode];
        const draft = draftValues[languageCode];
        const text = (draft ?? translation?.translated_text ?? "").trim();

        if (!text) {
            showToast({ message: t("translations_tab.empty_required"), type: "error" });
            return;
        }
        if (!hasSource) {
            showToast({ message: t("translations_tab.no_source_required"), type: "error" });
            return;
        }
        if (currentSourceHash === null) {
            showToast({ message: t("translations_tab.hash_error"), type: "error" });
            return;
        }

        setSavingLang(languageCode);
        try {
            await upsertManualTranslation({
                tenantId,
                entityType,
                entityId,
                field: fieldKey,
                languageCode,
                sourceText: effectiveSource,
                sourceHash: currentSourceHash,
                translatedText: text
            });
            await loadData();
            showToast({ message: t("translations_tab.manual_saved"), type: "success" });
        } catch (err) {
            showToast({
                message: err instanceof Error ? err.message : t("translations_tab.save_error"),
                type: "error"
            });
        } finally {
            setSavingLang(null);
        }
    };

    const handleConfirmRevert = async (): Promise<boolean> => {
        const languageCode = revertConfirmFor;
        if (!languageCode) return false;
        try {
            await revertManualTranslation({
                tenantId,
                entityType,
                entityId,
                field: fieldKey,
                languageCode
            });
            // Il revert RPC enqueue un job → loadData lo rileva come pending,
            // il polling poi aggiorna la riga a "Automatica" quando è pronto.
            await loadData();
            showToast({ message: t("translations_tab.reverted"), type: "success" });
            return true;
        } catch (err) {
            showToast({
                message: err instanceof Error ? err.message : t("translations_tab.revert_error"),
                type: "error"
            });
            return false;
        }
    };

    const startEditSource = () => {
        setSourceDraft(effectiveSource);
        setIsEditingSource(true);
    };

    const handleSaveSource = async () => {
        const text = sourceDraft.trim();
        setIsSavingSource(true);
        try {
            if (entityType === "product" && fieldKey === "description") {
                await updateProduct(entityId, tenantId, { description: text || null });
            } else if (entityType === "category" && fieldKey === "name") {
                await updateCategory(entityId, tenantId, { name: text });
            }
            // setSourceOverride cambia effectiveSource → loadData rieseguita
            // dall'effect (ricalcola hash → badge "Da rivedere" coerenti).
            setSourceOverride(text);
            setIsEditingSource(false);
            onSourceUpdated?.(text);
            showToast({ message: t("translations_tab.source_saved"), type: "success" });
        } catch (err) {
            showToast({
                message: err instanceof Error ? err.message : t("translations_tab.source_save_error"),
                type: "error"
            });
        } finally {
            setIsSavingSource(false);
        }
    };

    if (isLoading) {
        return (
            <div className={gridClass}>
                <div className={styles.loading}>
                    <Text variant="body-sm" colorVariant="muted">
                        {t("translations_tab.loading")}
                    </Text>
                </div>
            </div>
        );
    }

    if (targetLanguages.length === 0) {
        return (
            <div className={gridClass}>
                <EmptyState
                    icon={<Languages size={40} strokeWidth={1.5} />}
                    title={t("translations_tab.no_langs_title")}
                    description={t("translations_tab.no_langs_desc")}
                    action={
                        <Link to={`/business/${tenantId}/languages`}>
                            <Button variant="primary">
                                {t("translations_tab.no_langs_cta")}
                            </Button>
                        </Link>
                    }
                />
            </div>
        );
    }

    const primarySegment = primaryLabel ?? sectionLabel;

    return (
        <div className={gridClass}>
            <section className={styles.card}>
                <header className={styles.cardHeader}>
                    <span className={styles.cardLabel}>{sectionLabel}</span>
                </header>
                <div className={styles.cardHelp}>{sectionDescription}</div>

                {secondaryField && (
                    <div className={styles.segmentRow}>
                        <SegmentedControl<ViewMode>
                            value={view}
                            onChange={next => {
                                setView(next);
                                setExpandedLang(null);
                            }}
                            options={[
                                { value: "primary", label: primarySegment },
                                { value: "secondary", label: secondaryField.label }
                            ]}
                        />
                    </div>
                )}

                {view === "primary" ? (
                    <>
                        {/* ── Sorgente italiano (editabile inline) ───────── */}
                        <div className={styles.sourceCard}>
                            <div className={styles.sourceHeader}>
                                <div className={styles.langHeader}>
                                    {baseMeta?.flag_emoji && (
                                        <span className={styles.flag}>
                                            {baseMeta.flag_emoji}
                                        </span>
                                    )}
                                    <span className={styles.langName}>
                                        {baseMeta?.name_native ?? baseLanguage.toUpperCase()} ·{" "}
                                        {t("translations_tab.source_suffix")}
                                    </span>
                                </div>
                                {canEditSource && !isEditingSource && (
                                    <button
                                        type="button"
                                        className={styles.sourceEditBtn}
                                        onClick={startEditSource}
                                    >
                                        <Pencil size={14} />
                                        {t("translations_tab.source_edit")}
                                    </button>
                                )}
                            </div>

                            {isEditingSource ? (
                                <>
                                    <Textarea
                                        rows={3}
                                        autoFocus
                                        placeholder={textareaPlaceholder}
                                        value={sourceDraft}
                                        onChange={e => setSourceDraft(e.target.value)}
                                        disabled={isSavingSource}
                                        textareaClassName={styles.langTextarea}
                                    />
                                    <InlineBanner variant="info">
                                        {t("translations_tab.retranslate_warning")}
                                    </InlineBanner>
                                    <div className={styles.sourceActions}>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => setIsEditingSource(false)}
                                            disabled={isSavingSource}
                                        >
                                            {t("translations_tab.cancel")}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="primary"
                                            size="sm"
                                            onClick={handleSaveSource}
                                            loading={isSavingSource}
                                            disabled={isSavingSource}
                                        >
                                            {t("translations_tab.save")}
                                        </Button>
                                    </div>
                                </>
                            ) : hasSource ? (
                                <Text variant="body-sm" className={styles.sourceText}>
                                    {effectiveSource}
                                </Text>
                            ) : (
                                <Text
                                    variant="body-sm"
                                    colorVariant="muted"
                                    className={styles.sourceEmpty}
                                >
                                    {t("translations_tab.source_empty")}
                                </Text>
                            )}
                        </div>

                        {/* ── Righe lingue ────────────────────────────────── */}
                        {hasSource ? (
                            <div className={styles.rowsWrap}>
                                {targetLanguages.map(lang => {
                                    const code = lang.code;
                                    const translation = translationsByCode[code];
                                    const kind = getStatusKind(translation);
                                    const isPending = pendingLangs.has(code);
                                    const isStale =
                                        currentSourceHash !== null &&
                                        !!translation &&
                                        translation.source_hash !== currentSourceHash;
                                    const draft = draftValues[code];
                                    const currentValue =
                                        draft ?? translation?.translated_text ?? "";
                                    const baseline = translation?.translated_text ?? "";
                                    const isDirty = currentValue !== baseline;
                                    const isSaving = savingLang === code;

                                    // Priorità: pending > fresh (manual/auto) > stale.
                                    const badge = isPending ? (
                                        <StatusBadge
                                            variant="pending"
                                            label={t("translations_tab.badge_translating")}
                                        />
                                    ) : kind === "manual" && !isStale ? (
                                        <StatusBadge
                                            variant="info"
                                            label={t("translations_tab.badge_manual")}
                                        />
                                    ) : kind === "auto" && !isStale ? (
                                        <StatusBadge
                                            variant="neutral"
                                            label={t("translations_tab.badge_auto")}
                                        />
                                    ) : kind === "missing" ? (
                                        <StatusBadge
                                            variant="neutral"
                                            label={t("translations_tab.badge_missing")}
                                        />
                                    ) : (
                                        <StatusBadge
                                            variant="warning"
                                            label={t("translations_tab.badge_review")}
                                        />
                                    );

                                    return (
                                        <TranslationRow
                                            key={code}
                                            flag={lang.flag_emoji}
                                            name={lang.name_native}
                                            badge={badge}
                                            preview={translation?.translated_text ?? ""}
                                            previewEmptyLabel={t(
                                                "translations_tab.preview_empty"
                                            )}
                                            expanded={expandedLang === code}
                                            onToggle={() => toggleLang(code)}
                                        >
                                            {isPending ? (
                                                <Textarea
                                                    rows={2}
                                                    placeholder={t(
                                                        "translations_tab.generating"
                                                    )}
                                                    value=""
                                                    readOnly
                                                    disabled
                                                    onChange={() => {}}
                                                    textareaClassName={styles.langTextarea}
                                                />
                                            ) : (
                                                <>
                                                    {isStale && (
                                                        <InlineBanner variant="warning">
                                                            {t("translations_tab.stale_hint")}
                                                        </InlineBanner>
                                                    )}
                                                    <Textarea
                                                        rows={3}
                                                        placeholder={textareaPlaceholder}
                                                        value={currentValue}
                                                        onChange={e =>
                                                            setDraftValues(prev => ({
                                                                ...prev,
                                                                [code]: e.target.value
                                                            }))
                                                        }
                                                        disabled={isSaving}
                                                        textareaClassName={styles.langTextarea}
                                                    />
                                                    <div className={styles.langActions}>
                                                        {kind === "manual" && (
                                                            <Button
                                                                type="button"
                                                                variant="secondary"
                                                                size="sm"
                                                                onClick={() =>
                                                                    setRevertConfirmFor(code)
                                                                }
                                                                disabled={isSaving}
                                                            >
                                                                <span className={styles.btnIconLabel}>
                                                                    <Sparkles size={14} />
                                                                    {t(
                                                                        "translations_tab.revert_auto"
                                                                    )}
                                                                </span>
                                                            </Button>
                                                        )}
                                                        {(isDirty || kind === "missing") && (
                                                            <Button
                                                                type="button"
                                                                variant="primary"
                                                                size="sm"
                                                                onClick={() =>
                                                                    handleSaveManual(code)
                                                                }
                                                                loading={isSaving}
                                                                disabled={isSaving}
                                                            >
                                                                {t(
                                                                    "translations_tab.save_manual"
                                                                )}
                                                            </Button>
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </TranslationRow>
                                    );
                                })}
                            </div>
                        ) : (
                            <InlineBanner variant="info">
                                {t("translations_tab.add_source_hint")}
                            </InlineBanner>
                        )}
                    </>
                ) : (
                    /* ── Vista Note (read-only) ──────────────────────────── */
                    secondaryField && (
                        <>
                            <InlineBanner variant="info">
                                {t("translations_tab.notes_readonly_banner")}
                            </InlineBanner>
                            <div className={styles.rowsWrap}>
                                {targetLanguages.map(lang => {
                                    const code = lang.code;
                                    const translation = secondaryByCode[code];
                                    const kind = getStatusKind(translation);
                                    const formatted = translation
                                        ? formatNotePayload(translation.translated_text)
                                        : "";
                                    const badge =
                                        kind === "manual" ? (
                                            <StatusBadge
                                                variant="info"
                                                label={t("translations_tab.badge_manual")}
                                            />
                                        ) : kind === "auto" ? (
                                            <StatusBadge
                                                variant="neutral"
                                                label={t("translations_tab.badge_auto")}
                                            />
                                        ) : (
                                            <StatusBadge
                                                variant="neutral"
                                                label={t("translations_tab.badge_missing")}
                                            />
                                        );

                                    return (
                                        <TranslationRow
                                            key={code}
                                            flag={lang.flag_emoji}
                                            name={lang.name_native}
                                            badge={badge}
                                            preview={formatted.replace(/\n/g, " · ")}
                                            previewEmptyLabel={t(
                                                "translations_tab.preview_empty"
                                            )}
                                            expanded={expandedLang === code}
                                            onToggle={() => toggleLang(code)}
                                        >
                                            <div className={styles.noteReference}>
                                                <span className={styles.noteRefLabel}>
                                                    {baseMeta?.name_native ??
                                                        baseLanguage.toUpperCase()}
                                                </span>
                                                <Text
                                                    variant="body-sm"
                                                    className={styles.sourceText}
                                                >
                                                    {formatNoteItems(
                                                        secondaryField.sourceItems
                                                    )}
                                                </Text>
                                            </div>
                                            <div className={styles.noteReference}>
                                                <span className={styles.noteRefLabel}>
                                                    {lang.name_native}
                                                </span>
                                                {formatted ? (
                                                    <Text
                                                        variant="body-sm"
                                                        className={styles.sourceText}
                                                    >
                                                        {formatted}
                                                    </Text>
                                                ) : (
                                                    <Text
                                                        variant="body-sm"
                                                        colorVariant="muted"
                                                        className={styles.sourceEmpty}
                                                    >
                                                        {t("translations_tab.preview_empty")}
                                                    </Text>
                                                )}
                                            </div>
                                        </TranslationRow>
                                    );
                                })}
                            </div>
                        </>
                    )
                )}
            </section>

            <ConfirmDialog
                isOpen={revertConfirmFor !== null}
                onClose={() => setRevertConfirmFor(null)}
                onConfirm={handleConfirmRevert}
                title={t("translations_tab.confirm_revert_title")}
                message={t("translations_tab.confirm_revert_message")}
                confirmLabel={t("translations_tab.confirm")}
                confirmVariant="danger"
            />
        </div>
    );
}
