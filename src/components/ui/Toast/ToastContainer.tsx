import React from "react";
import type { Toast } from "@/types/toast";
import { ToastItem } from "./Toast";
import styles from "./Toast.module.scss";

const MAX_VISIBLE = 3;

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({
  toasts,
  onRemove,
}) => {
  const visible = toasts.slice(-MAX_VISIBLE);
  const hiddenCount = toasts.length - visible.length;

  return (
    <div className={styles.toastContainer}>
      {hiddenCount > 0 && (
        <div className={styles.toastOverflowBadge}>+{hiddenCount} altri</div>
      )}
      {visible.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onRemove={() => onRemove(toast.id)}
        />
      ))}
    </div>
  );
};
