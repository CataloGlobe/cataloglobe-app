import { Component, type ErrorInfo, type ReactNode } from "react";
import i18n from "@/i18n";
import styles from "./PublicErrorBoundary.module.scss";

type Props = { children: ReactNode };
type State = { hasError: boolean };

/**
 * Error boundary dedicato al subtree pubblico (`/:slug/:lang?`). Cattura
 * errori di render non gestiti e mostra un fallback con bottone "Ricarica".
 *
 * NON sostituisce la gestione errori della state machine in
 * `PublicCollectionPage` (errori di rete / domain). Cattura solo gli
 * unrecoverable render errors di React.
 */
export default class PublicErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error("[PublicErrorBoundary] render error:", error, info.componentStack);
    }

    private handleReload = (): void => {
        if (typeof window !== "undefined") {
            window.location.reload();
        }
    };

    render(): ReactNode {
        if (!this.state.hasError) return this.props.children;

        const message = i18n.t("error_boundary.message", {
            ns: "public",
            defaultValue: "Si è verificato un errore imprevisto."
        });
        const reload = i18n.t("error_boundary.reload", {
            ns: "public",
            defaultValue: "Ricarica"
        });

        return (
            <div className={styles.root} role="alert">
                <div className={styles.card}>
                    <p className={styles.message}>{message}</p>
                    <button type="button" className={styles.button} onClick={this.handleReload}>
                        {reload}
                    </button>
                </div>
            </div>
        );
    }
}
