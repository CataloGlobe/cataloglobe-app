import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CalendarClock, Copy, MoreHorizontal, Trash2 } from "lucide-react";
import { useBreadcrumbItems } from "@/context/useBreadcrumbItems";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { usePermissions } from "@/context/PermissionsContext";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { canDoOnAnyActivity } from "@/lib/permissions";
import { PageGate } from "@/components/PageGate/PageGate";
import { Button } from "@/components/ui/Button/Button";
import { Badge } from "@/components/ui/Badge/Badge";
import { Card } from "@/components/ui/Card/Card";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { Switch } from "@/components/ui/Switch/Switch";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { Menu } from "@/components/ui/Menu";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import Text from "@/components/ui/Text/Text";
import { useUnsavedChangesGuard } from "@/components/ui/UnsavedChangesBar/useUnsavedChangesGuard";
import {
    DiscardChangesConfirmDialog,
    HeaderSaveAction
} from "@/pages/Dashboard/Stories/components/HeaderSaveAction";
import { buildSaveActionCompactConfig } from "@/pages/Dashboard/Stories/components/headerSaveActionCompact";
import { getToggleGuardResult } from "@utils/ruleToggleGuards";
import { ruleTypeLabel } from "./ruleTypeLabel";
import { useRuleDetail } from "./useRuleDetail";
import { TargetSection } from "./components/TargetSection";
import { AssociatedContentSection } from "./components/AssociatedContentSection";
import { FeaturedContentSection } from "./components/FeaturedContentSection";
import { SchedulingSection } from "./components/SchedulingSection";
import { HowItWorksButton, RuleTypeHelpModal } from "./components/RuleTypeHelpModal";
import styles from "./ProgrammingRuleDetail.module.scss";

const FORM_ID = "rule-detail-form";
const DUPLICATE_BLOCKED = "Salva o annulla le modifiche per duplicarla.";

/**
 * Il dettaglio di una regola, uno per i quattro tipi (P8, §50.1 d), montato
 * sulle due rotte di sempre: `scheduling/:ruleId` e
 * `scheduling/featured/:ruleId`. Una regola in evidenza aperta dalla prima
 * passa alla seconda. Due corpi: menù, prezzi e disponibilità
 * (`AssociatedContentSection`) o contenuti in evidenza
 * (`FeaturedContentSection`); «Dove si applica» e «Quando» sono comuni.
 *
 * Testata: switch (salva subito; spento col motivo se la guardia dice no),
 * ⋯ con Duplica (spenta col motivo se ci sono modifiche) ed Elimina, poi
 * `HeaderSaveAction`. Uscire con modifiche chiede (§27).
 */
export default function RuleDetailPage() {
    const { ruleId, businessId } = useParams<{ ruleId: string; businessId: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const fromType = searchParams.get("fromType");
    const { catalogLabel, productLabel, productLabelPlural } = useVerticalConfig();
    const labels = useMemo(() => ({ productLabel, productLabelPlural }), [productLabel, productLabelPlural]);
    const { permissions } = usePermissions();
    const { canEdit } = useSubscriptionGuard();
    const canWrite = permissions ? canDoOnAnyActivity(permissions, "scheduling.write") : false;
    const canRead = permissions ? canDoOnAnyActivity(permissions, "scheduling.read") : false;

    const detail = useRuleDetail({ ruleId, tenantId: businessId, canRead, catalogLabel, labels });
    const { status, rule, form, isDirty, options } = detail;

    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [isDiscardOpen, setIsDiscardOpen] = useState(false);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const helpTriggerRef = useRef<HTMLButtonElement | null>(null);
    // Dove andare quando la bozza è pulita (salvata o eliminata).
    const [leaveTo, setLeaveTo] = useState<string | null>(null);

    useUnsavedChangesGuard(isDirty);

    useEffect(() => {
        if (!leaveTo || isDirty) return;
        // Un giro dopo: la guardia (`UnsavedChangesGuardHost`, nel layout)
        // aggiorna il suo blocker negli effetti del genitore, che girano dopo
        // questi. Navigando subito la bloccherebbe ancora.
        const timer = window.setTimeout(() => navigate(leaveTo), 0);
        return () => window.clearTimeout(timer);
    }, [leaveTo, isDirty, navigate]);

    // Una regola in evidenza ha la sua rotta; le altre la generica.
    useEffect(() => {
        if (!rule || !businessId) return;
        const onFeaturedRoute = location.pathname.includes("/scheduling/featured/");
        if ((rule.rule_type === "featured") !== onFeaturedRoute) {
            const path = rule.rule_type === "featured" ? `scheduling/featured/${rule.id}` : `scheduling/${rule.id}`;
            navigate(`/business/${businessId}/${path}${location.search}`, { replace: true });
        }
    }, [rule, businessId, location.pathname, location.search, navigate]);

    const listUrl = (type: string | null | undefined) =>
        `/business/${businessId}/scheduling${type ? `?type=${type}` : ""}`;
    const backToList = listUrl(fromType ?? form?.ruleType ?? rule?.rule_type ?? "layout");
    const typeLabel = form ? ruleTypeLabel(form.ruleType, catalogLabel) : null;
    const title = form?.name || (status === "loading" ? "Caricamento regola..." : "Regola");

    const breadcrumbItems = useMemo(
        () => [{ label: "Programmazione", to: backToList }, { label: form?.name || (status === "loading" ? "Caricamento..." : "Regola") }],
        [backToList, form?.name, status]
    );
    useBreadcrumbItems(breadcrumbItems);

    // La guardia guarda lo stato salvato: è quello che si accenderebbe.
    const toggleBlocked = rule && !rule.enabled ? getToggleGuardResult(rule) : null;
    const toggleReason = toggleBlocked && !toggleBlocked.canToggle ? toggleBlocked.reason : null;
    const toggleDisabled = detail.isToggling || !canEdit || toggleReason !== null;

    const save = async () => {
        if (!form) return;
        const type = form.ruleType;
        const result = await detail.save();
        if (result.saved) {
            setLeaveTo(listUrl(type));
            return;
        }
        // Fermata dalla validazione: il focus va al primo campo sbagliato.
        if (result.invalid) {
            const target = document.getElementById(`rule-field-${result.invalid}`);
            target?.scrollIntoView({ block: "center" });
            target?.focus({ preventScroll: true });
        }
    };

    const duplicate = async () => {
        if (isDirty || !rule) return;
        const newId = await detail.duplicate();
        if (!newId) return;
        const path = rule.rule_type === "featured" ? `scheduling/featured/${newId}` : `scheduling/${newId}`;
        navigate(`/business/${businessId}/${path}?fromType=${fromType ?? rule.rule_type}`);
    };

    const remove = async (): Promise<boolean> => {
        const done = await detail.remove();
        if (done) setLeaveTo(backToList);
        return done;
    };

    // `usePageHeader` confronta testata e compatto per riferimento: vanno
    // memoizzati. I gesti passano da un ref, così la memo non li congela.
    const act = useRef({ save, duplicate, toggle: detail.toggleEnabled, discard: detail.discard });
    act.current = { save, duplicate, toggle: detail.toggleEnabled, discard: detail.discard };
    const { isSaving, isDuplicating } = detail;

    const helpType = form?.ruleType;
    const headerActions = useMemo(() =>
        form && helpType ? (
            <div className={styles.topActions}>
                {/* La guida del tipo, anche a chi legge soltanto (P4). */}
                <HowItWorksButton ref={helpTriggerRef} ruleType={helpType} onClick={() => setIsHelpOpen(true)} />
                {canWrite && (
                    <>
                        <span className={styles.enabledToggle}>
                            {toggleReason ? (
                                // Uno switch spento non riceve il puntatore: il
                                // contenitore focusabile porta il motivo.
                                <Tooltip content={toggleReason} side="bottom">
                                    <span tabIndex={0} aria-label={toggleReason}>
                                        <Switch ariaLabel={`Attiva o disattiva ${form.name}`} checked={form.enabled} onChange={() => {}} disabled />
                                    </span>
                                </Tooltip>
                            ) : (
                                <Switch
                                    ariaLabel={`Attiva o disattiva ${form.name}`}
                                    checked={form.enabled}
                                    onChange={checked => void act.current.toggle(checked)}
                                    disabled={toggleDisabled}
                                />
                            )}
                            <Text variant="body-sm" colorVariant="muted" as="span">
                                {form.enabled ? "Attiva" : "Spenta"}
                            </Text>
                        </span>
                        <Menu
                            align="end"
                            trigger={
                                <Button variant="secondary" aria-label="Altre azioni sulla regola" disabled={!canEdit || isDuplicating}>
                                    <MoreHorizontal size={16} />
                                </Button>
                            }
                        >
                            <Menu.Item
                                icon={Copy}
                                onSelect={() => void act.current.duplicate()}
                                disabled={isDirty}
                                description={isDirty ? DUPLICATE_BLOCKED : undefined}
                            >
                                Duplica
                            </Menu.Item>
                            <Menu.Item icon={Trash2} variant="destructive" onSelect={() => setIsDeleteOpen(true)}>
                                Elimina
                            </Menu.Item>
                        </Menu>
                        {canEdit && (
                            <HeaderSaveAction
                                isDirty={isDirty}
                                isSaving={isSaving}
                                onSave={() => void act.current.save()}
                                onDiscard={() => act.current.discard()}
                            />
                        )}
                    </>
                )}
            </div>
        ) : undefined,
        [form, helpType, canWrite, canEdit, isDirty, isSaving, isDuplicating, toggleReason, toggleDisabled]
    );

    // Compatto: lo switch resta a vista (è lo stato della regola), Duplica ed
    // Elimina nel kebab, Salva/Annulla come in tutte le pagine con
    // `HeaderSaveAction`.
    const headerCompact = useMemo<PageHeaderCompactConfig | undefined>(() =>
        form && canWrite
            ? (() => {
                  const saveConfig = canEdit
                      ? buildSaveActionCompactConfig({
                            isDirty,
                            isSaving,
                            onSave: () => void act.current.save(),
                            onRequestDiscard: () => setIsDiscardOpen(true)
                        })
                      : {};
                  return {
                      ...saveConfig,
                      statusControl: {
                          options: [
                              { value: "enabled", label: "Attiva" },
                              { value: "disabled", label: "Spenta" }
                          ],
                          value: form.enabled ? "enabled" : "disabled",
                          onChange: value => void act.current.toggle(value === "enabled"),
                          label: `Attiva o disattiva ${form.name}`,
                          disabled: toggleDisabled
                      },
                      secondaryActions: [
                          { label: "Come funziona", onClick: () => setIsHelpOpen(true) },
                          ...(saveConfig.secondaryActions ?? []),
                          { label: "Duplica", onClick: () => void act.current.duplicate(), disabled: !canEdit || isDirty || isDuplicating },
                          { label: "Elimina", onClick: () => setIsDeleteOpen(true), variant: "destructive", separatorBefore: true, disabled: !canEdit }
                      ]
                  };
              })()
            : undefined,
        [form, canWrite, canEdit, isDirty, isSaving, isDuplicating, toggleDisabled]
    );

    const titleAddon = useMemo(() => (typeLabel ? <Badge variant="neutral">{typeLabel}</Badge> : undefined), [typeLabel]);

    usePageHeader({
        title,
        titleAddon,
        actions: headerActions,
        compact: headerCompact
    });

    if (permissions && !canRead) {
        return <PageGate readPermission="scheduling.read">{() => null}</PageGate>;
    }

    const body = () => {
        if (status === "notFound") {
            return (
                <EmptyState
                    variant="page"
                    icon={<CalendarClock />}
                    title="Regola non trovata"
                    description="Forse è stata eliminata."
                    action={
                        <Button variant="primary" onClick={() => navigate(backToList)}>
                            Torna a Programmazione
                        </Button>
                    }
                />
            );
        }
        if (status === "error") {
            return (
                <InlineBanner
                    variant="error"
                    action={
                        <Button variant="secondary" size="sm" onClick={() => void detail.reload()}>
                            Riprova
                        </Button>
                    }
                >
                    Non riusciamo a caricare la regola.
                </InlineBanner>
            );
        }
        if (status === "loading" || !form || !rule) {
            return (
                <div className={styles.formLayout} aria-busy="true">
                    <div className={styles.formColumnLeft}>
                        {[3, 4].map(rows => (
                            <Card key={rows}>
                                <div className={styles.skeletonFields}>
                                    {Array.from({ length: rows }, (_, i) => (
                                        <Skeleton key={i} height={i === 0 ? 20 : 40} width={i === 0 ? "40%" : "100%"} />
                                    ))}
                                </div>
                            </Card>
                        ))}
                    </div>
                    <div className={styles.formColumnRight}>
                        <Card>
                            <div className={styles.skeletonFields}>
                                {Array.from({ length: 4 }, (_, i) => (
                                    <Skeleton key={i} height={i === 0 ? 20 : 40} width={i === 0 ? "40%" : "100%"} />
                                ))}
                            </div>
                        </Card>
                    </div>
                </div>
            );
        }
        return (
            // `noValidate`: le regole sono `validateRuleForm`, coi messaggi sui
            // campi. Senza, Invio fermerebbe il form sul fumetto del browser
            // («Value must be…», in inglese) per il `min` della data di fine.
            <form
                id={FORM_ID}
                noValidate
                className={styles.formLayout}
                onSubmit={event => {
                    event.preventDefault();
                    void save();
                }}
            >
                <div className={styles.formColumnLeft}>
                    <TargetSection
                        name={form.name}
                        targetMode={form.targetMode}
                        activityIds={form.activityIds}
                        groupIds={form.groupIds}
                        tenantActivities={options.activities}
                        tenantGroups={options.groups}
                        tenantId={businessId ?? ""}
                        onFormChange={detail.updateForm}
                        nameError={detail.errors.name}
                        onNameBlur={() => detail.touch("name")}
                    />
                    {form.ruleType === "featured" ? (
                        <FeaturedContentSection
                            featuredContents={form.featuredContents}
                            tenantFeaturedContents={options.featuredContents}
                            onFormChange={detail.updateForm}
                        />
                    ) : (
                        <AssociatedContentSection
                            ruleType={form.ruleType}
                            catalogId={form.catalogId}
                            styleId={form.styleId}
                            selectedProductIds={form.selectedProductIds}
                            productOverrides={form.productOverrides}
                            visibilityProductModes={form.visibilityProductModes}
                            tenantCatalogs={options.catalogs}
                            tenantStyles={options.styles}
                            tenantProducts={options.products}
                            tenantProductGroups={options.productGroups}
                            tenantProductGroupItems={options.productGroupItems}
                            onFormChange={detail.updateForm}
                            pricesError={detail.errors.prices}
                        />
                    )}
                </div>
                <div className={styles.formColumnRight}>
                    <SchedulingSection
                        alwaysActive={form.alwaysActive}
                        startAt={form.startAt}
                        endAt={form.endAt}
                        daysEnabled={form.daysEnabled}
                        daysOfWeek={form.daysOfWeek}
                        timeFrom={form.timeFrom}
                        timeTo={form.timeTo}
                        onFormChange={detail.updateForm}
                        errors={detail.errors}
                        onFieldBlur={detail.touch}
                    />
                </div>
            </form>
        );
    };

    return (
        <PageGate readPermission="scheduling.read">
            {() => (
                <section className={styles.page}>
                    {body()}
                    {form && (
                        <RuleTypeHelpModal
                            isOpen={isHelpOpen}
                            ruleType={form.ruleType}
                            onClose={() => setIsHelpOpen(false)}
                            triggerRef={helpTriggerRef}
                        />
                    )}
                    <ConfirmDialog
                        isOpen={isDeleteOpen}
                        onClose={() => setIsDeleteOpen(false)}
                        onConfirm={remove}
                        title="Eliminare regola?"
                        message="Questa azione è irreversibile."
                        confirmLabel="Elimina"
                    />
                    <DiscardChangesConfirmDialog
                        isOpen={isDiscardOpen}
                        onClose={() => setIsDiscardOpen(false)}
                        onDiscard={detail.discard}
                    />
                </section>
            )}
        </PageGate>
    );
}
