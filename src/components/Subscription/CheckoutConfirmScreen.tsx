import { Loader } from "@/components/ui/Loader/Loader";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { CHECKOUT_CONFIRM_LOADER_TEXT, type CheckoutConfirmStatus } from "@/hooks/useCheckoutReturnSync";
import styles from "./CheckoutConfirmScreen.module.scss";

interface CheckoutConfirmScreenProps {
    /** "syncing" (default), "failed" (retryable), "mismatch" (conflict, no retry). */
    variant?: Exclude<CheckoutConfirmStatus, "idle">;
    /** Session/tenant id the user quotes to support (failed + mismatch). */
    reference?: string | null;
    /** "Completa l'attivazione" — re-run confirm. Only used by the "failed" variant. */
    onRetry?: () => void;
}

/**
 * Full-page state shown at the return from Stripe Checkout, rendered INSTEAD of
 * the page (and of any subscription gate), never on top of it.
 *
 * Three variants, keyed off the confirm outcome (see `useCheckoutReturnSync`):
 *   - syncing:  neutral loader while confirm runs (incl. the silent retries).
 *   - failed:   retryable — payment ok, activation slow, offer to complete/reload.
 *   - mismatch: conflict — payment ok but not for this tenant, contact support.
 */
export function CheckoutConfirmScreen({ variant = "syncing", reference, onRetry }: CheckoutConfirmScreenProps) {
    if (variant === "syncing") {
        return (
            <div className={styles.screen} role="status" aria-live="polite">
                <Loader size="lg" ariaLabel={CHECKOUT_CONFIRM_LOADER_TEXT} />
                <Text variant="body" colorVariant="muted">
                    {CHECKOUT_CONFIRM_LOADER_TEXT}
                </Text>
            </div>
        );
    }

    if (variant === "mismatch") {
        return (
            <div className={styles.screen} role="alert">
                <div className={styles.panel}>
                    <Text as="h1" variant="title-sm" weight={700}>
                        Non riusciamo a collegare questo pagamento
                    </Text>
                    <Text variant="body" colorVariant="muted">
                        Il pagamento risulta completato, ma non corrisponde a questa azienda. Non ti verrà
                        addebitato nulla di nuovo: scrivici e lo sistemiamo noi.
                    </Text>
                    {reference && (
                        <Text variant="caption" colorVariant="muted">
                            Riferimento da citare: {reference}
                        </Text>
                    )}
                </div>
            </div>
        );
    }

    // variant === "failed"
    return (
        <div className={styles.screen} role="alert">
            <div className={styles.panel}>
                <Text as="h1" variant="title-sm" weight={700}>
                    Il pagamento è andato a buon fine
                </Text>
                <Text variant="body" colorVariant="muted">
                    Stiamo completando l'attivazione e ci sta mettendo più del previsto. Non ti verrà
                    addebitato nulla di nuovo.
                </Text>
                <div className={styles.actions}>
                    <Button variant="primary" onClick={onRetry}>
                        Completa l'attivazione
                    </Button>
                    <Button variant="outline" onClick={() => window.location.reload()}>
                        Ricarica la pagina
                    </Button>
                </div>
                {reference && (
                    <Text variant="caption" colorVariant="muted">
                        Riferimento: {reference}
                    </Text>
                )}
            </div>
        </div>
    );
}
