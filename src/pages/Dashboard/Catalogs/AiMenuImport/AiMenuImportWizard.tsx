import { Sparkles, ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import type { AiImportSession } from "@/hooks/useAiImportSession";

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
}

export function AiMenuImportWizard({ session }: AiMenuImportWizardProps) {
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
        createProducts,
        close
    } = session;

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
            return (
                <Button variant="outline" onClick={retry}>
                    Annulla
                </Button>
            );
        }

        // review
        return (
            <>
                <Button variant="outline" onClick={retry} disabled={isCreating} leftIcon={<ArrowLeft size={16} />}>
                    Indietro
                </Button>
                <Button
                    variant="primary"
                    onClick={createProducts}
                    disabled={selectedProducts.length === 0 || !menuName.trim() || isCreating}
                    loading={isCreating}
                >
                    {isCreating
                        ? `Creazione... (${createProgress.current}/${createProgress.total})`
                        : `Importa ${selectedProducts.length} prodotti`}
                </Button>
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
