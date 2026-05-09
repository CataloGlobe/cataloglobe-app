import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button/Button";
import { Badge } from "@/components/ui/Badge/Badge";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { Languages } from "lucide-react";
import {
    listTranslationsForEntity,
    getActiveTenantLanguages,
    getTenantBaseLanguage,
    upsertManualTranslation,
    revertManualTranslation
} from "@/services/supabase/translations";
import { listAvailableLanguages, type SupportedLanguage } from "@/services/supabase/tenantLanguages";
import { computeFieldHash } from "@/services/translation/hashUtils";
import type { Translation } from "@/types/translations";
import type { V2Product } from "@/services/supabase/products";
import styles from "./TranslationsTab.module.scss";

interface TranslationsTabProps {
    productId: string;
    tenantId: string;
    product: V2Product;
}

type StatusKind = "manual" | "auto" | "missing";

function getStatusKind(translation: Translation | undefined): StatusKind {
    if (!translation) return "missing";
    if (translation.status === "manual") return "manual";
    return "auto";
}

function getStatusBadge(kind: StatusKind) {
    switch (kind) {
        case "manual":
            return <Badge variant="primary">Manuale</Badge>;
        case "auto":
            return <Badge variant="success">Automatica</Badge>;
        case "missing":
            return <Badge variant="warning">Da tradurre</Badge>;
    }
}

export function TranslationsTab({ productId, tenantId, product }: TranslationsTabProps) {
    const { showToast } = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [translations, setTranslations] = useState<Translation[]>([]);
    const [supportedOrdered, setSupportedOrdered] = useState<SupportedLanguage[]>([]);
    const [activeCodes, setActiveCodes] = useState<string[]>([]);
    const [baseLanguage, setBaseLanguage] = useState<string>("it");
    const [currentSourceHash, setCurrentSourceHash] = useState<string | null>(null);

    const [draftValues, setDraftValues] = useState<Record<string, string>>({});
    const [savingLang, setSavingLang] = useState<string | null>(null);
    const [revertConfirmFor, setRevertConfirmFor] = useState<string | null>(null);
    const [pendingAutoLangs, setPendingAutoLangs] = useState<Set<string>>(new Set());

    const sourceText = product.description ?? "";
    const hasSource = sourceText.trim().length > 0;

    const loadData = useCallback(async () => {
        try {
            setIsLoading(true);
            const [supported, active, base, allTranslations, sourceHash] = await Promise.all([
                listAvailableLanguages(),
                getActiveTenantLanguages(tenantId),
                getTenantBaseLanguage(tenantId),
                listTranslationsForEntity(tenantId, "product", productId),
                computeFieldHash(sourceText)
            ]);

            setSupportedOrdered(supported);
            setActiveCodes(active.map(l => l.language_code));
            setBaseLanguage(base);
            const filtered = allTranslations.filter(
                t => t.field === "description" && t.entity_type === "product"
            );
            setTranslations(filtered);
            setCurrentSourceHash(sourceHash);
            setDraftValues({});

            // Clear pending state per le lingue dove la riga 'auto' è
            // ricomparsa (cron ha processato il job post-revert).
            setPendingAutoLangs(prev => {
                if (prev.size === 0) return prev;
                const next = new Set(prev);
                for (const t of filtered) {
                    if (t.status === "auto" && next.has(t.language_code)) {
                        next.delete(t.language_code);
                    }
                }
                return next.size === prev.size ? prev : next;
            });
        } catch {
            showToast({ message: "Errore nel caricamento delle traduzioni", type: "error" });
        } finally {
            setIsLoading(false);
        }
    }, [productId, tenantId, sourceText, showToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

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
        for (const t of translations) map[t.language_code] = t;
        return map;
    }, [translations]);

    const handleSaveManual = async (languageCode: string) => {
        const translation = translationsByCode[languageCode];
        const draft = draftValues[languageCode];
        const text = (draft ?? translation?.translated_text ?? "").trim();

        if (!text) {
            showToast({ message: "La traduzione non può essere vuota", type: "error" });
            return;
        }

        if (!hasSource) {
            showToast({ message: "Compila prima la descrizione italiana", type: "error" });
            return;
        }

        if (currentSourceHash === null) {
            showToast({ message: "Errore nel calcolo della firma del testo", type: "error" });
            return;
        }

        setSavingLang(languageCode);
        try {
            await upsertManualTranslation({
                tenantId,
                entityType: "product",
                entityId: productId,
                field: "description",
                languageCode,
                sourceText,
                sourceHash: currentSourceHash,
                translatedText: text
            });
            await loadData();
            showToast({ message: "Traduzione manuale salvata", type: "success" });
        } catch (err) {
            showToast({
                message: err instanceof Error ? err.message : "Errore nel salvataggio",
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
                entityType: "product",
                entityId: productId,
                field: "description",
                languageCode
            });
            setPendingAutoLangs(prev => {
                const next = new Set(prev);
                next.add(languageCode);
                return next;
            });
            await loadData();
            showToast({
                message:
                    "Tornato alla traduzione automatica. Ricarica la pagina tra qualche istante per vedere la nuova traduzione.",
                type: "success"
            });
            return true;
        } catch (err) {
            showToast({
                message: err instanceof Error ? err.message : "Errore nel ripristino",
                type: "error"
            });
            return false;
        }
    };

    if (isLoading) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>
                    <Text variant="body-sm" colorVariant="muted">
                        Caricamento traduzioni...
                    </Text>
                </div>
            </div>
        );
    }

    if (targetLanguages.length === 0) {
        return (
            <div className={styles.container}>
                <EmptyState
                    icon={<Languages size={40} strokeWidth={1.5} />}
                    title="Nessuna lingua aggiuntiva configurata"
                    description="Per gestire le traduzioni, attiva almeno una lingua oltre all'italiano nelle impostazioni del tenant."
                    action={
                        <Link to={`/business/${tenantId}/settings/languages`}>
                            <Button variant="primary">Vai alle impostazioni lingue</Button>
                        </Link>
                    }
                />
            </div>
        );
    }

    if (!hasSource) {
        return (
            <div className={styles.container}>
                <EmptyState
                    icon={<Languages size={40} strokeWidth={1.5} />}
                    title="Inserisci prima una descrizione del prodotto"
                    description="Le traduzioni vengono generate dalla descrizione italiana. Compila il campo 'Descrizione' nella tab Generale."
                />
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.intro}>
                <Text variant="title-sm" weight={600}>
                    Traduzioni del prodotto
                </Text>
                <Text variant="body-sm" colorVariant="muted">
                    Modifica manualmente le traduzioni della descrizione. Le modifiche manuali non
                    vengono sovrascritte dalla traduzione automatica.
                </Text>
            </div>

            <div className={styles.referenceCard}>
                <div className={styles.langHeader}>
                    {baseMeta?.flag_emoji && <span className={styles.flag}>{baseMeta.flag_emoji}</span>}
                    <span className={styles.langName}>
                        {baseMeta?.name_native ?? baseLanguage.toUpperCase()} (sorgente)
                    </span>
                </div>
                <Text variant="body-sm" className={styles.referenceText}>
                    {sourceText}
                </Text>
            </div>

            <div className={styles.languageList}>
                {targetLanguages.map(lang => {
                    const code = lang.code;
                    const translation = translationsByCode[code];
                    const kind = getStatusKind(translation);
                    const isPendingAuto = pendingAutoLangs.has(code);
                    const draft = draftValues[code];
                    const currentValue = draft ?? translation?.translated_text ?? "";
                    const baseline = translation?.translated_text ?? "";
                    const isDirty = currentValue !== baseline;
                    const isStaleManual =
                        kind === "manual" &&
                        currentSourceHash !== null &&
                        translation?.source_hash !== currentSourceHash;
                    const isSaving = savingLang === code;

                    if (isPendingAuto) {
                        return (
                            <div key={code} className={styles.languageCard}>
                                <div className={styles.langHeader}>
                                    {lang.flag_emoji && (
                                        <span className={styles.flag}>{lang.flag_emoji}</span>
                                    )}
                                    <span className={styles.langName}>{lang.name_native}</span>
                                    <Badge variant="warning">Traduzione in corso</Badge>
                                </div>
                                <Textarea
                                    rows={4}
                                    placeholder="Generazione automatica in corso. Ricarica la pagina tra qualche istante."
                                    value=""
                                    readOnly
                                    disabled
                                    onChange={() => {}}
                                />
                            </div>
                        );
                    }

                    return (
                        <div key={code} className={styles.languageCard}>
                            <div className={styles.langHeader}>
                                {lang.flag_emoji && <span className={styles.flag}>{lang.flag_emoji}</span>}
                                <span className={styles.langName}>{lang.name_native}</span>
                                {getStatusBadge(kind)}
                            </div>

                            {isStaleManual && (
                                <InlineBanner variant="warning">
                                    La descrizione italiana è stata modificata dopo questa traduzione.
                                    Verifica se la traduzione manuale è ancora corretta.
                                </InlineBanner>
                            )}

                            <Textarea
                                rows={4}
                                placeholder="Inserisci la traduzione manuale"
                                value={currentValue}
                                onChange={e =>
                                    setDraftValues(prev => ({ ...prev, [code]: e.target.value }))
                                }
                                disabled={isSaving}
                            />

                            <div className={styles.cardActions}>
                                {kind === "manual" && (
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        onClick={() => setRevertConfirmFor(code)}
                                        disabled={isSaving}
                                    >
                                        Torna a traduzione automatica
                                    </Button>
                                )}
                                {(isDirty || kind === "missing") && (
                                    <Button
                                        type="button"
                                        variant="primary"
                                        onClick={() => handleSaveManual(code)}
                                        loading={isSaving}
                                        disabled={isSaving}
                                    >
                                        Salva traduzione manuale
                                    </Button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className={styles.disclaimerCard}>
                <Text variant="body-sm" className={styles.disclaimerTitle}>
                    Note prodotto
                </Text>
                <Text variant="body-sm" className={styles.disclaimerBody}>
                    Le note del prodotto vengono tradotte automaticamente. La modifica manuale delle
                    traduzioni delle note non è ancora disponibile.
                </Text>
            </div>

            <ConfirmDialog
                isOpen={revertConfirmFor !== null}
                onClose={() => setRevertConfirmFor(null)}
                onConfirm={handleConfirmRevert}
                title="Tornare alla traduzione automatica?"
                message="La traduzione manuale verrà persa. Verrà generata una nuova traduzione automatica entro un minuto."
                confirmLabel="Conferma"
                confirmVariant="danger"
            />
        </div>
    );
}
