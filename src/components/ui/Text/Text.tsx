import React from "react";
import styles from "./Text.module.scss";

type Variant =
    | "display"
    | "title-lg"
    | "title-md"
    | "title-sm"
    | "body-lg"
    | "body"
    | "body-sm"
    | "caption"
    | "caption-xs"
    | "button";

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

type Align = "left" | "center" | "right";

/* ---------------------------------------------
 * Polymorphic typing 
--------------------------------------------- */
type PropsOf<T extends React.ElementType> = React.ComponentPropsWithoutRef<T>;

type TextOwnProps<T extends React.ElementType> = {
    as?: T;
    variant?: Variant;
    weight?: Weight;
    align?: Align;
    colorVariant?: ColorVariant;
    color?: string;
    className?: string;
    children: React.ReactNode;
};

type TextProps<T extends React.ElementType = "p"> = TextOwnProps<T> &
    Omit<PropsOf<T>, keyof TextOwnProps<T> | "color">;

/* ---------------------------------------------
 * Component
--------------------------------------------- */
export default function Text<T extends React.ElementType = "p">({
    as,
    variant = "body",
    weight,
    align = "left",
    colorVariant = "default",
    color,
    className,
    children,
    ...props
}: TextProps<T>) {
    const Component = (as ?? "p") as React.ElementType;

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

    return (
        <Component className={classes} style={style} {...props}>
            {children}
        </Component>
    );
}
