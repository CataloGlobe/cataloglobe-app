import styles from "./InlineBanner.module.scss";

interface InlineBannerProps {
  variant: "error" | "warning" | "info";
  children: React.ReactNode;
  className?: string;
}

export function InlineBanner({ variant, children, className }: InlineBannerProps) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={`${styles.banner} ${styles[variant]}${className ? ` ${className}` : ""}`}
    >
      {children}
    </div>
  );
}
