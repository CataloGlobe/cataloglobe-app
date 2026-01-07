export type ToastType = "success" | "error" | "info";

export interface ToastOptions {
    id?: string;
    message: string;
    type?: ToastType;
    duration?: number;
    actionLabel?: string;
    onAction?: () => void;
}

export type Toast = Required<Omit<ToastOptions, "actionLabel" | "onAction">> & {
    actionLabel?: string;
    onAction?: () => void;
};

export interface ToastContextValue {
    showToast: (options: ToastOptions) => void;
}
