import { Loader } from "@/components/ui/Loader/Loader";
import Text from "@/components/ui/Text/Text";
import { CHECKOUT_CONFIRM_LOADER_TEXT } from "@/hooks/useCheckoutReturnSync";
import styles from "./CheckoutConfirmScreen.module.scss";

/**
 * Full-page wait shown while `useCheckoutReturnSync` links the tenant to the
 * subscription just paid for. Rendered INSTEAD of the page (and of any
 * subscription gate), never on top of it.
 */
export function CheckoutConfirmScreen() {
    return (
        <div className={styles.screen} role="status" aria-live="polite">
            <Loader size="lg" ariaLabel={CHECKOUT_CONFIRM_LOADER_TEXT} />
            <Text variant="body" colorVariant="muted">
                {CHECKOUT_CONFIRM_LOADER_TEXT}
            </Text>
        </div>
    );
}
