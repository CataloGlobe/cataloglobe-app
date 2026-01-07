import React from "react";
import styles from "./Button.module.scss";

export type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    label: string;
    variant?: ButtonVariant;
    fullWidth?: boolean;
    loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
    label,
    variant = "primary",
    fullWidth = false,
    loading = false,
    className = "",
    ...props
}) => {
    const classes = [
        styles.button,
        styles[`button--${variant}`],
        fullWidth ? styles["button--full"] : "",
        className
    ].join(" ");

    return (
        <button className={classes} disabled={loading || props.disabled} {...props}>
            {loading ? <span className={styles.loader} aria-hidden /> : label}
        </button>
    );
};
