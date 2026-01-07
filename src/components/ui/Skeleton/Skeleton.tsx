import { useEffect, useRef, useState } from "react";
import styles from "./Skeleton.module.scss";

interface BaseProps {
    radius?: string;
    className?: string;
}

interface StaticSkeletonProps extends BaseProps {
    width?: string | number;
    height?: string | number;
    loading?: never;
    children?: never;
}

interface WrapperSkeletonProps extends BaseProps {
    loading: boolean;
    children: React.ReactNode;
    width?: never;
    height?: never;
}

type SkeletonProps = StaticSkeletonProps | WrapperSkeletonProps;

export default function Skeleton(props: SkeletonProps) {
    const { radius = "8px", className } = props;
    const ref = useRef<HTMLDivElement>(null);
    const [dims, setDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

    // 🔹 sempre definito, ma si attiva solo se "loading" esiste
    useEffect(() => {
        if (!("loading" in props)) return;
        const el = ref.current;
        if (!el) return;

        const updateDims = () => {
            setDims({ w: el.offsetWidth, h: el.offsetHeight });
        };

        const resizeObs = new ResizeObserver(updateDims);
        resizeObs.observe(el);
        updateDims();

        return () => resizeObs.disconnect();
    }, [props]);

    // 🔹 wrapper mode
    if ("loading" in props) {
        const { loading, children } = props;
        if (!loading) return <>{children}</>;

        return (
            <div
                ref={ref}
                className={`${styles.skeleton} ${className || ""}`}
                style={{
                    width: dims.w || "100%",
                    height: dims.h || "1rem",
                    borderRadius: radius
                }}
            />
        );
    }

    // 🔹 static mode
    const { width = "100%", height = "1rem" } = props;
    return (
        <div
            className={`${styles.skeleton} ${className || ""}`}
            style={{ width, height, borderRadius: radius }}
        />
    );
}
