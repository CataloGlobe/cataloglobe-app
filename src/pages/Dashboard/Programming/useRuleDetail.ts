import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/context/Toast/ToastContext";
import {
    deleteLayoutRule,
    duplicateRule,
    getLayoutRuleById,
    listLayoutRuleOptions,
    updateRule,
    updateScheduleEnabled,
    type LayoutRule,
    type LayoutRuleOption,
    type ProductGroupAssignmentOption
} from "@/services/supabase/layoutScheduling";
import { updateFeaturedRule } from "@/services/supabase/featuredScheduling";
import { updateScheduleTargets } from "@/services/supabase/scheduleTargets";
import { parseDecimalPrice } from "@/utils/priceParser";
import { isLayoutRuleDraft } from "@/utils/scheduleDraft";
import {
    buildRuleDetailForm,
    firstRuleFormError,
    missingDraftFields,
    todayLocal,
    validateRuleForm,
    type ProductLabels,
    type RuleDetailForm,
    type RuleFormErrors,
    type RuleFormField
} from "@/utils/ruleDetailForm";

export type RuleDetailStatus = "loading" | "ready" | "notFound" | "error";

type Options = {
    activities: LayoutRuleOption[];
    activityGroups: LayoutRuleOption[];
    catalogs: LayoutRuleOption[];
    styles: LayoutRuleOption[];
    products: LayoutRuleOption[];
    productGroups: LayoutRuleOption[];
    productGroupItems: ProductGroupAssignmentOption[];
    featuredContents: LayoutRuleOption[];
};

const EMPTY_OPTIONS: Options = {
    activities: [],
    activityGroups: [],
    catalogs: [],
    styles: [],
    products: [],
    productGroups: [],
    productGroupItems: [],
    featuredContents: []
};

/**
 * Il dettaglio di una regola, qualunque tipo (P8, §50.1 d): carica regola e
 * opzioni, tiene la bozza contro lo stato salvato (snapshot), salva per tipo
 * (`updateRule` / `updateFeaturedRule` + `updateScheduleTargets`, invariati).
 * La pagina (`RuleDetailPage`) sceglie il corpo e porta la testata.
 *
 * Le validazioni sono `validateRuleForm`; i campi mancanti non bloccano, la
 * regola si salva spenta come bozza (`missingDraftFields`), e completare una
 * bozza la accende (`isLayoutRuleDraft` sulla regola salvata).
 */
export function useRuleDetail({
    ruleId,
    tenantId,
    canRead,
    catalogLabel,
    labels
}: {
    ruleId: string | undefined;
    tenantId: string | undefined;
    canRead: boolean;
    catalogLabel: string;
    /** La parola del vertical per «prodotto», nei messaggi. */
    labels: ProductLabels;
}) {
    const { showToast } = useToast();
    const [status, setStatus] = useState<RuleDetailStatus>("loading");
    const [rule, setRule] = useState<LayoutRule | null>(null);
    const [options, setOptions] = useState<Options>(EMPTY_OPTIONS);
    const [form, setForm] = useState<RuleDetailForm | null>(null);
    const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isToggling, setIsToggling] = useState(false);
    const [isDuplicating, setIsDuplicating] = useState(false);

    const isDirty = Boolean(form && savedSnapshot && JSON.stringify(form) !== savedSnapshot);

    /* Gli errori si calcolano sempre sul form di adesso, così seguono le
       correzioni; si mostrano per i campi lasciati (blur) e, dopo un
       salvataggio fermato, per tutti. */
    const [touched, setTouched] = useState<Set<RuleFormField>>(() => new Set());
    const [showAllErrors, setShowAllErrors] = useState(false);
    // L'inizio salvato può restare nel passato (regola già partita, PR #140):
    // l'errore vale solo per una data scelta adesso.
    const savedStartAt = useMemo(
        () => (savedSnapshot ? (JSON.parse(savedSnapshot) as RuleDetailForm).startAt : ""),
        [savedSnapshot]
    );
    const allErrors = useMemo<RuleFormErrors>(
        () =>
            form
                ? validateRuleForm(form, { today: todayLocal(), products: options.products, labels, savedStartAt })
                : {},
        [form, options.products, labels, savedStartAt]
    );
    const errors = useMemo<RuleFormErrors>(() => {
        if (showAllErrors) return allErrors;
        const visible: RuleFormErrors = {};
        for (const field of touched) if (allErrors[field]) visible[field] = allErrors[field];
        return visible;
    }, [allErrors, showAllErrors, touched]);
    const touch = useCallback((field: RuleFormField) => {
        setTouched(prev => (prev.has(field) ? prev : new Set(prev).add(field)));
    }, []);

    const load = useCallback(async () => {
        // Gate prima della fetch: senza lettura non si chiede niente.
        if (!ruleId || !tenantId || !canRead) return;
        setStatus("loading");
        try {
            const [ruleData, optionsData] = await Promise.all([
                getLayoutRuleById(ruleId, tenantId),
                listLayoutRuleOptions(tenantId)
            ]);
            if (!ruleData) {
                setStatus("notFound");
                return;
            }
            const nextForm = buildRuleDetailForm(
                ruleData,
                new Map(optionsData.activities.map(a => [a.id, a])),
                catalogLabel
            );
            const snapshot = JSON.stringify(nextForm);
            // Una regola di menù senza stile parte dallo stile di sistema. Lo
            // snapshot resta sull'originale: la regola risulta modificata e
            // l'utente può salvare lo stile proposto.
            if (ruleData.rule_type === "layout" && !nextForm.styleId) {
                const own = optionsData.styles.filter(s => s.tenant_id === ruleData.tenant_id);
                const fallback = own.find(s => s.is_system) ?? own[0];
                if (fallback) nextForm.styleId = fallback.id;
            }
            setRule(ruleData);
            setOptions({
                activities: optionsData.activities,
                activityGroups: optionsData.activityGroups,
                catalogs: optionsData.catalogs,
                styles: optionsData.styles,
                products: optionsData.products,
                productGroups: optionsData.productGroups,
                productGroupItems: optionsData.productGroupItems,
                featuredContents: optionsData.featuredContents
            });
            setForm(nextForm);
            setSavedSnapshot(snapshot);
            setTouched(new Set());
            setShowAllErrors(false);
            setStatus("ready");
        } catch (error) {
            console.error("Errore caricamento dettaglio regola:", error);
            setStatus("error");
        }
    }, [ruleId, tenantId, canRead, catalogLabel]);

    useEffect(() => {
        void load();
    }, [load]);

    /** Le opzioni dell'azienda della regola; i gruppi senza quello di sistema. */
    const tenantOptions = useMemo(() => {
        const own = <T extends { tenant_id: string }>(items: T[]) =>
            rule ? items.filter(item => item.tenant_id === rule.tenant_id) : items;
        return {
            activities: own(options.activities),
            groups: own(options.activityGroups).filter(group => !group.is_system),
            catalogs: own(options.catalogs),
            styles: own(options.styles),
            products: own(options.products),
            productGroups: own(options.productGroups),
            productGroupItems: own(options.productGroupItems),
            featuredContents: own(options.featuredContents)
        };
    }, [options, rule]);

    const updateForm = useCallback((updates: Partial<RuleDetailForm>) => {
        setForm(prev => (prev ? { ...prev, ...updates } : prev));
    }, []);

    const discard = useCallback(() => {
        if (savedSnapshot) setForm(JSON.parse(savedSnapshot) as RuleDetailForm);
        setTouched(new Set());
        setShowAllErrors(false);
    }, [savedSnapshot]);

    const nameOf = () => form?.name || "la regola";

    /* Lo switch salva subito, fuori dalla bozza: non tocca l'auto-attivazione
       al salvataggio. La guardia (`getToggleGuardResult`) la valuta la pagina
       su `rule`, lo stato salvato, che è quello che si accenderebbe. */
    const toggleEnabled = async (next: boolean) => {
        if (!rule) return;
        setIsToggling(true);
        try {
            await updateScheduleEnabled(rule.id, next);
            setRule(prev => (prev ? { ...prev, enabled: next } : prev));
            setForm(prev => (prev ? { ...prev, enabled: next } : prev));
            // Lo stato è già salvato: non è una modifica pendente.
            setSavedSnapshot(prev => (prev ? JSON.stringify({ ...(JSON.parse(prev) as RuleDetailForm), enabled: next }) : prev));
            showToast({ type: "success", message: next ? "Regola abilitata." : "Regola disabilitata.", duration: 2000 });
        } catch (error) {
            console.error("Errore update stato regola:", error);
            showToast({ type: "error", message: `Non siamo riusciti a cambiare lo stato di ${nameOf()}.`, duration: 3000 });
        } finally {
            setIsToggling(false);
        }
    };

    /** L'id della copia, o null. La copia è della regola salvata: con modifiche la pagina spegne la voce. */
    const duplicate = async (): Promise<string | null> => {
        if (!rule) return null;
        setIsDuplicating(true);
        try {
            const newId = await duplicateRule(rule.id, rule.tenant_id);
            showToast({ type: "success", message: "Regola duplicata: la copia è spenta.", duration: 2200 });
            return newId;
        } catch (error) {
            console.error("Errore duplicazione regola:", error);
            showToast({ type: "error", message: `Non siamo riusciti a duplicare ${nameOf()}.`, duration: 3000 });
            return null;
        } finally {
            setIsDuplicating(false);
        }
    };

    const remove = async (): Promise<boolean> => {
        if (!rule) return false;
        try {
            await deleteLayoutRule(rule.id);
            // Niente più da salvare: l'uscita non deve chiedere.
            if (savedSnapshot) setForm(JSON.parse(savedSnapshot) as RuleDetailForm);
            showToast({ type: "success", message: "Regola eliminata.", duration: 2200 });
            return true;
        } catch (error) {
            console.error("Errore eliminazione regola:", error);
            showToast({ type: "error", message: `Non siamo riusciti a eliminare ${nameOf()}.`, duration: 3000 });
            return false;
        }
    };

    /**
     * `saved` se è salvata. Con un errore di validazione non si scrive niente:
     * gli errori vanno sui campi (niente toast) e `invalid` dice il primo,
     * dove la pagina porta il focus.
     */
    const save = async (): Promise<{ saved: true } | { saved: false; invalid?: RuleFormField }> => {
        if (!form || !rule) return { saved: false };

        const invalid = firstRuleFormError(allErrors);
        if (invalid) {
            setShowAllErrors(true);
            return { saved: false, invalid };
        }

        const missing = missingDraftFields(form, catalogLabel, labels);
        const isForcedDraft = missing.length > 0;
        const autoActivate = !isForcedDraft && !rule.enabled && isLayoutRuleDraft(rule);
        const enabled = isForcedDraft ? false : autoActivate ? true : form.enabled;
        const isWindow = form.timeMode === "window";
        const hasDays = form.daysOfWeek.length > 0;
        const hasBothTimes = Boolean(form.timeFrom && form.timeTo);
        const name = form.name.trim();
        const startAt = form.startAt ? new Date(form.startAt + "T00:00:00").toISOString() : null;
        const endAt = form.endAt ? new Date(form.endAt + "T23:59:59").toISOString() : null;
        const timeFrom = isWindow && hasBothTimes ? form.timeFrom : null;
        const timeTo = isWindow && hasBothTimes ? form.timeTo : null;

        setIsSaving(true);
        try {
            if (form.ruleType === "featured") {
                await updateFeaturedRule({
                    id: rule.id,
                    tenantId: rule.tenant_id,
                    name,
                    enabled,
                    startAt,
                    endAt,
                    timeFrom,
                    timeTo,
                    daysOfWeek: isWindow && hasDays ? form.daysOfWeek.map(Number) : [],
                    alwaysActive: form.alwaysActive,
                    targetMode: form.targetMode,
                    activityIds: form.activityIds,
                    groupIds: form.groupIds,
                    featuredContents: form.featuredContents.map(fc => ({
                        featured_content_id: fc.featuredContentId,
                        slot: fc.slot,
                        sort_order: fc.sortOrder
                    }))
                });
            } else {
                await updateRule({
                    scheduleId: rule.id,
                    tenantId: rule.tenant_id,
                    ruleType: form.ruleType,
                    name,
                    applyToAll: form.targetMode === "all",
                    activityIds: form.activityIds,
                    groupIds: form.groupIds,
                    enabled,
                    timeMode: form.timeMode,
                    daysOfWeek: isWindow && hasDays ? form.daysOfWeek.map(Number) : null,
                    timeFrom,
                    timeTo,
                    startAt,
                    endAt,
                    layout:
                        form.ruleType === "layout"
                            ? { catalogId: form.catalogId || null, styleId: form.styleId || null }
                            : undefined,
                    priceProducts:
                        form.ruleType === "price"
                            ? form.selectedProductIds.flatMap(productId => {
                                  const formats = options.products.find(p => p.id === productId)?.format_values ?? [];
                                  const draft = form.productOverrides[productId];
                                  if (formats.length > 0) {
                                      return formats.map(fv => ({
                                          productId,
                                          optionValueId: fv.id as string | null,
                                          overridePrice: parseDecimalPrice(draft?.valueOverrides?.[fv.id]?.overridePrice ?? "0"),
                                          showOriginalPrice: draft?.valueOverrides?.[fv.id]?.showOriginalPrice ?? false
                                      }));
                                  }
                                  return [
                                      {
                                          productId,
                                          optionValueId: null,
                                          overridePrice: parseDecimalPrice(draft?.overridePrice ?? "0"),
                                          showOriginalPrice: draft?.showOriginalPrice ?? false
                                      }
                                  ];
                              })
                            : undefined,
                    visibilityProductOverrides:
                        form.ruleType === "visibility"
                            ? form.selectedProductIds.map(productId => ({
                                  productId,
                                  mode: form.visibilityProductModes[productId] ?? "hide"
                              }))
                            : undefined
                });
            }

            // schedule_targets: set completo, sostituisce le colonne inline
            // target_type/target_id (shim per Edge/resolver, scritte a parte).
            // La RPC rifiuta apply_to_all e l'array vuoto (una regola senza
            // sedi resta bozza): in quei casi non si chiama.
            if (form.targetMode === "activities" && form.activityIds.length > 0) {
                await updateScheduleTargets(
                    rule.id,
                    form.activityIds.map(id => ({ targetType: "activity" as const, targetId: id }))
                );
            } else if (form.targetMode === "groups" && form.groupIds.length > 0) {
                await updateScheduleTargets(
                    rule.id,
                    form.groupIds.map(id => ({ targetType: "activity_group" as const, targetId: id }))
                );
            }

            if (isForcedDraft) {
                showToast({ type: "warning", message: `Salvata come bozza. Da completare: ${missing.join(", ")}.`, duration: 4000 });
            } else if (autoActivate) {
                showToast({ type: "success", message: "Regola salvata e attivata.", duration: 2200 });
            } else {
                showToast({ type: "success", message: "Regola salvata.", duration: 2200 });
            }
            // Salvata: la bozza è lo stato nuovo, l'uscita non deve chiedere.
            setSavedSnapshot(JSON.stringify(form));
            return { saved: true };
        } catch (error) {
            console.error("Errore salvataggio regola:", error);
            const code = (error as { code?: string })?.code;
            showToast({
                type: "error",
                message:
                    code === "23505"
                        ? "Questo contenuto è già associato a questa regola."
                        : "Non siamo riusciti a salvare la regola.",
                duration: 3000
            });
            return { saved: false };
        } finally {
            setIsSaving(false);
        }
    };

    return {
        status,
        rule,
        form,
        isDirty,
        errors,
        touch,
        options: tenantOptions,
        reload: load,
        updateForm,
        discard,
        toggleEnabled,
        duplicate,
        remove,
        save,
        isSaving,
        isToggling,
        isDuplicating
    };
}
