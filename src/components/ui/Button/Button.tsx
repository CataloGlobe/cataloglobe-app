import React, { forwardRef } from "react";
import Text from "../Text/Text";
import styles from "./Button.module.scss";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface BaseProps {
    variant?: ButtonVariant;
    size?: ButtonSize;
    fullWidth?: boolean;
    loading?: boolean;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
}

type ButtonAsButton = BaseProps &
    React.ButtonHTMLAttributes<HTMLButtonElement> & {
        as?: "button";
    };

type ButtonAsLink = BaseProps &
    React.AnchorHTMLAttributes<HTMLAnchorElement> & {
        as: "a";
    };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
    (props, ref) => {
        const {
            as = "button",
            variant = "primary",
            size = "md",
            fullWidth = false,
            loading = false,
            leftIcon,
            rightIcon,
            className,
            children,
            ...rest
        } = props as ButtonProps;

        const classes = [
            styles.button,
            styles[`variant-${variant}`],
            styles[`size-${size}`],
            fullWidth && styles.fullWidth,
            loading && styles.loading,
            className
        ]
            .filter(Boolean)
            .join(" ");

        const content = (
            <>
                {loading && <span className={styles.spinner} aria-hidden />}
                {!loading && leftIcon && <span className={styles.icon}>{leftIcon}</span>}
                <Text as="span" variant="button" weight={600} className={styles.label}>
                    {children}
                </Text>
                {/* <span className={styles.label}>{children}</span> */}
                {!loading && rightIcon && <span className={styles.icon}>{rightIcon}</span>}
            </>
        );

        if (as === "a") {
            const linkProps = rest as React.AnchorHTMLAttributes<HTMLAnchorElement>;

            return (
                <a
                    ref={ref as React.Ref<HTMLAnchorElement>}
                    className={classes}
                    aria-disabled={loading || linkProps["aria-disabled"]}
                    {...linkProps}
                >
                    {content}
                </a>
            );
        }

        const buttonProps = rest as React.ButtonHTMLAttributes<HTMLButtonElement>;

        return (
            <button
                ref={ref as React.Ref<HTMLButtonElement>}
                type={buttonProps.type ?? "button"}
                disabled={loading || buttonProps.disabled}
                aria-busy={loading || undefined}
                className={classes}
                {...buttonProps}
            >
                {content}
            </button>
        );
    }
);

Button.displayName = "Button";
