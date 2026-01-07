import React from "react";
import type { Toast } from "@/types/toast";
import { ToastItem } from "./Toast";
import styles from "./Toast.module.scss";

interface ToastContainerProps {
    toasts: Toast[];
    onRemove: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onRemove }) => {
    return (
        <div className={styles.toastContainer}>
            {toasts.map(toast => (
                <ToastItem key={toast.id} toast={toast} onRemove={() => onRemove(toast.id)} />
            ))}
        </div>
    );
};
