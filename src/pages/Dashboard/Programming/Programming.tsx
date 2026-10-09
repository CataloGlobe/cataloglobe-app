import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Calendar, ChevronDown, List, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { Badge } from "@/components/ui/Badge/Badge";
import { IconButton } from "@/components/ui/Button/IconButton";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { BulkBar } from "@/components/ui/BulkBar/BulkBar";
import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { Menu } from "@/components/ui/Menu";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch/ToolbarSearch";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { SplitButton, type SplitButtonAction } from "@/components/ui/SplitButton";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { useTenantId } from "@/context/useTenantId";
import { useSedeScope } from "@/hooks/useSedeScope";
import { usePermissions } from "@/context/usePermissions";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { canDoOnActivity, canDoOnAnyActivity, canWriteRule, isTenantWide } from "@/lib/permissions";
import { useDbWritableRules } from "./useDbWritableRules";
import { listActivityIdsByGroup } from "@/services/supabase/activity-groups";
import { PageGate } from "@/components/PageGate/PageGate";
import {
    createRuleDraft,
    deleteLayoutRule,
    duplicateRule,
    listLayoutRuleOptions,
    listLayoutRules,
    updateScheduleEnabled,
    type LayoutRule,
    type LayoutRuleOption,
    type RuleType
} from "@/services/supabase/layoutScheduling";
import { createFeaturedRuleDraft } from "@/services/supabase/featuredScheduling";
import { scopeRuleToActivity } from "@/services/supabase/scheduleTargets";
import { countManualOverridesByActivity } from "@/services/supabase/activeCatalog";
import { toRomeDateTime } from "@/services/supabase/schedulingNow";
import { buildScheduleMatrix } from "@/utils/scheduleMatrix";
import { NowCard } from "./components/NowCard";
import { CompanyNowCard } from "./components/CompanyNowCard";
import { schedulingPath } from "./schedulingPaths";
import { matrixLayers } from "./components/matrixLayers";
import { RuleTable } from "./components/RuleTable";
import { computeRuleInsights, toCompetitionRule } from "@/utils/ruleInsights";
import { compareCandidates } from "@shared/scheduleCompetition";
import { describeTarget } from "./components/ruleTarget";
import { measureTextWidth } from "@/utils/measureText";
import { HowItWorksButton, RuleTypeHelpModal } from "./components/RuleTypeHelpModal";
import CalendarioView from "./calendar/CalendarioView";
import type { CalNames } from "./calendar/calendarModel";
import type { ProductInfo } from "./calendar/CalendarioPanel";
import { dropItem, dropRule } from "./calendar/calendarWrites";
import type { PickProduct } from "./calendar/calendarDraft";
import { dropDraft, saveDraft } from "./calendar/calendarSave";
import { listBaseProductsForPickerWithCategory } from "@/services/supabase/products";
import { RuleSimulatorDrawer } from "./components/RuleSimulatorDrawer";
import { isLayoutRuleDraft } from "@/utils/scheduleDraft";
import { deriveScheduleStatus } from "@/utils/scheduleStatus";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { ruleTypeLabel } from "./ruleTypeLabel";
import { withPluralArticle } from "@/utils/ruleDetailForm";
import styles from "./Programming.module.scss";

type RuleTypeFilter = RuleType | "all";

type RuleTypeOption = { value: RuleTypeFilter; label: string; description: string };

/** I valori del filtro per tipo, col nome del verticale (§22, dizionario #12). */
function ruleTypeOptions(catalogLabel: string, products: string): RuleTypeOption[] {
    const menu = catalogLabel.toLowerCase();
    // «Tutte» per prima, come nel mockup: è la vista d'insieme, i tipi la
    // restringono. L'atterraggio resta «Menù e stile» (passo 2, deviazione 7).
    return [
        { value: "all", label: "Tutte", description: "Tutte le regole, di ogni tipo." },
        // PG3: nell'ordine in cui si applicano, come i passaggi della card «Adesso».
        { value: "layout", label: ruleTypeLabel("layout", catalogLabel), description: `Decidono quale ${menu} e quale stile mostrare` },
        { value: "visibility", label: ruleTypeLabel("visibility", catalogLabel), description: `Nascondono alcuni ${products}, o li segnano come non disponibili` },
        { value: "price", label: ruleTypeLabel("price", catalogLabel), description: `Cambiano il prezzo di alcuni ${products}` },
        { value: "featured", label: ruleTypeLabel("featured", catalogLabel), description: "Programmano quando mostrare contenuti in evidenza" }
    ];
}

/**
 * Copy dell'empty state "vuoto assoluto", uno per tab. Volutamente separato da
 * `ruleTypeOptions().description`: quella riga resta come sottotitolo sopra
 * la lista, e riusarla qui la mostrerebbe due volte identica nella stessa
 * schermata. Qui il testo spiega a cosa serve il tipo di regola e qual è la
 * prima mossa; là descrive la tab in una riga.
 */
const emptyStateCopy = (menu: string, product: string, products: string): Record<RuleTypeFilter, { title: string; description: string }> => ({
    layout: {
        title: "Decidi cosa mostrare, e quando",
        description:
            `Una regola sceglie il ${menu} e lo stile da mostrare in una sede, in una finestra di tempo: colazione fino alle 11, cena dalle 19. Senza finestra, vale sempre.`
    },
    featured: {
        title: "Fai comparire promozioni, eventi e avvisi",
        description:
            `Scegli il contenuto da mettere in risalto e il periodo in cui deve apparire: compare e sparisce da solo, sopra o sotto il ${menu}.`
    },
    price: {
        title: "Applica uno sconto per un giorno o un periodo",
        description:
            `Happy hour del giovedì, promozione di agosto: il ${product} resta uno, cambia solo il prezzo nel periodo che scegli.`
    },
    visibility: {
        title: `Gestisci ${withPluralArticle(products)} finiti o fuori stagione`,
        description:
            "Puoi nasconderlo del tutto o lasciarlo visibile segnandolo come non disponibile, per una sede o in certi orari."
    },
    all: {
        title: "Le regole decidono cosa vedono i clienti, e quando",
        description:
            `${menu.charAt(0).toUpperCase()}${menu.slice(1)} e stile, contenuti in risalto, sconti e disponibilità: ogni regola vale per una sede e una finestra di tempo.`
    }
});

function getRuleTargetLabel(rule: LayoutRule, activityById: Map<string, LayoutRuleOption>): string {
    if (rule.target_type === "activity_group") {
        if (rule.target_group?.is_system) return "Tutte le sedi";
        return rule.target_group?.name ?? rule.target_id;
    }

    return activityById.get(rule.target_id)?.name ?? rule.target_id;
}

function getRuleDisplayName(rule: LayoutRule, catalogLabel: string): string {
    return (rule.name ?? `${ruleTypeLabel(rule.rule_type, catalogLabel)} · ${rule.id.slice(0, 6)}`).trim();
}

export default function Programming() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const currentTenantId = useTenantId();
    // Due livelli (T9b, PG6): dentro la sede (`/locations/:activityId/programmazione`)
    // la sede è nel path e vince su `?sede=`; fuori, le regole dell'azienda.
    const { activityId: routeActivityId } = useParams<{ activityId?: string }>();
    const schedulingBase = routeActivityId
        ? `/business/${currentTenantId}/locations/${routeActivityId}/programmazione`
        : `/business/${currentTenantId}/scheduling`;
    const { showToast } = useToast();
    const { catalogLabel, productLabel, productLabelPlural } = useVerticalConfig();
    const typeOptions = useMemo(() => ruleTypeOptions(catalogLabel, productLabelPlural.toLowerCase()), [catalogLabel, productLabelPlural]);
    const emptyCopy = useMemo(
        () => emptyStateCopy(catalogLabel.toLowerCase(), productLabel.toLowerCase(), productLabelPlural.toLowerCase()),
        [catalogLabel, productLabel, productLabelPlural]
    );
    const ruleHref = useCallback(
        (rule: { id: string; rule_type: RuleType }) =>
            rule.rule_type === "featured" ? `${schedulingBase}/featured/${rule.id}` : `${schedulingBase}/${rule.id}`,
        [schedulingBase]
    );
    // La Programmazione di una sede: dal chip della card e dal pannello (PG5).
    const sedeScope = useSedeScope();
    // Con una sede sola la Programmazione è quella d'azienda (`schedulingPath`).
    const seatProgrammingHref = useCallback(
        (activityId: string) => schedulingPath(currentTenantId ?? "", activityId, sedeScope.isForcedSingleSite),
        [currentTenantId, sedeScope.isForcedSingleSite]
    );
    const { permissions } = usePermissions();
    // `canEdit` usa la stessa allowlist (trialing|active|past_due) di
    // VALID_SUBSCRIPTION_STATUSES in resolve-public-catalog: se è false la
    // pagina pubblica risponde `subscription_inactive`.
    const { canEdit } = useSubscriptionGuard();
    const subscriptionInactive = !canEdit;

    const [rules, setRules] = useState<LayoutRule[]>([]);
    const [activities, setActivities] = useState<LayoutRuleOption[]>([]);
    const [activityGroups, setActivityGroups] = useState<LayoutRuleOption[]>([]);
    const [catalogs, setCatalogs] = useState<LayoutRuleOption[]>([]);
    const [stylesOptions, setStylesOptions] = useState<LayoutRuleOption[]>([]);
    const [productOptions, setProductOptions] = useState<LayoutRuleOption[]>([]);
    const [featuredOptions, setFeaturedOptions] = useState<LayoutRuleOption[]>([]);
    const [activityIdsByGroupId, setActivityIdsByGroupId] = useState<Record<string, string[]>>({});
    // «A mano» della matrice; null = non ancora contate, o conteggio fallito.
    const [manualCounts, setManualCounts] = useState<Record<string, number> | null>(null);

    const [isLoading, setIsLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [isSimulatorDrawerOpen, setIsSimulatorDrawerOpen] = useState(false);
    // Spiegazione "Come funziona": puramente on-demand, nessuno stato persistito.
    const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [ruleToDelete, setRuleToDelete] = useState<string | null>(null);
    const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
    const [updatingRules, setUpdatingRules] = useState<Set<string>>(new Set());

    const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
    const [searchTerm, setSearchTerm] = useState("");
    // Niente filtro sede nella pagina d'azienda (T9b, PG5; superato §51.11):
    // la sede si guarda da dentro la sede. Un vecchio link `?sede=<id>` porta
    // alla Programmazione di quella sede.
    const sedeFromUrl = searchParams.get("sede");
    // Le sedi di cui chi guarda legge la Programmazione: card, pannello e
    // vecchi link. Una sede senza `scheduling.read` chiuderebbe la pagina nel
    // gate.
    const readableSedi = useMemo(
        () =>
            permissions
                ? sedeScope.readableActivities.filter(a => canDoOnActivity(permissions, "scheduling.read", a.id))
                : [],
        [permissions, sedeScope.readableActivities]
    );
    const filterActivityId = routeActivityId ?? null;
    useEffect(() => {
        if (routeActivityId || !sedeFromUrl || !readableSedi.some(a => a.id === sedeFromUrl)) return;
        const params = new URLSearchParams(searchParams);
        params.delete("sede");
        const query = params.toString();
        navigate(`${seatProgrammingHref(sedeFromUrl)}${query ? `?${query}` : ""}`, { replace: true });
    }, [navigate, readableSedi, routeActivityId, searchParams, seatProgrammingHref, sedeFromUrl]);
    // Più sedi e nessuna sede nel path: la vista d'azienda (PG5).
    const companyView = !routeActivityId && readableSedi.length > 1;
    const canWrite = permissions ? canDoOnAnyActivity(permissions, "scheduling.write") : false;
    // Crea (e duplica) solo chi gestisce tutte le sedi: per un ruolo di sede
    // la creazione aspetta la RPC che crea regola e sedi insieme (T9b).
    const canCreate = canWrite && permissions !== null && permissions !== undefined && isTenantWide(permissions);
    // Stessa regola di PageGate: sulla sede del filtro, se c'è.
    const canRead = permissions
        ? filterActivityId
            ? canDoOnActivity(permissions, "scheduling.read", filterActivityId)
            : canDoOnAnyActivity(permissions, "scheduling.read")
        : false;
    const typeFromUrl = searchParams.get("type") as RuleType | null;
    const [ruleTypeFilter, setRuleTypeFilter] = useState<RuleTypeFilter>(
        typeFromUrl && ["layout", "featured", "price", "visibility", "all"].includes(typeFromUrl)
            ? (typeFromUrl as RuleTypeFilter)
            : "layout"
    );
    const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(new Set());
    const handleRuleTypeFilterChange = useCallback((next: RuleTypeFilter) => {
        setRuleTypeFilter(next);
        setSelectedRuleIds(new Set());
        setIsHelpModalOpen(false);
        setSearchParams(prev => {
            prev.set("type", next);
            return prev;
        }, { replace: true });
    }, [setSearchParams]);

    /* Un solo link "Come funziona" è montato per volta (sopra la lista, oppure
       in uno dei due empty state): un ref solo basta per restituirgli il focus. */
    const helpTriggerRef = useRef<HTMLButtonElement | null>(null);
    // «Come funziona» del simulatore (PG2): il focus torna lì.
    const simulatorHelpRef = useRef<HTMLButtonElement | null>(null);
    const [helpFromSimulator, setHelpFromSimulator] = useState(false);
    const [returnHelpFocus, setReturnHelpFocus] = useState(true);

    const openHelpModal = useCallback(() => {
        setHelpFromSimulator(false);
        setReturnHelpFocus(true);
        setIsHelpModalOpen(true);
    }, []);

    const activityById = useMemo(
        () => new Map(activities.map(item => [item.id, item])),
        [activities]
    );
    const catalogById = useMemo(() => new Map(catalogs.map(item => [item.id, item])), [catalogs]);
    const styleById = useMemo(
        () => new Map(stylesOptions.map(item => [item.id, item])),
        [stylesOptions]
    );
    // Calendario: i nomi delle cose, le sedi da guardare e i gruppi di ogni sede
    const calNames = useMemo<CalNames>(
        () => ({
            catalogs: new Map(catalogs.map(c => [c.id, c.name])),
            styles: new Map(stylesOptions.map(c => [c.id, c.name])),
            featured: new Map(featuredOptions.map(c => [c.id, c.name])),
            products: new Map(productOptions.map(c => [c.id, c.name]))
        }),
        [catalogs, featuredOptions, productOptions, stylesOptions]
    );
    // il pannello del Calendario mostra listino e categoria dei piatti: si chiedono solo aprendo il Calendario
    const [calProducts, setCalProducts] = useState<ReadonlyMap<string, ProductInfo> | undefined>(undefined);
    const [calPickBase, setCalPickBase] = useState<{ id: string; name: string; category_name: string | null; base_price: number | null }[]>([]);
    useEffect(() => {
        if (viewMode !== "calendar" || calProducts || !currentTenantId) return;
        let alive = true;
        listBaseProductsForPickerWithCategory(currentTenantId)
            .then(list => {
                if (!alive) return;
                setCalProducts(new Map(list.map(p => [p.id, { category: p.category_name, listPrice: p.base_price }])));
                setCalPickBase(list);
            })
            .catch(error => console.error("Errore listino per il Calendario:", error));
        return () => {
            alive = false;
        };
    }, [calProducts, currentTenantId, viewMode]);
    // la sezione Aggiungi / Modifica: i piatti da scegliere, con i loro formati
    const calPickList = useMemo<PickProduct[]>(() => {
        const formats = new Map(productOptions.map(p => [p.id, p.format_values ?? []]));
        return calPickBase.map(p => ({ id: p.id, name: p.name, category: p.category_name, listPrice: p.base_price, formats: formats.get(p.id) ?? [] }));
    }, [calPickBase, productOptions]);
    const calFormatNames = useMemo(
        () => new Map(productOptions.flatMap(p => (p.format_values ?? []).map(v => [v.id, v.name] as const))),
        [productOptions]
    );
    const calGroupIdsByActivity = useMemo(() => {
        const out: Record<string, string[]> = {};
        for (const [groupId, ids] of Object.entries(activityIdsByGroupId)) for (const id of ids) (out[id] ??= []).push(groupId);
        return out;
    }, [activityIdsByGroupId]);
    const loadRules = useCallback(async () => {
        const rulesData = await listLayoutRules(currentTenantId!);
        setRules(rulesData);
    }, [currentTenantId]);

    const loadInitialData = useCallback(async () => {
        // Gate prima della fetch: senza lettura (o coi permessi ancora in
        // arrivo) non si chiede niente; PageGate mostra il blocco.
        if (!currentTenantId || !canRead) return;
        try {
            setIsLoading(true);
            setLoadFailed(false);
            const [rulesData, optionsData] = await Promise.all([
                listLayoutRules(currentTenantId),
                listLayoutRuleOptions(currentTenantId)
            ]);
            setRules(rulesData);
            setActivities(optionsData.activities);
            setActivityGroups(optionsData.activityGroups);
            setCatalogs(optionsData.catalogs);
            setStylesOptions(optionsData.styles);
            setProductOptions(optionsData.products);
            setFeaturedOptions(optionsData.featuredContents);

            setActivityIdsByGroupId(
                await listActivityIdsByGroup(optionsData.activityGroups.map(group => group.id))
            );

            // Il conteggio che manca non ferma la pagina: la colonna «A mano»
            // lo dice («non caricate») e la banda tace sulle modifiche.
            try {
                setManualCounts(await countManualOverridesByActivity(optionsData.activities.map(activity => activity.id)));
            } catch (error) {
                console.error("Errore conteggio modifiche a mano:", error);
                setManualCounts(null);
            }
        } catch (error) {
            console.error("Errore caricamento Programmazione:", error);
            setLoadFailed(true);
        } finally {
            setIsLoading(false);
        }
    }, [currentTenantId, canRead]);

    useEffect(() => {
        void loadInitialData();
    }, [loadInitialData]);

    // La sede scelta nella navbar: vale per l'elenco e per il Calendario.
    const seatRules = useMemo(() => {
        if (!filterActivityId) return rules;
        return rules.filter(rule => {
            if (rule.applyToAll) return true;
            if (rule.activityIds.includes(filterActivityId)) return true;
            return rule.groupIds.some(gId =>
                (activityIdsByGroupId[gId] ?? []).includes(filterActivityId)
            );
        });
    }, [activityIdsByGroupId, filterActivityId, rules]);

    // Sede e ricerca: i conteggi del filtro per tipo si leggono da qui. La
    // ricerca resta all'elenco: nel Calendario non si vede, e non la filtra.
    const searchedRules = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        const result = seatRules;
        if (!query) return result;

        return result.filter(rule => {
            const targetLabel = getRuleTargetLabel(rule, activityById);
            const catalogName = rule.layout?.catalog_id
                ? (catalogById.get(rule.layout.catalog_id)?.name ?? rule.layout.catalog_id)
                : "";
            const styleLabel = rule.layout?.style_id
                ? (styleById.get(rule.layout.style_id)?.name ?? rule.layout.style_id)
                : "";
            const ruleName = rule.name ?? "";

            return [
                ruleName,
                rule.id,
                ruleTypeLabel(rule.rule_type, catalogLabel),
                rule.rule_type,
                targetLabel,
                rule.target_type,
                rule.target_id,
                catalogName,
                styleLabel,
                rule.priority
            ]
                .join(" ")
                .toLowerCase()
                .includes(query);
        });
    }, [activityById, catalogById, catalogLabel, seatRules, searchTerm, styleById]);

    const filteredRules = useMemo(
        () => (ruleTypeFilter === "all" ? searchedRules : searchedRules.filter(rule => rule.rule_type === ruleTypeFilter)),
        [ruleTypeFilter, searchedRules]
    );

    const typeCounts = useMemo(() => {
        const counts: Record<RuleTypeFilter, number> = { layout: 0, featured: 0, price: 0, visibility: 0, all: searchedRules.length };
        for (const rule of searchedRules) counts[rule.rule_type] += 1;
        return counts;
    }, [searchedRules]);

    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime(new Date());
        }, 15000); // Check every 15s to be responsive
        return () => clearInterval(interval);
    }, []);

    // Permesso regola per regola, come `can_write_schedule` (T9b): una regola
    // che tocca anche sedi altrui resta in sola lettura.
    // Un ruolo di sede vede solo le sue sedi di una regola (RLS): la risposta
    // finale la dà il database, chiesta solo per le regole che da qui
    // sembrano sue (le altre sono già in sola lettura).
    const groupMembers = useMemo(() => new Map(Object.entries(activityIdsByGroupId)), [activityIdsByGroupId]);
    const askDb = permissions !== null && permissions !== undefined && !isTenantWide(permissions);
    const candidateIds = useMemo(
        () => (permissions ? rules.filter(rule => canWriteRule(permissions, rule, groupMembers)).map(rule => rule.id) : []),
        [groupMembers, permissions, rules]
    );
    const dbWritable = useDbWritableRules(candidateIds, askDb);
    const isRuleWritable = useCallback(
        (rule: LayoutRule) =>
            permissions
                ? canWriteRule(permissions, rule, groupMembers) && (!askDb || dbWritable.get(rule.id) === true)
                : false,
        [askDb, dbWritable, groupMembers, permissions]
    );
    const groupNameById = useMemo(
        () => new Map(activityGroups.map(group => [group.id, group.name])),
        [activityGroups]
    );
    // dentro la sede si guarda solo lei; nella pagina d'azienda le sedi che si leggono
    const calSedi = useMemo(
        () =>
            routeActivityId
                ? [{ id: routeActivityId, name: activityById.get(routeActivityId)?.name ?? "" }]
                : readableSedi.map(a => ({ id: a.id, name: activityById.get(a.id)?.name ?? a.name })),
        [activityById, readableSedi, routeActivityId]
    );

    // «Adesso» e «Sovrascritta da»: la competizione della pagina pubblica,
    // sede per sede (solo la sede del filtro, se c'è), all'ora di Roma.
    const ruleInsightsById = useMemo(
        () =>
            computeRuleInsights({
                rules,
                activities,
                activityIdsByGroupId,
                groupNameById,
                filterActivityId,
                now: currentTime,
                ruleName: rule => getRuleDisplayName(rule, catalogLabel)
            }),
        [activities, activityIdsByGroupId, catalogLabel, currentTime, filterActivityId, groupNameById, rules]
    );

    // La card «Adesso» (PG1): sempre l'ora di adesso; un altro momento si
    // vede nel simulatore.
    const nowRome = useMemo(() => toRomeDateTime(currentTime), [currentTime]);

    // Sedi × strati adesso: la stessa resolveCompetition di «Sovrascritta
    // da», sulle regole già caricate.
    // Solo le sedi di cui chi guarda legge la Programmazione (PG5).
    const readableSediIds = useMemo(() => new Set(readableSedi.map(a => a.id)), [readableSedi]);
    const seatActivities = useMemo(
        () => activities.filter(a => readableSediIds.has(a.id)),
        [activities, readableSediIds]
    );
    const scheduleMatrix = useMemo(
        () =>
            buildScheduleMatrix({
                rules,
                activities: seatActivities,
                activityIdsByGroupId,
                manualCounts,
                filterActivityId,
                instant: nowRome,
                subscriptionInactive
            }),
        [activityIdsByGroupId, filterActivityId, manualCounts, nowRome, rules, seatActivities, subscriptionInactive]
    );
    const matrixCatalogName = useCallback((catalogId: string) => catalogById.get(catalogId)?.name, [catalogById]);
    const nowLayers = useMemo(
        () => matrixLayers({ atNow: true, catalogLabel, catalogName: matrixCatalogName, ruleHref }),
        [catalogLabel, matrixCatalogName, ruleHref]
    );
    // Con una sede sola, o dentro la sede, la matrice ha una riga.
    const nowRow = scheduleMatrix.rows[0];
    const pad = (n: number) => String(n).padStart(2, "0");
    const nowTime = `${pad(nowRome.hour)}:${pad(nowRome.minute)}`;
    const showMoment = viewMode === "list" && !isLoading && !loadFailed && rules.length > 0 && scheduleMatrix.rows.length > 0;
    // Il pannello si apre sulla sede della card, già su «Simula»; da «Vedi
    // tutte» sull'elenco delle sedi, fermo su adesso.
    const [simulatorSeatId, setSimulatorSeatId] = useState<string | null>(null);
    const [simulatorSimulating, setSimulatorSimulating] = useState(false);
    // Dentro una sede il pannello conosce solo quella.
    const simulatorActivities = useMemo(
        () => (routeActivityId ? seatActivities.filter(a => a.id === routeActivityId) : seatActivities),
        [routeActivityId, seatActivities]
    );

    const { activeRules, scheduledRules, draftRules, expiredRules, disabledRules } = useMemo(() => {
        const active: LayoutRule[] = [];
        const scheduled: LayoutRule[] = [];
        const drafts: LayoutRule[] = [];
        const expired: LayoutRule[] = [];
        const disabled: LayoutRule[] = [];

        for (const rule of filteredRules) {
            const insight = ruleInsightsById.get(rule.id);
            const status = deriveScheduleStatus({
                enabled: rule.enabled,
                endAt: rule.end_at,
                isConfigDraft: isLayoutRuleDraft(rule),
                isZeroReach: Boolean(insight?.zeroReachReason),
                isActiveNow: insight?.isActiveNow ?? false
            });

            if (status === "draft") {
                // Bozza copre due cause distinte (deriveScheduleStatus):
                // config incompleta, o portata zero (Passo 4) — il target
                // esiste formalmente (un gruppo, di solito) ma non raggiunge
                // nessuna sede reale ora. Nel secondo caso resta enabled=true
                // nel DB, è derivato non scritto (§33.7): torna attiva da
                // sola se il gruppo si ripopola.
                drafts.push(rule);
            } else if (status === "disabled") {
                disabled.push(rule);
            } else if (status === "expired") {
                expired.push(rule);
            } else if (status === "active") {
                active.push(rule);
            } else {
                scheduled.push(rule);
            }
        }

        // Specificità del target della regola in sé (non per sede): serve
        // solo a ordinare, con lo stesso comparatore della competizione.
        const getTargetSpecificity = (r: LayoutRule): 0 | 1 | 2 => {
            if (r.applyToAll) return 0;
            if (r.activityIds.length > 0) return 2;
            if (r.groupIds.length > 0) return 1;
            return 0;
        };

        const RULE_TYPE_ORDER: Record<string, number> = { layout: 0, featured: 1, price: 2, visibility: 3 };

        const resolverSort = (a: LayoutRule, b: LayoutRule): number => {
            // 0. Group by type in "Tutte" tab
            const typeDiff = (RULE_TYPE_ORDER[a.rule_type] ?? 9) - (RULE_TYPE_ORDER[b.rule_type] ?? 9);
            if (typeDiff !== 0) return typeDiff;

            const insightA = ruleInsightsById.get(a.id);
            const insightB = ruleInsightsById.get(b.id);

            // 1. Regole sovrascritta ora in cima (attive e in competizione)
            const aOverridden = insightA?.isOverridden ? 1 : 0;
            const bOverridden = insightB?.isOverridden ? 1 : 0;
            if (aOverridden !== bOverridden) return bOverridden - aOverridden;

            // 2. L'ordine della competizione: target, finestra, priorità, created_at, id
            return compareCandidates(
                { rule: toCompetitionRule(a), specificity: getTargetSpecificity(a) },
                { rule: toCompetitionRule(b), specificity: getTargetSpecificity(b) }
            );
        };

        active.sort(resolverSort);
        scheduled.sort(resolverSort);

        expired.sort((a, b) =>
            new Date(b.end_at!).getTime() - new Date(a.end_at!).getTime()
        );

        drafts.sort((a, b) => {
            const typeDiff = (RULE_TYPE_ORDER[a.rule_type] ?? 9) - (RULE_TYPE_ORDER[b.rule_type] ?? 9);
            if (typeDiff !== 0) return typeDiff;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        disabled.sort((a, b) => {
            const typeDiff = (RULE_TYPE_ORDER[a.rule_type] ?? 9) - (RULE_TYPE_ORDER[b.rule_type] ?? 9);
            if (typeDiff !== 0) return typeDiff;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        return { activeRules: active, scheduledRules: scheduled, draftRules: drafts, expiredRules: expired, disabledRules: disabled };
    }, [filteredRules, ruleInsightsById]);

    const [showDrafts, setShowDrafts] = useState(true);
    const [showExpired, setShowExpired] = useState(false);
    const [showDisabled, setShowDisabled] = useState(false);

    const ruleNameOf = (id: string): string => {
        const found = rules.find(r => r.id === id);
        return found ? getRuleDisplayName(found, catalogLabel) : "la regola";
    };

    const handleToggleEnabled = async (ruleId: string, enabled: boolean) => {
        // Optimistic update
        setRules(prev => prev.map(r => (r.id === ruleId ? { ...r, enabled } : r)));
        setUpdatingRules(prev => {
            const next = new Set(prev);
            next.add(ruleId);
            return next;
        });

        try {
            await updateScheduleEnabled(ruleId, enabled);
            showToast({
                type: "success",
                message: enabled ? "Regola abilitata." : "Regola disabilitata.",
                duration: 2000
            });
        } catch (error) {
            console.error("Errore update stato regola:", error);
            // Revert
            setRules(prev => prev.map(r => (r.id === ruleId ? { ...r, enabled: !enabled } : r)));
            showToast({
                type: "error",
                message: `Non siamo riusciti a cambiare lo stato di ${ruleNameOf(ruleId)}.`,
                duration: 3000
            });
        } finally {
            setUpdatingRules(prev => {
                const next = new Set(prev);
                next.delete(ruleId);
                return next;
            });
        }
    };

    const handleDeleteConfirm = async () => {
        if (!ruleToDelete) return;

        try {
            await deleteLayoutRule(ruleToDelete);
            showToast({
                type: "success",
                message: "Regola eliminata.",
                duration: 2200
            });
            setIsDeleteModalOpen(false);
            setRuleToDelete(null);
            await loadRules();
        } catch (error) {
            console.error("Errore eliminazione regola:", error);
            showToast({
                type: "error",
                message: `Non siamo riusciti a eliminare ${ruleNameOf(ruleToDelete)}.`,
                duration: 3000
            });
        }
    };

    const handleDuplicate = async (ruleId: string) => {
        try {
            await duplicateRule(ruleId, currentTenantId!);
            showToast({
                type: "success",
                message: "Regola duplicata: la copia è spenta.",
                duration: 2200
            });
            await loadRules();
        } catch (error) {
            console.error("Errore duplicazione regola:", error);
            showToast({
                type: "error",
                message: `Non siamo riusciti a duplicare ${ruleNameOf(ruleId)}.`,
                duration: 3000
            });
        }
    };

    /* Esito per regola: con un errore a metà le altre sono già eliminate,
       quindi il messaggio dice quali restano, e restano selezionate. */
    const handleBulkDelete = async (): Promise<boolean> => {
        const ids = Array.from(selectedRuleIds);
        if (ids.length === 0) return true;
        const results = await Promise.allSettled(ids.map(id => deleteLayoutRule(id)));
        const failedIds = ids.filter((_, i) => results[i].status === "rejected");
        const deleted = ids.length - failedIds.length;

        if (failedIds.length > 0) {
            console.error(
                "Errore eliminazione multipla regole:",
                results.filter(r => r.status === "rejected")
            );
            const names = failedIds.map(id => ruleNameOf(id)).join(", ");
            showToast({
                type: "error",
                message: `${failedIds.length === 1 ? "1 regola non eliminata" : `${failedIds.length} regole non eliminate`}: ${names}.`,
                duration: 4000
            });
        } else {
            showToast({
                type: "success",
                message: deleted === 1 ? "1 regola eliminata." : `${deleted} regole eliminate.`,
                duration: 2200
            });
        }
        setSelectedRuleIds(new Set(failedIds));
        await loadRules();
        return true;
    };

    const bulkCount = selectedRuleIds.size;
    const bulkNames = Array.from(selectedRuleIds).map(ruleNameOf);
    const bulkNamesLine =
        bulkNames.length > 5
            ? `${bulkNames.slice(0, 5).join(", ")} e altre ${bulkNames.length - 5}.`
            : `${bulkNames.join(", ")}.`;

    // Cleanup bozze abbandonate: gestito da edge function
    // cleanup-draft-schedules (elimina bozze > 7 giorni)
    const handleCreateRule = useCallback(async (overrideType?: RuleType) => {
        const effectiveType = overrideType ?? (ruleTypeFilter === "all" ? undefined : ruleTypeFilter as RuleType);
        if (!effectiveType) return;
        setIsCreating(true);
        try {
            const timestamp = new Date().toLocaleDateString("it-IT", {
                day: "2-digit",
                month: "2-digit"
            });
            const typeLabel = ruleTypeLabel(effectiveType, catalogLabel);
            const name = `Nuova regola ${typeLabel} · ${timestamp}`;

            if (effectiveType === "featured") {
                const newRuleId = await createFeaturedRuleDraft({
                    tenantId: currentTenantId!,
                    name
                });
                // Dalla sede la regola nasce con la sede già scelta (PG6).
                if (routeActivityId) await scopeRuleToActivity(newRuleId, routeActivityId);
                navigate(`${schedulingBase}/featured/${newRuleId}?fromType=featured`);
            } else {
                const newRuleId = await createRuleDraft({
                    tenantId: currentTenantId!,
                    ruleType: effectiveType,
                    name
                });
                if (routeActivityId) await scopeRuleToActivity(newRuleId, routeActivityId);
                navigate(`${schedulingBase}/${newRuleId}?fromType=${effectiveType}`);
            }
        } catch {
            showToast({ message: "Non siamo riusciti a creare la regola.", type: "error" });
        } finally {
            setIsCreating(false);
        }
    }, [currentTenantId, catalogLabel, ruleTypeFilter, navigate, routeActivityId, schedulingBase, showToast]);

    // «Nuova regola» da sola (PG4): il simulatore si apre dalla card «Adesso».
    // Sulla tab "Tutte" non ha un tipo implicito da creare → apre lei stessa il
    // menu dei quattro tipi, nell'ordine delle tab.
    const headerSplitActions = useMemo<SplitButtonAction[]>(() => {
        const actions: SplitButtonAction[] = [];

        if (!canCreate) return actions;

        const label = isCreating ? "Creazione..." : "Nuova regola";
        const disabled = !currentTenantId || isCreating || !canEdit;

        actions.push(
            ruleTypeFilter === "all"
                ? {
                      label,
                      disabled,
                      items: [
                          { label: ruleTypeLabel("layout", catalogLabel), onClick: () => void handleCreateRule("layout") },
                          { label: "Disponibilità", onClick: () => void handleCreateRule("visibility") },
                          { label: "Prezzi", onClick: () => void handleCreateRule("price") },
                          { label: "In evidenza", onClick: () => void handleCreateRule("featured") }
                      ]
                  }
                : { label, disabled, onClick: () => void handleCreateRule() }
        );

        return actions;
    }, [currentTenantId, canCreate, canEdit, catalogLabel, isCreating, ruleTypeFilter, handleCreateRule]);

    // Il filtro per tipo sta nella testata, nello slot delle tab come in
    // Prodotti e Sedi (F5); in compatto diventa il selettore di sezione.
    const headerLeading = useMemo(() => (
        <Tabs<RuleTypeFilter> value={ruleTypeFilter} onChange={handleRuleTypeFilterChange} variant="line">
            <Tabs.List aria-label="Tipo di regola">
                {typeOptions.map(option => (
                    <Tabs.Tab key={option.value} value={option.value} badge={typeCounts[option.value]}>
                        {option.label}
                    </Tabs.Tab>
                ))}
            </Tabs.List>
        </Tabs>
    ), [ruleTypeFilter, handleRuleTypeFilterChange, typeOptions, typeCounts]);

    // Le azioni in tre larghezze (F5): comoda; Elenco/Calendario a sole icone;
    // in più la ricerca alla larghezza minima. La banda usa la prima che sta
    // in riga con le tab, poi passa a due righe.
    const renderHeaderActions = useCallback((step: 0 | 1 | 2) => (
        <div className={styles.headerActions}>
            {viewMode === "list" && (
                <ToolbarSearch
                    value={searchTerm}
                    onChange={setSearchTerm}
                    placeholder={step === 2 ? "Cerca…" : "Cerca per nome, tipo, sede o id…"}
                    width={step === 2 ? "min" : "default"}
                />
            )}
            <SegmentedControl<"list" | "calendar">
                value={viewMode}
                onChange={setViewMode}
                iconsOnly={step > 0}
                options={[
                    { value: "list", label: "Programmazione", icon: <List size={16} /> },
                    { value: "calendar", label: "Calendario", icon: <CalendarDays size={16} /> }
                ]}
            />
            <SplitButton actions={headerSplitActions} loading={isCreating} />
        </div>
    ), [viewMode, searchTerm, headerSplitActions, isCreating]);

    const headerActions = useMemo(() => renderHeaderActions(0), [renderHeaderActions]);
    const headerNarrowerActions = useMemo(
        () => [renderHeaderActions(1), renderHeaderActions(2)],
        [renderHeaderActions]
    );

    // Stessa toolbar dichiarata a dati, per lo stato compatto: "Simula
    // regole" scende nel kebab, il toggle lista/calendario resta un'icona a
    // vista e "Nuova regola" resta il bottone pieno. Il filtro per tipo
    // diventa il selettore di sezione, col conteggio fra parentesi.
    const headerCompact = useMemo<PageHeaderCompactConfig>(() => ({
        sections: typeOptions.map(option => ({
            value: option.value,
            label: `${option.label} (${typeCounts[option.value]})`
        })),
        activeSection: ruleTypeFilter,
        onSectionChange: value => handleRuleTypeFilterChange(value as RuleTypeFilter),
        // La ricerca filtra la lista: nella vista calendario non ha bersaglio.
        search: viewMode === "list"
            ? {
                  value: searchTerm,
                  onChange: setSearchTerm,
                  placeholder: "Cerca per nome, tipo, sede o id…"
              }
            : undefined,
        persistentIcons: [
            viewMode === "list"
                ? {
                      icon: <CalendarDays size={18} />,
                      label: "Calendario",
                      onClick: () => setViewMode("calendar")
                  }
                : {
                      icon: <List size={18} />,
                      label: "Programmazione",
                      onClick: () => setViewMode("list")
                  }
        ],
        // `headerSplitActions` è già in ordine di lettura: le secondarie
        // precedono la primaria, che è l'ultima.
        secondaryActions: headerSplitActions.slice(0, -1),
        primaryAction: headerSplitActions[headerSplitActions.length - 1],
        loading: isCreating
    }), [typeOptions, typeCounts, ruleTypeFilter, handleRuleTypeFilterChange, viewMode, searchTerm, headerSplitActions, isCreating]);

    usePageHeader({
        leading: headerLeading,
        actions: headerActions,
        narrowerActions: headerNarrowerActions,
        compact: headerCompact,
    });

    const statusGroups: Array<{
        key: string;
        title: string;
        subtitle?: string;
        rules: LayoutRule[];
        open: boolean;
        setOpen?: (open: boolean) => void;
    }> = [
        { key: "active", title: "Adesso", rules: activeRules, open: true },
        { key: "scheduled", title: "Programmate", rules: scheduledRules, open: true },
        { key: "drafts", title: "Bozze", subtitle: "Incomplete, o senza una sede raggiunta", rules: draftRules, open: showDrafts, setOpen: setShowDrafts },
        { key: "disabled", title: "Disabilitate", rules: disabledRules, open: showDisabled, setOpen: setShowDisabled },
        { key: "expired", title: "Scadute", rules: expiredRules, open: showExpired, setOpen: setShowExpired }
    ];

    // «Dove si applica» larga quanto l'etichetta più lunga dell'elenco (o
    // l'intestazione), uguale in tutte le tabelle per stato: icona 14 + gap 6,
    // padding della cella 24 + 24, bordo. Tetto al 45%: «Regola» prende il resto.
    const whereWidth = useMemo(() => {
        const labels = filteredRules.map(rule => describeTarget(rule, activityById, activityGroups).label);
        const label = Math.max(0, ...labels.map(text => measureTextWidth(text, { size: 14 })));
        const header = measureTextWidth("DOVE SI APPLICA", { size: 12, weight: 600, letterSpacing: 12 * 0.04 });
        const content = Math.max(label + 14 + 6, header);
        return `min(${Math.ceil(content + 48 + 2)}px, 45%)`;
    }, [filteredRules, activityById, activityGroups]);

    const tableProps = {
        insights: ruleInsightsById,
        whereWidth,
        showTypeBadge: ruleTypeFilter === "all",
        activityById,
        activityGroups,
        catalogById,
        ruleHref,
        onOpen: (rule: LayoutRule) => navigate(ruleHref(rule)),
        updatingIds: updatingRules,
        onToggleEnabled: canWrite ? handleToggleEnabled : undefined,
        onDuplicate: canCreate ? handleDuplicate : undefined,
        canWriteRule: isRuleWritable,
        onDelete: canWrite
            ? (id: string) => {
                  setRuleToDelete(id);
                  setIsDeleteModalOpen(true);
              }
            : undefined,
        selectedIds: canWrite ? Array.from(selectedRuleIds) : undefined,
        onSelectedIdsChange: canWrite ? (ids: string[]) => setSelectedRuleIds(new Set(ids)) : undefined
    };

    return (
        <PageGate readPermission="scheduling.read" activityId={filterActivityId}>
            {() => (
        <section className={styles.programming}>
            {showMoment && companyView && (
                <CompanyNowCard
                    time={nowTime}
                    rows={scheduleMatrix.rows}
                    catalogLabel={catalogLabel}
                    subscriptionInactive={subscriptionInactive}
                    onSeatOpen={activityId => navigate(seatProgrammingHref(activityId))}
                    onShowAll={() => {
                        setSimulatorSeatId(null);
                        setSimulatorSimulating(false);
                        setIsSimulatorDrawerOpen(true);
                    }}
                />
            )}
            {showMoment && !companyView && nowRow && (
                <NowCard
                    time={nowTime}
                    row={nowRow}
                    layers={nowLayers}
                    catalogLabel={catalogLabel}
                    highlight={ruleTypeFilter === "all" ? null : ruleTypeFilter}
                    subscriptionInactive={subscriptionInactive}
                    onSimulate={() => {
                        setSimulatorSeatId(nowRow.activityId);
                        setSimulatorSimulating(true);
                        setIsSimulatorDrawerOpen(true);
                    }}
                />
            )}

            {viewMode === "list" ? (
                loadFailed ? (
                    <InlineBanner
                        variant="error"
                        action={
                            <Button variant="secondary" size="sm" onClick={() => void loadInitialData()}>
                                Riprova
                            </Button>
                        }
                    >
                        Non riusciamo a caricare le regole.
                    </InlineBanner>
                ) : isLoading ? (
                    <RuleTable {...tableProps} ariaLabel="Le regole" rules={[]} isLoading />
                ) : filteredRules.length === 0 ? (
                    (searchTerm || filterActivityId) ? (
                        <EmptyState
                            variant="filtered"
                            title="Nessuna regola trovata"
                            description={
                                filterActivityId && !searchTerm
                                    ? "Nessuna regola per questa sede."
                                    : "Nessuna regola corrisponde alla ricerca."
                            }
                            onClearFilters={searchTerm ? () => setSearchTerm("") : undefined}
                        />
                    ) : (
                        <EmptyState
                            icon={<Calendar size={40} strokeWidth={1.5} />}
                            title={emptyCopy[ruleTypeFilter].title}
                            description={emptyCopy[ruleTypeFilter].description}
                            action={
                                /* Ordine di lettura: cos'è questa cosa (titolo +
                                   descrizione) → come funziona → creane una. */
                                <div className={styles.emptyStateActions}>
                                    <HowItWorksButton
                                        ref={helpTriggerRef}
                                        ruleType={ruleTypeFilter}
                                        onClick={openHelpModal}
                                    />
                                    {canCreate && (
                                        ruleTypeFilter === "all" ? (
                                            <Menu
                                                trigger={
                                                    <Button
                                                        variant="primary"
                                                        disabled={!currentTenantId || isCreating || !canEdit}
                                                        loading={isCreating}
                                                    >
                                                        {isCreating ? "Creazione..." : "Crea la prima regola"}
                                                    </Button>
                                                }
                                                align="start"
                                            >
                                                {typeOptions
                                                    .filter(option => option.value !== "all")
                                                    .map(option => (
                                                        <Menu.Item
                                                            key={option.value}
                                                            onSelect={() => void handleCreateRule(option.value as RuleType)}
                                                        >
                                                            {option.label}
                                                        </Menu.Item>
                                                    ))}
                                            </Menu>
                                        ) : (
                                            <Button
                                                variant="primary"
                                                onClick={() => void handleCreateRule()}
                                                disabled={isCreating || !canEdit}
                                                loading={isCreating}
                                            >
                                                Crea la prima regola
                                            </Button>
                                        )
                                    )}
                                </div>
                            }
                        />
                    )
                ) : (
                    // «Le regole»: l'elenco per stato, distinto dalla matrice
                    // sopra, che nomina le stesse regole.
                    <div className={styles.groupedList} role="region" aria-label="Le regole">
                        {statusGroups
                            .filter(group => group.rules.length > 0)
                            .map(group => (
                                // Una sezione per stato: titolo + contatore, la
                                // DataTable sotto con la sua cornice. Niente Card
                                // intorno: due cornici una dentro l'altra (F3).
                                <section key={group.key} className={styles.group} aria-labelledby={`rule-group-${group.key}`}>
                                    <div className={styles.groupHead}>
                                        <Text as="h2" variant="title-sm" id={`rule-group-${group.key}`}>
                                            {group.title}
                                        </Text>
                                        <Badge variant="neutral">{group.rules.length}</Badge>
                                        {group.subtitle && (
                                            <Text as="span" variant="body-sm" colorVariant="muted">
                                                {group.subtitle}
                                            </Text>
                                        )}
                                        {group.setOpen && (
                                            <IconButton
                                                icon={<ChevronDown size={16} className={group.open ? styles.chevronOpen : styles.chevronClosed} />}
                                                variant="ghost"
                                                size="sm"
                                                aria-expanded={group.open}
                                                aria-label={`${group.open ? "Nascondi" : "Mostra"} ${group.title}`}
                                                onClick={() => group.setOpen?.(!group.open)}
                                            />
                                        )}
                                    </div>
                                    {group.open && <RuleTable {...tableProps} ariaLabel={group.title} rules={group.rules} />}
                                </section>
                            ))}
                    </div>
                )
            ) : (
                <CalendarioView
                    rules={seatRules}
                    names={calNames}
                    sedi={calSedi}
                    groupIdsByActivity={calGroupIdsByActivity}
                    groupNames={groupNameById}
                    products={calProducts}
                    formatNames={calFormatNames}
                    isWritable={canWrite ? isRuleWritable : undefined}
                    onOpenRule={rule => navigate(ruleHref(rule))}
                    onDrop={async (rule, item) => {
                        await (item ? dropItem(rule, item) : dropRule(rule));
                        await loadRules();
                    }}
                    section={{
                        pickList: calPickList,
                        catalogs,
                        styles: stylesOptions,
                        featured: featuredOptions,
                        groups: activityGroups.map(g => ({ id: g.id, name: g.name, activityIds: activityIdsByGroupId[g.id] ?? [] })),
                        defaultWhere: routeActivityId
                            ? { all: false, activityIds: [routeActivityId], groupIds: [] }
                            : { all: true, activityIds: [], groupIds: [] },
                        systemStyleId: stylesOptions.find(x => x.is_system)?.id ?? null,
                        canAdd: canCreate,
                        onSave: async (draft, lookups) => {
                            await saveDraft(draft, lookups, currentTenantId!);
                            await loadRules();
                        },
                        onDrop: async draft => {
                            await dropDraft(draft);
                            await loadRules();
                        },
                        onGoNew: kind =>
                            navigate(`/business/${currentTenantId}/${kind === "menu" ? "catalogs" : kind === "style" ? "styles" : "featured"}`)
                    }}
                />
            )}

            <BulkBar
                selectedCount={selectedRuleIds.size}
                onDelete={canWrite ? () => setIsBulkDeleteOpen(true) : undefined}
                onClearSelection={() => setSelectedRuleIds(new Set())}
            />

            <RuleSimulatorDrawer
                open={isSimulatorDrawerOpen}
                onClose={() => setIsSimulatorDrawerOpen(false)}
                rules={rules}
                activities={simulatorActivities}
                activityIdsByGroupId={activityIdsByGroupId}
                catalogById={catalogById}
                subscriptionInactive={subscriptionInactive}
                ruleHref={ruleHref}
                seatProgrammingHref={seatProgrammingHref}
                manualCounts={manualCounts}
                initialActivityId={simulatorSeatId}
                initialSimulating={simulatorSimulating}
                helpRuleType={ruleTypeFilter}
                helpRef={simulatorHelpRef}
                onHowItWorks={() => {
                    setHelpFromSimulator(true);
                    setReturnHelpFocus(true);
                    setIsHelpModalOpen(true);
                }}
            />
            <RuleTypeHelpModal
                isOpen={isHelpModalOpen}
                ruleType={ruleTypeFilter}
                triggerRef={helpFromSimulator ? simulatorHelpRef : helpTriggerRef}
                returnFocusOnClose={returnHelpFocus}
                onClose={() => setIsHelpModalOpen(false)}
                onSimulate={() => {
                    /* Il focus va al simulatore che si apre, non indietro
                       al link che ha aperto la spiegazione. */
                    setReturnHelpFocus(false);
                    setIsHelpModalOpen(false);
                    setSimulatorSimulating(true);
                    setIsSimulatorDrawerOpen(true);
                }}
            />
            <ConfirmDialog
                isOpen={isBulkDeleteOpen}
                onClose={() => setIsBulkDeleteOpen(false)}
                onConfirm={handleBulkDelete}
                title={bulkCount === 1 ? "Eliminare 1 regola?" : `Eliminare ${bulkCount} regole?`}
                message="Le regole spariscono da tutte le sedi a cui si applicano. Non si può annullare."
                confirmLabel={bulkCount === 1 ? "Elimina 1 regola" : `Elimina ${bulkCount} regole`}
                confirmVariant="danger"
            >
                <Text variant="body-sm">{bulkNamesLine}</Text>
            </ConfirmDialog>
            <ConfirmDialog
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleDeleteConfirm}
                title="Eliminare regola?"
                message="Questa azione è irreversibile."
                confirmLabel="Elimina"
                confirmVariant="danger"
            />
        </section>
            )}
        </PageGate>
    );
}
