import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Text from "@/components/ui/Text/Text";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useTenantId } from "@/context/useTenantId";
import { useAiImportSession, type AiImportOutcome } from "@/hooks/useAiImportSession";
import type { V2Activity } from "@/types/activity";
import type { V2Catalog } from "@/services/supabase/catalogs";
import { SetupShell, type SetupStepDefinition } from "./components/SetupShell";
import { SetupActivityStep } from "./steps/SetupActivityStep";
import { SetupCatalogStep, type CatalogBranch } from "./steps/SetupCatalogStep";

const STEPS: SetupStepDefinition[] = [
    { id: "activity", label: "La tua sede", hint: "Dove i clienti ti trovano" },
    { id: "catalog", label: "Il tuo menù", hint: "Cosa offri ai clienti" },
    { id: "publish", label: "Pubblicazione", hint: "Il QR pronto da usare" }
];

const ACTIVITY_FORM_ID = "setup-activity-form";
const CATALOG_FORM_ID = "setup-catalog-form";

/** Sottoinsieme della sede creata che i passi successivi consumano. */
type CreatedActivity = Pick<V2Activity, "id" | "name" | "slug">;
/** Menù creato al passo 2, da uno dei due rami. */
type CreatedCatalog = { id: string; name: string };

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
        title: "Pubblica e stampa il QR",
        subtitle: "L'ultimo passo del setup guidato."
    }
];

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

    const handleCatalogReady = useCallback((catalog: CreatedCatalog) => {
        setCreatedCatalog(catalog);
        setStepIndex(2);
    }, []);

    // Esito dell'import: la sessione lo notifica a commit avvenuto, con il
    // catalogo risolto dalla RPC (che nel ramo "nuovo" lo ha appena creato).
    const handleImported = useCallback(
        (outcome: AiImportOutcome) => {
            handleCatalogReady({ id: outcome.catalogId, name: outcome.catalogName });
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
            handleCatalogReady({ id: catalog.id, name: catalog.name });
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

    // Il pannello import si chiude da sé anche dopo un salvataggio riuscito: in
    // quel caso lo step è già avanzato, quindi qui resta solo l'annullamento →
    // torna al bivio con la scelta azzerata, nessun catalogo creato.
    const handleBackFromCatalog = useCallback(() => {
        if (importSession.isOpen) {
            importSession.close();
        }
        setCatalogBranch(null);
    }, [importSession]);

    const copy = STEP_COPY[stepIndex];
    const isActivityStep = stepIndex === 0;
    const isCatalogStep = stepIndex === 1;
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
            primaryLabel="Continua"
            primaryLoading={isSaving}
            primaryDisabled={formId === undefined || isSaving}
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

            {stepIndex === 2 && (
                <Text variant="body-sm" colorVariant="muted">
                    In arrivo
                    {createdCatalog ? `: il menù «${createdCatalog.name}»` : ""}
                    {createdActivity ? ` per ${createdActivity.name}` : ""}.
                </Text>
            )}
        </SetupShell>
    );
}
