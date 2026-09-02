import { Sparkles, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import type { AiImportSession } from "@/hooks/useAiImportSession";
import { countAiProductsWithoutPrice, toAiPriceableProduct } from "./aiProductPricing";

import { StepIndicator } from "./components/StepIndicator";
import { UploadStep } from "./steps/UploadStep";
import { AnalyzingStep } from "./steps/AnalyzingStep";
import { ReviewStep } from "./steps/ReviewStep";
import styles from "./aiMenuImport.module.scss";

// Re-export: i sub-componenti (ReviewStep, CategoryGroup, ProductReviewCard)
// importano `AiProduct` da questo modulo. Il tipo vive ora nel hook sollevato.
export type { AiProduct } from "@/hooks/useAiImportSession";

/* ────────────────────────────── Wizard ───────────────────── */

interface AiMenuImportWizardProps {
    /** Sessione import sollevata in MainLayout (stato + azioni). */
    session: AiImportSession;
    /**
     * Import in un contesto dove cataloghi esistenti non ce ne sono (il setup
     * guidato: il tenant è appena nato). Nella revisione sparisce il selettore
     * Nuovo/Esistente e la destinazione resta il nuovo catalogo. Default
     * `false` — la pagina Cataloghi non cambia.
     */
    forceNewCatalog?: boolean;
}

export function AiMenuImportWizard({
    session,
    forceNewCatalog = false
}: AiMenuImportWizardProps) {
    // Il wizard monta sia dentro MainLayout sia dentro il setup guidato: in
    // entrambi i casi è sotto TenantProvider (App.tsx), quindi l'hook risolve.
    const { catalogLabel } = useVerticalConfig();
    const catalogLower = catalogLabel.toLowerCase();

    const {
        step,
        files,
        setFiles,
        analyzeError,
        products,
        categoryNames,
        menuName,
        setMenuName,
        isCreating,
        createProgress,
        importDone,
        importResult,
        selectedProducts,
        analyze,
        retry,
        updateProduct,
        removeProduct,
        toggleCategory,
        toggleAll,
        setCategoryName,
        importNewCatalog,
        close,
        startNew,
        cancelAnalysis,
        tenantId,
        importMode,
        setImportMode,
        initialCatalogId,
        initialCatalogName,
        existingImportPlan,
        setExistingImportPlan,
        importIntoExistingCatalog
    } = session;

    // Prodotti che l'import sta creando senza prezzo. Nel ramo "catalogo
    // esistente" contano solo le decisioni `create`: per un prodotto riusato il
    // prezzo è quello già in DB, non quello letto dall'AI.
    const effectiveMode = forceNewCatalog ? "new" : importMode;
    const createdWithoutPrice =
        effectiveMode === "existing"
            ? countAiProductsWithoutPrice(
                  (existingImportPlan?.decisions ?? [])
                      .filter(d => d.kind === "create")
                      .map(d => d.product)
              )
            : countAiProductsWithoutPrice(selectedProducts.map(toAiPriceableProduct));

    /* ── Footer per step ──────────────────────────────────── */

    const renderFooter = () => {
        if (step === "upload") {
            return (
                <>
                    <Button variant="outline" onClick={close}>
                        Annulla
                    </Button>
                    <Button
                        variant="primary"
                        onClick={analyze}
                        disabled={files.length === 0}
                        leftIcon={<Sparkles size={16} />}
                    >
                        Analizza menù
                    </Button>
                </>
            );
        }

        if (step === "analyzing") {
            // Errore → offri "Ricomincia" (il corpo mostra già "Riprova").
            // Analisi in volo → due azioni distinte:
            //  • "Annulla" (ghost, secondaria): abbandona l'analisi e torna
            //    all'upload. Aborta solo l'attesa client — il lavoro server e
            //    l'RPD già consumato NON si recuperano. Ghost per evitare il
            //    click accidentale che brucerebbe l'attesa.
            //  • "Chiudi" (outline): nasconde il drawer, la richiesta continua a
            //    girare nel hook (riapribile da "Importa con AI").
            if (analyzeError) {
                return (
                    <Button variant="ghost" onClick={startNew}>
                        Ricomincia
                    </Button>
                );
            }
            return (
                <>
                    <Button variant="ghost" onClick={cancelAnalysis}>
                        Annulla
                    </Button>
                    <Button variant="outline" onClick={close}>
                        Chiudi
                    </Button>
                </>
            );
        }

        // review — "Indietro" rimosso: duplicava "Ricomincia" (entrambi → upload).
        // Il primary dipende dal ramo scelto (nuovo catalogo vs esistente).
        return (
            <>
                <Button variant="ghost" onClick={startNew} disabled={isCreating}>
                    Ricomincia
                </Button>
                {importMode === "new" ? (
                    <Button
                        variant="primary"
                        onClick={importNewCatalog}
                        disabled={selectedProducts.length === 0 || !menuName.trim() || isCreating}
                        loading={isCreating}
                    >
                        {isCreating
                            ? `Creazione... (${createProgress.current}/${createProgress.total})`
                            : `Importa ${selectedProducts.length} prodotti`}
                    </Button>
                ) : (
                    <Button
                        variant="primary"
                        onClick={importIntoExistingCatalog}
                        disabled={
                            !existingImportPlan ||
                            existingImportPlan.createCount + existingImportPlan.reuseCount === 0 ||
                            existingImportPlan.hasUnresolvedAmbiguous ||
                            isCreating
                        }
                        loading={isCreating}
                    >
                        {existingImportPlan &&
                        existingImportPlan.createCount + existingImportPlan.reuseCount > 0
                            ? `Importa ${
                                  existingImportPlan.createCount + existingImportPlan.reuseCount
                              } prodotti in «${existingImportPlan.catalogName}»`
                            : `Importa in ${catalogLower}`}
                    </Button>
                )}
            </>
        );
    };

    /* ── Render ────────────────────────────────────────────── */

    const progressPct =
        createProgress.total > 0
            ? Math.round((createProgress.current / createProgress.total) * 100)
            : 0;

    return (
        <div className={styles.drawer}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerTitle}>
                    <div className={styles.headerIcon}>
                        <Sparkles size={18} />
                    </div>
                    <span className={styles.headerLabel}>Importa menù con AI</span>
                </div>
                <StepIndicator current={step} />
            </div>

            {/* Body */}
            <div className={styles.body}>
                {step === "upload" && (
                    <UploadStep files={files} onFilesChange={setFiles} />
                )}

                {step === "analyzing" && (
                    <AnalyzingStep error={analyzeError} onRetry={retry} />
                )}

                {step === "review" && (
                    <ReviewStep
                        menuName={menuName}
                        onMenuNameChange={setMenuName}
                        products={products}
                        categoryNames={categoryNames}
                        onCategoryNameChange={setCategoryName}
                        onUpdateProduct={updateProduct}
                        onRemoveProduct={removeProduct}
                        onToggleCategory={toggleCategory}
                        onToggleAll={toggleAll}
                        tenantId={tenantId}
                        importMode={importMode}
                        onImportModeChange={setImportMode}
                        onSetExistingPlan={setExistingImportPlan}
                        initialCatalogId={initialCatalogId}
                        initialCatalogName={initialCatalogName}
                        forceNewCatalog={forceNewCatalog}
                    />
                )}

                {/* Import overlay */}
                {isCreating && (
                    <div className={styles.importOverlay}>
                        {!importDone ? (
                            <>
                                <div className={styles.importSpinner} />
                                <div className={styles.importText}>
                                    Creazione in corso... {createProgress.current}/{createProgress.total} prodotti
                                </div>
                                <div className={styles.importProgress}>
                                    <div className={styles.progressTrack}>
                                        <div
                                            className={styles.progressFill}
                                            style={{ width: `${progressPct}%` }}
                                        />
                                    </div>
                                </div>
                                <div className={styles.importHint}>
                                    Non chiudere questa finestra
                                </div>
                            </>
                        ) : (
                            <div className={styles.importSuccess}>
                                <div className={styles.importSuccessIcon}>
                                    <Check size={28} strokeWidth={3} />
                                </div>
                                <div className={styles.importSuccessText}>
                                    Importazione completata!
                                </div>
                                <div className={styles.importSuccessDetail}>
                                    {importResult.created} prodotti creati
                                    {importResult.errors > 0 && `, ${importResult.errors} saltati`}
                                </div>
                                {/* L'ultimo momento in cui il numero è ancora
                                    davanti agli occhi: dopo la chiusura il
                                    prodotto senza prezzo si confonde con gli
                                    altri. Il rimando al filtro chiude il giro. */}
                                {createdWithoutPrice > 0 && (
                                    <div className={styles.importSuccessNotice}>
                                        <AlertTriangle
                                            size={18}
                                            className={styles.importSuccessNoticeIcon}
                                            aria-hidden
                                        />
                                        <div>
                                            <div className={styles.importSuccessNoticeTitle}>
                                                {createdWithoutPrice === 1
                                                    ? "1 prodotto è senza prezzo"
                                                    : `${createdWithoutPrice} prodotti sono senza prezzo`}
                                            </div>
                                            <div className={styles.importSuccessNoticeText}>
                                                {createdWithoutPrice === 1
                                                    ? `Compare nel ${catalogLower} ma non può essere ordinato.`
                                                    : `Compaiono nel ${catalogLower} ma non possono essere ordinati.`}{" "}
                                                Li trovi con il filtro «Senza prezzo» in Prodotti.
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className={styles.footer}>
                {renderFooter()}
            </div>
        </div>
    );
}
