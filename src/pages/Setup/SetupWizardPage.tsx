import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useTenantId } from "@/context/useTenantId";
import { useAiImportSession, type AiImportOutcome } from "@/hooks/useAiImportSession";
import { createLayoutRule } from "@/services/supabase/layoutScheduling";
import { listStyles } from "@/services/supabase/styles";
import { buildPublicUrl } from "@/utils/publicUrl";
import type { V2Activity } from "@/types/activity";
import type { V2Catalog } from "@/services/supabase/catalogs";
import { SetupShell, type SetupStepDefinition } from "./components/SetupShell";
import { SetupActivityStep } from "./steps/SetupActivityStep";
import { SetupCatalogStep, type CatalogBranch } from "./steps/SetupCatalogStep";
import { SetupPublishStep, type SetupRuleStatus } from "./steps/SetupPublishStep";

const STEPS: SetupStepDefinition[] = [
    { id: "activity", label: "La tua sede", hint: "Dove i clienti ti trovano" },
    { id: "catalog", label: "Il tuo menù", hint: "Cosa offri ai clienti" },
    { id: "publish", label: "Pubblicazione", hint: "Il QR pronto da usare" }
];

const ACTIVITY_FORM_ID = "setup-activity-form";
const CATALOG_FORM_ID = "setup-catalog-form";

/** Sottoinsieme della sede creata che i passi successivi consumano. */
type CreatedActivity = Pick<V2Activity, "id" | "name" | "slug">;
/**
 * Menù creato al passo 2. `hasProducts` viene dal ramo di provenienza, non da
 * una query: l'import salva solo con almeno un prodotto selezionato, il ramo
 * manuale crea per definizione un contenitore vuoto.
 */
type CreatedCatalog = { id: string; name: string; hasProducts: boolean };

/** Regola creata dal wizard: nome fisso, nessuna finestra temporale. */
const RULE_NAME = "Menù principale";

const STEP_COPY = [
    {
        title: "Iniziamo dal tuo locale",
        subtitle:
            "È quello che i clienti raggiungono inquadrando il QR. Bastano poche informazioni: il resto lo affini quando vuoi."
    },
    {
        title: "Come creiamo il menù?",
        subtitle:
            "Serve un menù perché la pagina pubblica funzioni. Puoi riempirlo subito o con calma."
    },
    {
        title: "Il tuo menù è online",
        subtitle:
            "Inquadra il codice col telefono: è esattamente quello che vedranno i tuoi clienti."
    }
];

/** Copy alternativo del passo 3 quando il menù è stato creato vuoto. */
const EMPTY_MENU_COPY = {
    title: "Manca un ultimo passo: i piatti",
    subtitle: "Sede, menù e regola sono a posto. Il tuo indirizzo pubblico funziona già."
};

export default function SetupWizardPage() {
    usePageTitle("Setup guidato");
    const navigate = useNavigate();
    const { businessId } = useParams<{ businessId: string }>();
    const tenantId = useTenantId();

    const [stepIndex, setStepIndex] = useState(0);
    const [isSaving, setIsSaving] = useState(false);
    // Sede creata al passo 1: l'id serve al passo 2 per collegare il menù, slug
    // e nome al passo 3 per comporre URL pubblico e QR.
    const [createdActivity, setCreatedActivity] = useState<CreatedActivity | null>(null);
    const [catalogBranch, setCatalogBranch] = useState<CatalogBranch | null>(null);
    const [createdCatalog, setCreatedCatalog] = useState<CreatedCatalog | null>(null);

    const [ruleStatus, setRuleStatus] = useState<SetupRuleStatus>("creating");
    // La creazione parte da un effect: una sola volta per percorso, anche se il
    // passo 3 si ri-renderizza.
    const ruleRequestedRef = useRef(false);

    const handleCatalogReady = useCallback((catalog: CreatedCatalog) => {
        setCreatedCatalog(catalog);
        setStepIndex(2);
    }, []);

    // Esito dell'import: la sessione lo notifica a commit avvenuto, con il
    // catalogo risolto dalla RPC (che nel ramo "nuovo" lo ha appena creato).
    const handleImported = useCallback(
        (outcome: AiImportOutcome) => {
            handleCatalogReady({
                id: outcome.catalogId,
                name: outcome.catalogName,
                hasProducts: true
            });
        },
        [handleCatalogReady]
    );

    // Sessione montata qui, non nello step: sopravvive al cambio di ramo e
    // resta unica per tutto il wizard.
    const importSession = useAiImportSession(tenantId, undefined, handleImported);

    // Il pannello può chiudersi da sé (Annulla dal suo footer, o auto-close dopo
    // un import riuscito). Se resta il ramo "import" senza pannello aperto siamo
    // nel caso annullamento: si torna al bivio con la scelta azzerata. Dopo un
    // import riuscito lo step è già avanzato, quindi qui non cambia nulla.
    useEffect(() => {
        if (catalogBranch === "import" && !importSession.isOpen) {
            setCatalogBranch(null);
        }
    }, [catalogBranch, importSession.isOpen]);

    // Regola che collega menù e sede: senza, la pagina pubblica resterebbe vuota.
    // Target la sede specifica e mai "tutte le sedi": una regola tenant-wide
    // farebbe comparire questo menù su locali creati in futuro senza che nessuno
    // l'abbia deciso.
    useEffect(() => {
        if (stepIndex !== 2) return;
        if (!tenantId || !createdActivity || !createdCatalog) return;
        if (ruleRequestedRef.current) return;
        ruleRequestedRef.current = true;

        let cancelled = false;

        (async () => {
            try {
                const styles = await listStyles(tenantId);
                const systemStyle = styles.find(style => style.is_system && style.is_active);
                if (!systemStyle) {
                    throw new Error("SYSTEM_STYLE_NOT_FOUND");
                }

                await createLayoutRule({
                    tenantId,
                    name: RULE_NAME,
                    targetType: "activity",
                    targetId: createdActivity.id,
                    catalogId: createdCatalog.id,
                    styleId: systemStyle.id,
                    priorityLevel: "medium",
                    displayOrder: 0,
                    enabled: true,
                    timeMode: "always",
                    daysOfWeek: null,
                    timeFrom: null,
                    timeTo: null
                });

                if (!cancelled) setRuleStatus("ready");
            } catch (error) {
                console.error("Errore creazione regola setup:", error);
                // Sede e catalogo esistono già: non si torna indietro, il passo 3
                // resta raggiungibile e spiega cosa manca.
                if (!cancelled) setRuleStatus("failed");
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [stepIndex, tenantId, createdActivity, createdCatalog]);

    const handleExitToOverview = useCallback(() => {
        navigate(`/business/${businessId}/overview`);
    }, [navigate, businessId]);

    const handleActivityCreated = useCallback((activity: V2Activity) => {
        setCreatedActivity({
            id: activity.id,
            name: activity.name,
            slug: activity.slug
        });
        setStepIndex(1);
    }, []);

    const handleCatalogCreated = useCallback(
        (catalog: V2Catalog) => {
            handleCatalogReady({ id: catalog.id, name: catalog.name, hasProducts: false });
        },
        [handleCatalogReady]
    );

    const handleBranchChange = useCallback(
        (branch: CatalogBranch) => {
            setCatalogBranch(branch);
            if (branch === "import") importSession.open();
        },
        [importSession]
    );

    // Passo 3: con prodotti si apre la pagina pubblica in una nuova scheda, senza
    // si porta l'utente dove i piatti si aggiungono.
    const handlePublishPrimary = useCallback(() => {
        if (!createdActivity) return;
        if (createdCatalog?.hasProducts) {
            window.open(buildPublicUrl(createdActivity.slug), "_blank", "noopener");
            return;
        }
        navigate(`/business/${businessId}/products`);
    }, [createdActivity, createdCatalog, navigate, businessId]);

    // Il pannello import si chiude da sé anche dopo un salvataggio riuscito: in
    // quel caso lo step è già avanzato, quindi qui resta solo l'annullamento →
    // torna al bivio con la scelta azzerata, nessun catalogo creato.
    const handleBackFromCatalog = useCallback(() => {
        if (importSession.isOpen) {
            importSession.close();
        }
        setCatalogBranch(null);
    }, [importSession]);

    const isActivityStep = stepIndex === 0;
    const isCatalogStep = stepIndex === 1;
    const isPublishStep = stepIndex === 2;
    const hasProducts = createdCatalog?.hasProducts ?? false;

    // Al passo 3 il copy cambia in base a cosa c'è dentro il menù.
    const copy = isPublishStep && !hasProducts ? EMPTY_MENU_COPY : STEP_COPY[stepIndex];
    const isImportPanelOpen = isCatalogStep && importSession.isOpen;
    const isAnalyzing = importSession.status === "analyzing" || importSession.status === "creating";

    const formId = isActivityStep
        ? ACTIVITY_FORM_ID
        : isCatalogStep && catalogBranch === "manual" && !importSession.isOpen
          ? CATALOG_FORM_ID
          : undefined;

    return (
        <SetupShell
            steps={STEPS}
            currentIndex={stepIndex}
            title={copy.title}
            subtitle={copy.subtitle}
            formId={formId}
            primaryLabel={
                isPublishStep
                    ? hasProducts
                        ? "Apri la mia pagina"
                        : "Aggiungi i primi piatti"
                    : "Continua"
            }
            primaryLoading={isSaving}
            primaryDisabled={!isPublishStep && (formId === undefined || isSaving)}
            onPrimaryClick={isPublishStep ? handlePublishPrimary : undefined}
            hidePrimary={isImportPanelOpen}
            secondaryLabel={isCatalogStep ? "Indietro" : undefined}
            onSecondaryClick={handleBackFromCatalog}
            closeWarning={
                isAnalyzing
                    ? "L'analisi del menù è ancora in corso: chiudendo ora andrà persa e dovrai ricaricare il file."
                    : undefined
            }
            onExit={handleExitToOverview}
        >
            {isActivityStep && (
                <SetupActivityStep
                    formId={ACTIVITY_FORM_ID}
                    tenantId={tenantId}
                    onSavingChange={setIsSaving}
                    onCreated={handleActivityCreated}
                />
            )}

            {isCatalogStep && (
                <SetupCatalogStep
                    formId={CATALOG_FORM_ID}
                    tenantId={tenantId}
                    branch={catalogBranch}
                    onBranchChange={handleBranchChange}
                    importSession={importSession}
                    onSavingChange={setIsSaving}
                    onCatalogCreated={handleCatalogCreated}
                />
            )}

            {isPublishStep && createdActivity && createdCatalog && (
                <SetupPublishStep
                    businessId={businessId ?? ""}
                    activityName={createdActivity.name}
                    activitySlug={createdActivity.slug}
                    catalogName={createdCatalog.name}
                    hasProducts={hasProducts}
                    ruleStatus={ruleStatus}
                />
            )}
        </SetupShell>
    );
}
