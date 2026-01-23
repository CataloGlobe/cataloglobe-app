import { CSSProperties, PropsWithChildren } from "react";
import Text from "../Text/Text";
import styles from "./Badge.module.scss";
import clsx from "clsx";

export type BadgeVariant = "primary" | "secondary" | "success" | "danger" | "warning";

export interface BadgeProps extends PropsWithChildren {
    variant?: BadgeVariant;
    color?: string;
    absolute?: boolean;

    top?: number | string;
    right?: number | string;
    bottom?: number | string;
    left?: number | string;

    className?: string;
}

export const Badge = ({
    children,
    variant = "primary",
    color,
    absolute = false,
    top,
    right,
    bottom,
    left,
    className
}: BadgeProps) => {
    const style: CSSProperties = {
        ...(color && {
            "--badge-bg": color
        }),
        ...(absolute && {
            position: "absolute",
            top,
            right,
            bottom,
            left
        })
    } as CSSProperties;

    return (
        <Text
            variant="caption-xs"
            className={clsx(styles.badge, styles[variant], absolute && styles.absolute, className)}
            style={style}
            role="status"
        >
            {children}
        </Text>
    );
};
