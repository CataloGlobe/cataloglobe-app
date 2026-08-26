import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { Logo } from "@/components/ui/Logo/Logo";
import styles from "./SetupShell.module.scss";

export type SetupStepDefinition = {
    id: string;
    /** Voce dello stepper. */
    label: string;
    /** Riga di supporto sotto la voce, nello stepper. */
    hint: string;
};

type SetupShellProps = {
    steps: SetupStepDefinition[];
    /** Indice 0-based del passo mostrato. I precedenti risultano completati. */
    currentIndex: number;
    title: string;
    subtitle: string;
    children: ReactNode;
    /**
     * Quando valorizzato, il bottone primario è `type="submit"` collegato al
     * form via attributo `form` — stesso meccanismo del footer di DrawerLayout,
     * così il form non contiene bottoni di submit.
     */
    formId?: string;
    primaryLabel: string;
    primaryDisabled?: boolean;
    primaryLoading?: boolean;
    /** Usato solo quando `formId` è assente (passo senza form). */
    onPrimaryClick?: () => void;
    /** Uscita confermata: il chiamante decide dove portare l'utente. */
    onExit: () => void;
};

export function SetupShell({
    steps,
    currentIndex,
    title,
    subtitle,
    children,
    formId,
    primaryLabel,
    primaryDisabled = false,
    primaryLoading = false,
    onPrimaryClick,
    onExit
}: SetupShellProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);

    useEffect(() => {
        dialogRef.current?.focus();
    }, []);

    const requestClose = useCallback(() => setIsConfirmOpen(true), []);

    // Esc non chiude il percorso: apre la conferma, come da flusso guidato.
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            if (isConfirmOpen) {
                setIsConfirmOpen(false);
                return;
            }
            setIsConfirmOpen(true);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [isConfirmOpen]);

    const stepCounter = `Passo ${currentIndex + 1} di ${steps.length}`;

    return (
        <div className={styles.backdrop}>
            <div
                ref={dialogRef}
                className={styles.dialog}
                role="dialog"
                aria-modal="true"
                aria-labelledby="setup-step-title"
                tabIndex={-1}
            >
                <aside className={styles.sidebar}>
                    <div className={styles.brand}>
                        <Logo variant="lockup-horizontal" color="auto" size={26} />
                    </div>

                    <ol className={styles.stepper}>
                        {steps.map((step, index) => {
                            const state =
                                index < currentIndex
                                    ? "done"
                                    : index === currentIndex
                                      ? "current"
                                      : "todo";

                            return (
                                <li
                                    key={step.id}
                                    className={styles.step}
                                    data-state={state}
                                    aria-current={state === "current" ? "step" : undefined}
                                >
                                    <span className={styles.stepMarker} aria-hidden>
                                        {state === "done" ? <Check size={14} /> : index + 1}
                                    </span>
                                    <span className={styles.stepText}>
                                        <Text variant="body-sm" weight={600}>
                                            {step.label}
                                        </Text>
                                        <Text variant="caption" colorVariant="muted">
                                            {step.hint}
                                        </Text>
                                    </span>
                                </li>
                            );
                        })}
                    </ol>

                    <div className={styles.sidebarFooter}>
                        <Text variant="caption" colorVariant="muted">
                            Puoi interrompere quando vuoi: il progresso resta salvato.
                        </Text>
                        <button type="button" className={styles.closeLink} onClick={requestClose}>
                            Chiudi il setup
                        </button>
                    </div>
                </aside>

                <div className={styles.main}>
                    <div className={styles.content}>
                        <header className={styles.contentHeader}>
                            <Text as="h1" id="setup-step-title" variant="title-md" weight={700}>
                                {title}
                            </Text>
                            <Text variant="body-sm" colorVariant="muted">
                                {subtitle}
                            </Text>
                        </header>

                        {children}
                    </div>

                    <footer className={styles.footer}>
                        <Text variant="caption" colorVariant="muted">
                            {stepCounter}
                        </Text>
                        <div className={styles.footerActions}>
                            {formId ? (
                                <Button
                                    variant="primary"
                                    type="submit"
                                    form={formId}
                                    loading={primaryLoading}
                                    disabled={primaryDisabled}
                                >
                                    {primaryLabel}
                                </Button>
                            ) : (
                                <Button
                                    variant="primary"
                                    onClick={onPrimaryClick}
                                    loading={primaryLoading}
                                    disabled={primaryDisabled}
                                >
                                    {primaryLabel}
                                </Button>
                            )}
                        </div>
                    </footer>
                </div>

                {isConfirmOpen && (
                    <div className={styles.confirmBackdrop}>
                        <div
                            className={styles.confirm}
                            role="alertdialog"
                            aria-modal="true"
                            aria-labelledby="setup-confirm-title"
                        >
                            <Text
                                as="h2"
                                id="setup-confirm-title"
                                variant="title-sm"
                                weight={700}
                            >
                                Vuoi chiudere il setup?
                            </Text>
                            <Text variant="body-sm" colorVariant="muted">
                                Il progresso resta salvato: puoi riprendere da dove hai
                                interrotto quando vuoi.
                            </Text>
                            <div className={styles.confirmActions}>
                                <Button variant="secondary" onClick={() => setIsConfirmOpen(false)}>
                                    Continua il setup
                                </Button>
                                <Button variant="primary" onClick={onExit}>
                                    Vai alla Panoramica
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
