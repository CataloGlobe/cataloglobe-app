import type { SocialClickData } from "@/services/supabase/analytics";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import Text from "@/components/ui/Text/Text";
import styles from "../Analytics.module.scss";

type Props = {
    data: SocialClickData[];
    isLoading: boolean;
};

const SOCIAL_COLORS: Record<string, string> = {
    instagram: "#E1306C",
    whatsapp: "#25D366",
    phone: "#1C1917",
    facebook: "#1877F2",
    email: "#78716C",
    website: "#2563EB"
};

const SOCIAL_LABELS: Record<string, string> = {
    instagram: "Instagram",
    whatsapp: "WhatsApp",
    phone: "Telefono",
    facebook: "Facebook",
    email: "Email",
    website: "Sito web"
};

export default function SocialClicksChart({ data, isLoading }: Props) {
    const maxCount = data.length > 0 ? Math.max(...data.map(d => d.click_count)) : 1;

    return (
        <article className={styles.chartCard} aria-label="Click social">
            <header className={styles.chartCardHeader}>
                <Text variant="title-sm" align="left">
                    Click social
                </Text>
            </header>

            <div className={styles.chartCardBody} style={{ minHeight: "unset" }}>
                {isLoading ? (
                    <div className={styles.tableSkeletons}>
                        {[1, 2, 3, 4].map(i => (
                            <Skeleton key={i} height="32px" radius="6px" />
                        ))}
                    </div>
                ) : data.length === 0 ? (
                    <div className={styles.chartEmpty}>
                        <Text variant="body" colorVariant="muted">
                            Nessun click social nel periodo selezionato
                        </Text>
                    </div>
                ) : (
                    <div className={styles.socialBars}>
                        {data.map(d => {
                            const color = SOCIAL_COLORS[d.social_type] ?? "#94a3b8";
                            const label = SOCIAL_LABELS[d.social_type] ?? d.social_type;
                            const pct = (d.click_count / maxCount) * 100;

                            return (
                                <div key={d.social_type} className={styles.socialBarRow}>
                                    <span className={styles.socialBarLabel}>
                                        <Text variant="caption" weight={500}>
                                            {label}
                                        </Text>
                                    </span>
                                    <div className={styles.socialBarTrack}>
                                        <div
                                            className={styles.socialBarFill}
                                            style={{ width: `${pct}%`, background: color }}
                                        />
                                    </div>
                                    <span className={styles.socialBarCount}>
                                        <Text variant="caption" weight={600}>
                                            {d.click_count}
                                        </Text>
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </article>
    );
}
