import React from "react";
import { ToastContext } from "./ToastContext";
import type { Toast, ToastOptions, ToastType } from "@/types/toast";
import { ToastContainer } from "@components/ui/Toast/ToastContainer";

const DEFAULT_DURATION = 4000; // ms

const createId = (() => {
    let counter = 0;
    return () => {
        counter += 1;
        return `toast_${Date.now()}_${counter}`;
    };
})();

export interface ToastProviderProps {
    children: React.ReactNode;
    defaultDuration?: number;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({
    children,
    defaultDuration = DEFAULT_DURATION
}) => {
    const [toasts, setToasts] = React.useState<Toast[]>([]);

    const showToast = React.useCallback(
        (options: ToastOptions) => {
            const {
                id = createId(),
                message,
                type = "info" as ToastType,
                duration = defaultDuration
            } = options;

            const newToast: Toast = {
                id,
                message,
                type,
                duration,
                actionLabel: options.actionLabel,
                onAction: options.onAction
            };

            setToasts(prev => [...prev, newToast]);
        },
        [defaultDuration]
    );

    const removeToast = React.useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const contextValue = React.useMemo(
        () => ({
            showToast
        }),
        [showToast]
    );

    return (
        <ToastContext.Provider value={contextValue}>
            {children}
            <ToastContainer toasts={toasts} onRemove={removeToast} />
        </ToastContext.Provider>
    );
};
