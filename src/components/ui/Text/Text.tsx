import React from "react";
import styles from "./Text.module.scss";

type Variant = "display" | "title-lg" | "title-md" | "title-sm" | "body" | "caption" | "button";

type Weight = 400 | 500 | 600 | 700;

type ColorVariant =
    | "default"
    | "muted"
    | "success"
    | "error"
    | "warning"
    | "info"
    | "primary"
    | "dark"
    | "white";

interface TextProps {
    as?: React.ElementType;
    variant?: Variant;
    weight?: Weight;
    align?: "left" | "center" | "right";
    colorVariant?: ColorVariant;
    color?: string;
    className?: string;
    children: React.ReactNode;
}

/**
 * Componente Text – tipografia centralizzata e color system
 */
export default function Text({
    as: Tag = "p",
    variant = "body",
    weight,
    align = "left",
    colorVariant = "default",
    color,
    className,
    children,
    ...props
}: TextProps) {
    const classes = [
        styles.text,
        styles[variant],
        styles[`align-${align}`],
        !color && styles[`color-${colorVariant}`],
        className
    ]
        .filter(Boolean)
        .join(" ");

    const style: React.CSSProperties = {
        ...(weight && { fontWeight: weight }),
        ...(color && { color })
    };

    const Component = Tag as React.ElementType;

    return (
        <Component className={classes} style={style} {...props}>
            {children}
        </Component>
    );
}
