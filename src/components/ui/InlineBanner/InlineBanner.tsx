import type { ReactNode } from "react";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import styles from "./InlineBanner.module.scss";

export type InlineBannerVariant = "error" | "warning" | "info";

interface InlineBannerProps {
  variant: InlineBannerVariant;
  children: ReactNode;
  className?: string;
  /** Icona 16 al posto di quella della variante. Non può mancare (regola 8). */
  icon?: ReactNode;
  /**
   * Azione opzionale a destra («Riprova», «Vai al piano»), allineata alla
   * prima riga del contenuto. Una sola: se ne servono due, la seconda è
   * un testo nel contenuto.
   */
  action?: ReactNode;
}

const DEFAULT_ICON: Record<InlineBannerVariant, ReactNode> = {
  error: <AlertCircle size={16} aria-hidden />,
  warning: <AlertTriangle size={16} aria-hidden />,
  info: <Info size={16} aria-hidden />
};

export function InlineBanner({ variant, children, className, icon, action }: InlineBannerProps) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={`${styles.banner} ${styles[variant]}${className ? ` ${className}` : ""}`}
    >
      <span className={styles.icon}>{icon ?? DEFAULT_ICON[variant]}</span>
      <div className={styles.content}>{children}</div>
      {action != null && action !== false && <div className={styles.action}>{action}</div>}
    </div>
  );
}
