import type { DeviceData } from "@/services/supabase/analytics";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import Text from "@/components/ui/Text/Text";
import styles from "../Analytics.module.scss";

type Props = {
    data: DeviceData[];
    isLoading: boolean;
};

const DEVICE_COLORS: Record<string, string> = {
    mobile: "#1C1917",
    desktop: "#A8A29E",
    tablet: "#D6D3D1"
};

const DEVICE_LABELS: Record<string, string> = {
    mobile: "Mobile",
    desktop: "Desktop",
    tablet: "Tablet"
};

const RADIUS = 52;
const STROKE = 12;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SIZE = (RADIUS + STROKE) * 2 + 4;
const CENTER = SIZE / 2;

export default function DeviceDistribution({ data, isLoading }: Props) {
    const dominant = data[0] ?? null;

    // Build SVG arc segments
    let offset = 0;
    const segments = data.map(d => {
        const fraction = d.percentage / 100;
        const dash = fraction * CIRCUMFERENCE;
        const gap = CIRCUMFERENCE - dash;
        const seg = { ...d, dash, gap, offset };
        offset += dash;
        return seg;
    });

    return (
        <article className={styles.chartCard} aria-label="Distribuzione dispositivi">
            <header className={styles.chartCardHeader}>
                <Text variant="title-sm" align="left">
                    Dispositivi
                </Text>
            </header>

            <div className={`${styles.chartCardBody} ${styles.deviceBody}`} style={{ minHeight: "unset" }}>
                {isLoading ? (
                    <div className={styles.deviceLoadingRow}>
                        <Skeleton height="128px" width="128px" radius="50%" />
                        <div className={styles.tableSkeletons} style={{ flex: 1 }}>
                            <Skeleton height="20px" radius="6px" />
                            <Skeleton height="20px" radius="6px" />
                            <Skeleton height="20px" radius="6px" />
                        </div>
                    </div>
                ) : data.length === 0 ? (
                    <div className={styles.chartEmpty}>
                        <Text variant="body" colorVariant="muted">
                            Nessun dato nel periodo selezionato
                        </Text>
                    </div>
                ) : (
                    <div className={styles.deviceRow}>
                        {/* Donut SVG */}
                        <div className={styles.donutWrapper}>
                            <svg
                                width={SIZE}
                                height={SIZE}
                                viewBox={`0 0 ${SIZE} ${SIZE}`}
                                aria-hidden="true"
                            >
                                {/* Background track */}
                                <circle
                                    cx={CENTER}
                                    cy={CENTER}
                                    r={RADIUS}
                                    fill="none"
                                    stroke="#f1f5f9"
                                    strokeWidth={STROKE}
                                />
                                {segments.map((seg, i) => (
                                    <circle
                                        key={i}
                                        cx={CENTER}
                                        cy={CENTER}
                                        r={RADIUS}
                                        fill="none"
                                        stroke={DEVICE_COLORS[seg.device_type] ?? "#cbd5e1"}
                                        strokeWidth={STROKE}
                                        strokeDasharray={`${seg.dash} ${seg.gap}`}
                                        strokeDashoffset={-(seg.offset - CIRCUMFERENCE / 4)}
                                        strokeLinecap="butt"
                                    />
                                ))}
                            </svg>
                            {dominant && (
                                <div className={styles.donutCenter}>
                                    <Text variant="title-md" weight={700}>
                                        {dominant.percentage.toFixed(0)}%
                                    </Text>
                                    <Text variant="caption" colorVariant="muted">
                                        {DEVICE_LABELS[dominant.device_type] ?? dominant.device_type}
                                    </Text>
                                </div>
                            )}
                        </div>

                        {/* Legend */}
                        <div className={styles.deviceLegend}>
                            {data.map(d => (
                                <div key={d.device_type} className={styles.deviceLegendItem}>
                                    <span
                                        className={styles.deviceDot}
                                        style={{ background: DEVICE_COLORS[d.device_type] ?? "#cbd5e1" }}
                                    />
                                    <Text variant="body">
                                        {DEVICE_LABELS[d.device_type] ?? d.device_type}
                                    </Text>
                                    <Text variant="body" weight={600} style={{ marginLeft: "auto" }}>
                                        {d.percentage.toFixed(1)}%
                                    </Text>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </article>
    );
}
