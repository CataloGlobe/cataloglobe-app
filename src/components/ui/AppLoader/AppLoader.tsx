import { HashLoader } from "react-spinners";
import styles from "./AppLoader.module.scss";

type AppLoaderProps = {
    message?: string;
};

export function AppLoader({ message = "Stiamo preparando la tua dashboard" }: AppLoaderProps) {
    return (
        <div className={styles.root} role="status" aria-live="polite" aria-busy="true">
            <div className={styles.content}>
                <AppLoaderSpinner />
                <p className={styles.message}>{message}</p>
            </div>
        </div>
    );
}

type AppLoaderSpinnerProps = {
    size?: number;
};

export function AppLoaderSpinner({ size = 64 }: AppLoaderSpinnerProps) {
    return <HashLoader size={size} color="#6366f1" />;
}
