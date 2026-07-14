import { useId } from "react";
import styles from "./CataloglobeLoader.module.scss";

export type CataloglobeLoaderVariant = "pulse" | "shimmer" | "chase";

export type CataloglobeLoaderProps = {
    size?: number;
    className?: string;
    variant?: CataloglobeLoaderVariant;
};

const ORBIT_RING_PATH_D =
    "M863.686 455.899C786.535 540.064 701.909 620.785 546.753 707.078C365.272 808.013 231.134 850.422 136.449 817.106C55.3525 778.969 65.4346 677.27 162.75 569.434C166.257 587.406 168.449 596.174 173.271 614.146C96.5582 728.996 149.6 782.914 294.696 747.846C375.377 722.296 424.747 699.63 512.561 650.092C621.712 582.584 689.038 540.356 789.603 433.981C881.22 345.871 932.07 209.103 757.603 238.473C742.699 224.445 732.178 218.747 716.836 207.349C799.247 183.24 906.667 181.486 932.947 241.98C956.373 295.898 934.7 371.295 863.686 455.899Z";

export function CataloglobeLoader({ size = 96, className, variant = "pulse" }: CataloglobeLoaderProps) {
    const uid = useId();
    const paint0 = `paint0_linear_74_19-${uid}`;
    const paint1 = `paint1_linear_74_19-${uid}`;
    const paint2 = `paint2_linear_74_19-${uid}`;
    const paint3 = `paint3_linear_74_19-${uid}`;
    const orbitClipId = `orbit-clip-${uid}`;
    const shimmerGradientId = `orbit-shimmer-gradient-${uid}`;
    const chaseGradientId = `orbit-chase-gradient-${uid}`;

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 1024 1024"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={`${styles.svg} ${className ?? ""}`.trim()}
            role="img"
            aria-hidden="true"
        >
            <g
                id="loader-logo-group"
                className={variant === "pulse" ? styles.logoGroup : styles.logoGroupStatic}
            >
                <g id="loader-base">
                    <path
                        d="M826.306 588.06C774.102 717.025 640.022 768.238 536.67 711.901C451.006 758.441 410.25 776.164 315.299 810.531C566.174 973.04 857.742 797.294 879.473 547.14C879.972 541.401 874.028 537.393 868.835 539.885C848.869 549.461 834.615 567.534 826.306 588.06Z"
                        fill={`url(#${paint2})`}
                    />
                    <path
                        d="M245.594 740.296C291.639 735.187 383.061 699.77 457.268 659.957C462.102 657.363 463.3 651.006 459.999 646.623C394.41 559.514 391.743 433.315 445.489 344.556C517.956 224.883 663.964 198.309 765.634 291.439C777.52 302.326 791.375 311.157 807.003 315.103C814.061 316.886 819.576 309.233 815.424 303.254C692.945 126.853 469.798 123.479 345.106 193.76C130.447 314.75 108.838 575.166 234.87 735.646C237.447 738.928 241.446 740.756 245.594 740.296Z"
                        fill={`url(#${paint3})`}
                    />
                </g>

                <g id="loader-orbit-static" className={styles.orbitStatic}>
                    <path d={ORBIT_RING_PATH_D} fill={`url(#${paint1})`} />
                </g>

                {variant === "pulse" && (
                    <g id="loader-orbit-glow" className={styles.orbitGlow}>
                        <path d={ORBIT_RING_PATH_D} fill={`url(#${paint0})`} />
                    </g>
                )}

                {variant === "shimmer" && (
                    <g id="loader-orbit-shimmer" clipPath={`url(#${orbitClipId})`}>
                        <rect
                            x="0"
                            y="0"
                            width="1024"
                            height="1024"
                            fill={`url(#${shimmerGradientId})`}
                            className={styles.orbitShimmerSweep}
                        />
                    </g>
                )}

                {variant === "chase" && (
                    <g id="loader-orbit-chase" clipPath={`url(#${orbitClipId})`}>
                        <rect
                            x="0"
                            y="0"
                            width="1024"
                            height="1024"
                            fill={`url(#${chaseGradientId})`}
                            className={styles.orbitChaseTrail}
                        />
                    </g>
                )}
            </g>

            <defs>
                {(variant === "shimmer" || variant === "chase") && (
                    <clipPath id={orbitClipId}>
                        <path d={ORBIT_RING_PATH_D} />
                    </clipPath>
                )}
                {variant === "chase" && (
                    <linearGradient
                        id={chaseGradientId}
                        x1="0"
                        y1="0"
                        x2="1"
                        y2="0"
                        gradientUnits="objectBoundingBox"
                    >
                        <stop offset="0.40" stopColor="#ffffff" stopOpacity="0" />
                        <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.9" />
                        <stop offset="0.60" stopColor="#ffffff" stopOpacity="0" />
                    </linearGradient>
                )}
                {variant === "shimmer" && (
                    <linearGradient
                        id={shimmerGradientId}
                        x1="0"
                        y1="0"
                        x2="1"
                        y2="1"
                        gradientUnits="objectBoundingBox"
                    >
                        <stop offset="0.42" stopColor="#ffffff" stopOpacity="0" />
                        <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.9" />
                        <stop offset="0.58" stopColor="#ffffff" stopOpacity="0" />
                    </linearGradient>
                )}
                <linearGradient
                    id={paint0}
                    x1="450.752"
                    y1="324.391"
                    x2="658.972"
                    y2="637.379"
                    gradientUnits="userSpaceOnUse"
                >
                    <stop stopColor="#333580" />
                    <stop offset="0.401139" stopColor="#595CE0" />
                    <stop offset="1" stopColor="#6265F1" />
                </linearGradient>
                <linearGradient
                    id={paint1}
                    x1="450.752"
                    y1="324.391"
                    x2="658.972"
                    y2="637.379"
                    gradientUnits="userSpaceOnUse"
                >
                    <stop stopColor="#333580" />
                    <stop offset="0.401139" stopColor="#595CE0" />
                    <stop offset="1" stopColor="#6265F1" />
                </linearGradient>
                <linearGradient
                    id={paint2}
                    x1="565.602"
                    y1="1014.37"
                    x2="399.025"
                    y2="704.01"
                    gradientUnits="userSpaceOnUse"
                >
                    <stop offset="0.647706" stopColor="#6265F1" />
                    <stop offset="1" stopColor="#2F3073" />
                </linearGradient>
                <linearGradient
                    id={paint3}
                    x1="602.861"
                    y1="580.831"
                    x2="279.352"
                    y2="135.459"
                    gradientUnits="userSpaceOnUse"
                >
                    <stop stopColor="#6265F1" />
                    <stop offset="0.527981" stopColor="#6C6FF1" />
                    <stop offset="1" stopColor="#7A7DFB" />
                </linearGradient>
            </defs>
        </svg>
    );
}
