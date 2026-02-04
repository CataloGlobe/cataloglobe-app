import { HashLoader } from "react-spinners";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./AppLoader.module.scss";

export type AppLoaderIntent = "dashboard" | "auth" | "otp" | "sync" | "public" | "generic";

const MESSAGE_MAP: Record<AppLoaderIntent, string> = {
    dashboard: "Stiamo preparando la tua dashboard",
    auth: "Accesso in corso…",
    otp: "Verifica codice di sicurezza…",
    sync: "Sincronizzazione dei dati…",
    public: "Stiamo caricando il catalogo",
    generic: "Caricamento in corso…"
};

type AppLoaderProps = {
    intent?: AppLoaderIntent;
    message?: string;
    showMessage?: boolean;
};

export function AppLoader({ intent = "generic", message, showMessage = true }: AppLoaderProps) {
    const resolvedMessage = message ?? MESSAGE_MAP[intent];

    return (
        <AnimatePresence>
            <motion.div
                className={styles.root}
                role="status"
                aria-live="polite"
                aria-busy="true"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
            >
                <motion.div
                    className={styles.content}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                >
                    <AppLoaderSpinner />

                    {showMessage && <p className={styles.message}>{resolvedMessage}</p>}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

/* -------------------------------------------------------------------------- */

type AppLoaderSpinnerProps = {
    size?: number;
};

const SPINNER_COLOR = "#6366f1";

export function AppLoaderSpinner({ size = 64 }: AppLoaderSpinnerProps) {
    return <HashLoader size={size} color={SPINNER_COLOR} />;
}
