import React, { forwardRef } from "react";
import { Button } from "./Button";
import styles from "./Button.module.scss";

interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
    icon: React.ReactNode;
    "aria-label": string;
    variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
    size?: "sm" | "md" | "lg";
    loading?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
    ({ icon, variant = "ghost", size = "md", loading, className, ...props }, ref) => {
        return (
            <Button
                ref={ref}
                variant={variant}
                size={size}
                loading={loading}
                className={`${styles.iconOnly} ${className ?? ""}`}
                {...props}
            >
                {icon}
            </Button>
        );
    }
);

IconButton.displayName = "IconButton";
