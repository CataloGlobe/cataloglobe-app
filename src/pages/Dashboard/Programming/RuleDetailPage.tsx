import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CalendarClock, Copy, MoreHorizontal, Trash2 } from "lucide-react";
import { useBreadcrumbItems } from "@/context/useBreadcrumbItems";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { usePermissions } from "@/context/usePermissions";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { canDoOnAnyActivity, canWriteRule, isTenantWide } from "@/lib/permissions";
import { listActivityIdsByGroup } from "@/services/supabase/activity-groups";
import { READ_ONLY_REASON } from "./components/RuleTable";
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
} from "@/components/ui/HeaderSaveAction/HeaderSaveAction";
import { buildSaveActionCompactConfig } from "@/components/ui/HeaderSaveAction/headerSaveActionCompact";
import { getToggleGuardResult } from "@utils/ruleToggleGuards";
import { ruleTypeLabel } from "./ruleTypeLabel";
import { useRuleDetail } from "./useRuleDetail";
import { TargetSection } from "./components/TargetSection";
import { AssociatedContentSection } from "./components/AssociatedContentSection";
import { FeaturedContentSection } from "./components/FeaturedContentSection";
import { SchedulingSection } from "./components/SchedulingSection";
import { HowItWorksButton, RuleTypeHelpModal } from "./components/RuleTypeHelpModal";
import { sharedRuleNotice } from "./sharedRuleNotice";
import { useDbWritableRules } from "./useDbWritableRules";
import styles from "./ProgrammingRuleDetail.module.scss";

const FORM_ID = "rule-detail-form";
const DUPLICATE_BLOCKED = "Salva o annulla le modifiche per duplicarla.";

/**
 * Il dettaglio di una regola, uno per i quattro tipi (P8, §50.1 d), montato
 * sulle due rotte di sempre: `scheduling/:ruleId` e
 * `scheduling/featured/:ruleId`, e sulle stesse dentro la sede
 * (`locations/:activityId/programmazione/...`, T9b). Una regola in evidenza aperta dalla prima
 * passa alla seconda. Due corpi: menù, prezzi e disponibilità
 * (`AssociatedContentSection`) o contenuti in evidenza
 * (`FeaturedContentSection`); «Dove si applica» e «Quando» sono comuni.
 *
 * Testata: switch (salva subito; spento col motivo se la guardia dice no),
 * ⋯ con Duplica (spenta col motivo se ci sono modifiche) ed Elimina, poi
 * `HeaderSaveAction`. Uscire con modifiche chiede (§27).
 */
export default function RuleDetailPage() {
    const { ruleId, businessId, activityId: routeActivityId } = useParams<{
        ruleId: string;
        businessId: string;
        activityId?: string;
    }>();
    // Aperta dalla sede (T9b, PG7): stesso componente, base della sede, così
    // header e «←» restano sulla sede.
    const schedulingBase = routeActivityId
        ? `/business/${businessId}/locations/${routeActivityId}/programmazione`
        : `/business/${businessId}/scheduling`;
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const fromType = searchParams.get("fromType");
    const { catalogLabel, productLabel, productLabelPlural } = useVerticalConfig();
    const labels = useMemo(() => ({ productLabel, productLabelPlural }), [productLabel, productLabelPlural]);
    const { permissions } = usePermissions();
    const { canEdit, status: subscriptionStatus } = useSubscriptionGuard();
    const canWriteAny = permissions ? canDoOnAnyActivity(permissions, "scheduling.write") : false;
    const canRead = permissions ? canDoOnAnyActivity(permissions, "scheduling.read") : false;
    // Una sola vista in sola lettura, come Prodotti e Stili: senza permesso o
    // con l'abbonamento fermo il form è in un `fieldset disabled`. Finché
    // permessi e azienda caricano, niente banner.
    const detail = useRuleDetail({ ruleId, tenantId: businessId, canRead, catalogLabel, labels });
    const { status, rule, form, isDirty, options } = detail;

    // Permesso di questa regola, come `can_write_schedule` (T9b): conta dove
    // vale la regola salvata, non il form. I gruppi servono con le loro sedi.
    const [groupMembers, setGroupMembers] = useState<Map<string, string[]> | null>(null);
    const ruleGroupKey = rule?.groupIds.join(",") ?? "";
    useEffect(() => {
        const groupIds = ruleGroupKey ? ruleGroupKey.split(",") : [];
        const assignable = options.groups.map(group => group.id);
        const ids = Array.from(new Set([...groupIds, ...assignable]));
        if (ids.length === 0) {
            setGroupMembers(new Map());
            return;
        }
        let cancelled = false;
        listActivityIdsByGroup(ids)
            .then(byGroup => {
                if (!cancelled) setGroupMembers(new Map(Object.entries(byGroup)));
            })
            .catch(error => {
                console.error("Errore sedi dei gruppi:", error);
                if (!cancelled) setGroupMembers(new Map());
            });
        return () => {
            cancelled = true;
        };
    }, [ruleGroupKey, options.groups]);
    const tenantWide = permissions ? isTenantWide(permissions) : false;
    // Un ruolo di sede vede solo le sue sedi della regola (RLS): se da qui
    // sembra sua, decide il database, che conosce anche quelle altrui.
    const clientWrite = !!permissions && !!rule && canWriteRule(permissions, rule, groupMembers ?? undefined);
    const askDb = clientWrite && !tenantWide;
    const ruleIdForDb = useMemo(() => (askDb && rule ? [rule.id] : []), [askDb, rule]);
    const dbWritable = useDbWritableRules(ruleIdForDb, !!permissions && !tenantWide);
    const canWrite =
        permissions && rule
            ? clientWrite && (tenantWide || dbWritable.get(rule.id) === true)
            : canWriteAny && tenantWide;
    const dbPending = askDb && !!rule && !dbWritable.has(rule.id);
    // Aperta dalla sede (PG7): se la regola vale anche altrove, lo si dice
    // prima di cambiarla. Conta la regola salvata, non il form.
    const sharedNotice =
        routeActivityId && rule && groupMembers
            ? sharedRuleNotice(rule, routeActivityId, options.activities, groupMembers)
            : null;
    // Un ruolo di sede assegna solo le sue sedi e i gruppi tutti suoi (come
    // `update_schedule_targets`); «Tutte le sedi» resta a owner e admin.
    const myActivityIds = permissions?.activityIds;
    const assignableActivities = useMemo(
        () => (tenantWide || !myActivityIds ? options.activities : options.activities.filter(a => myActivityIds.includes(a.id))),
        [myActivityIds, options.activities, tenantWide]
    );
    const assignableGroups = useMemo(
        () =>
            tenantWide || !myActivityIds
                ? options.groups
                : options.groups.filter(group => {
                      const members = groupMembers?.get(group.id) ?? [];
                      return members.length > 0 && members.every(id => myActivityIds.includes(id));
                  }),
        [groupMembers, myActivityIds, options.groups, tenantWide]
    );

    const readOnlyReason =
        permissions && !canWriteAny
            ? "Sola lettura: per modificare le regole serve il ruolo di amministratore o di manager della sede."
            : permissions && rule && !canWrite && !dbPending
              ? `Sola lettura: ${READ_ONLY_REASON.charAt(0).toLowerCase()}${READ_ONLY_REASON.slice(1)}.`
              : subscriptionStatus !== null && !canEdit
              ? "Sola lettura: l'abbonamento non è attivo."
              : null;
    // Finché il database non ha risposto il form resta fermo, senza banner.
    const readOnly = readOnlyReason !== null || dbPending;

    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [isDiscardOpen, setIsDiscardOpen] = useState(false);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const helpTriggerRef = useRef<HTMLButtonElement | null>(null);
    // Dove andare quando la bozza è pulita (salvata o eliminata).
    const [leaveTo, setLeaveTo] = useState<string | null>(null);

    // Chi non può salvare non ha modifiche da perdere: niente trappola all'uscita.
    useUnsavedChangesGuard(isDirty && !readOnly);

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
        const onFeaturedRoute = location.pathname.includes("/featured/");
        if ((rule.rule_type === "featured") !== onFeaturedRoute) {
            const path = rule.rule_type === "featured" ? `featured/${rule.id}` : rule.id;
            navigate(`${schedulingBase}/${path}${location.search}`, { replace: true });
        }
    }, [rule, businessId, location.pathname, location.search, navigate, schedulingBase]);

    const listUrl = (type: string | null | undefined) => `${schedulingBase}${type ? `?type=${type}` : ""}`;
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
        const path = rule.rule_type === "featured" ? `featured/${newId}` : newId;
        navigate(`${schedulingBase}/${path}?fromType=${fromType ?? rule.rule_type}`);
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
                            {tenantWide && (
                                <Menu.Item
                                    icon={Copy}
                                    onSelect={() => void act.current.duplicate()}
                                    disabled={isDirty}
                                    description={isDirty ? DUPLICATE_BLOCKED : undefined}
                                >
                                    Duplica
                                </Menu.Item>
                            )}
                            {tenantWide && <Menu.Separator />}
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
        [form, helpType, canWrite, canEdit, isDirty, isSaving, isDuplicating, tenantWide, toggleReason, toggleDisabled]
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
                          ...(tenantWide
                              ? [{ label: "Duplica", onClick: () => void act.current.duplicate(), disabled: !canEdit || isDirty || isDuplicating }]
                              : []),
                          { label: "Elimina", onClick: () => setIsDeleteOpen(true), variant: "destructive", separatorBefore: true, disabled: !canEdit }
                      ]
                  };
              })()
            : undefined,
        [form, canWrite, canEdit, isDirty, isSaving, isDuplicating, tenantWide, toggleDisabled]
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
            <fieldset className={styles.readOnlyScope} disabled={readOnly}>
            {sharedNotice && (
                <InlineBanner
                    variant="info"
                    action={
                        readOnly ? undefined : (
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() =>
                                    document.getElementById("rule-targets")?.scrollIntoView({ behavior: "smooth", block: "start" })
                                }
                            >
                                Modifica sedi
                            </Button>
                        )
                    }
                >
                    {sharedNotice}
                </InlineBanner>
            )}
            {readOnlyReason && <InlineBanner variant="info">{readOnlyReason}</InlineBanner>}
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
                        tenantActivities={assignableActivities}
                        tenantGroups={assignableGroups}
                        allowAllSites={tenantWide}
                        onFormChange={detail.updateForm}
                        nameError={detail.errors.name}
                        onNameBlur={() => detail.touch("name")}
                    />
                    {form.ruleType === "featured" ? (
                        <FeaturedContentSection
                            featuredContents={form.featuredContents}
                            tenantFeaturedContents={options.featuredContents}
                            onFormChange={detail.updateForm}
                            readOnly={readOnly}
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
                        periodEnabled={form.periodEnabled}
                        startAt={form.startAt}
                        endAt={form.endAt}
                        timeEnabled={form.timeEnabled}
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
            </fieldset>
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
