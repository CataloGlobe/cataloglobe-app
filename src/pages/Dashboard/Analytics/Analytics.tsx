import { useEffect, useState, useMemo } from "react";
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Tooltip,
    Legend,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    LineChart,
    Line
} from "recharts";
import { getAnalyticsReviews } from "@services/supabase/reviews";
import { getAnalyticsQrScans } from "@services/supabase/qrScans";
import { useAuth } from "@context/useAuth";
import Text from "@components/ui/Text/Text";
import Skeleton from "@components/ui/Skeleton/Skeleton";
import type { AnalyticsReview } from "@services/supabase/reviews";
import { getUserBusinesses } from "@services/supabase/businesses";
import styles from "./Analytics.module.scss";
import { Select } from "@/components/ui/Select/Select";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";

type Range = 7 | 30 | 90;

const COLORS = ["#ef4444", "#f97316", "#facc15", "#22c55e", "#3b82f6"];

// Estendiamo il tipo per supportare più ristoranti senza rompere nulla
type ExtendedAnalyticsReview = AnalyticsReview & {
    business_id?: string | null;
    restaurant_name?: string | null;
};

type AnalyticsQrScan = {
    id: string;
    business_id?: string | null;
    created_at: string;
};

type BusinessOption = {
    id: string;
    name: string;
};

export default function Analytics() {
    const { user } = useAuth();

    const [reviews, setReviews] = useState<ExtendedAnalyticsReview[]>([]);
    const [qrScans, setQrScans] = useState<AnalyticsQrScan[]>([]);
    const [range, setRange] = useState<Range>(30);
    const [selectedBusinessId, setSelectedBusinessId] = useState<string | "all">("all");
    const [businesses, setBusinesses] = useState<BusinessOption[]>([]);

    const [isLoadingReviews, setIsLoadingReviews] = useState(true);
    const [isLoadingScans, setIsLoadingScans] = useState(true);

    const isLoading = isLoadingReviews || isLoadingScans;

    // 🔹 Caricamento dati reviews + scans
    useEffect(() => {
        async function init() {
            if (!user?.id) return;

            setIsLoadingReviews(true);
            setIsLoadingScans(true);

            // 1. Carico i ristoranti
            const userBusinesses = await getUserBusinesses(user.id);
            setBusinesses(userBusinesses);

            // 2. Imposto default ristorante
            const defaultId = userBusinesses[0]?.id ?? "all";
            setSelectedBusinessId(defaultId);

            // 3. Carico reviews
            const revs = await getAnalyticsReviews();
            setReviews(revs);

            // 4. Carico scansioni QR
            const scans = await getAnalyticsQrScans();
            setQrScans(scans);

            setIsLoadingReviews(false);
            setIsLoadingScans(false);
        }

        void init();
    }, [user?.id]);

    // 🔹 Opzioni ristoranti derivate dai dati (non serve chiamata extra)
    const restaurantOptions = useMemo<BusinessOption[]>(() => {
        const map = new Map<string, BusinessOption>();

        reviews.forEach(r => {
            const id = r.business_id;
            if (!id) return;

            if (!map.has(id)) {
                map.set(id, {
                    id,
                    name: r.restaurant_name || "Business senza nome"
                });
            }
        });

        return Array.from(map.values());
    }, [reviews]);

    // Se non ho ancora una scelta e ci sono ristoranti, imposto il primo
    useEffect(() => {
        if (selectedBusinessId === "all" && restaurantOptions.length === 1) {
            setSelectedBusinessId(restaurantOptions[0].id);
        }
    }, [restaurantOptions, selectedBusinessId]);

    // 🔹 Cutoff temporale
    const cutoff = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() - range);
        return d;
    }, [range]);

    // 🔹 Filtri applicati
    const filteredReviews = useMemo(() => {
        return reviews.filter(r => {
            const created = new Date(r.created_at);
            if (created < cutoff) return false;

            if (selectedBusinessId !== "all") {
                return r.business_id === selectedBusinessId;
            }

            return selectedBusinessId === "all" || !r.business_id;
        });
    }, [reviews, cutoff, selectedBusinessId]);

    const filteredScans = useMemo(() => {
        return qrScans.filter(s => {
            const created = new Date(s.created_at);
            if (created < cutoff) return false;

            if (selectedBusinessId !== "all" && s.business_id) {
                return s.business_id === selectedBusinessId;
            }

            return selectedBusinessId === "all" || !s.business_id;
        });
    }, [qrScans, cutoff, selectedBusinessId]);

    // 🔹 KPI recensioni
    const totalReviews = filteredReviews.length;
    const avgRating = totalReviews
        ? filteredReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
        : 0;

    const positiveReviews = filteredReviews.filter(r => r.rating >= 4).length;
    const negativeReviews = filteredReviews.filter(r => r.rating <= 3).length;

    const positiveRatio = totalReviews ? (positiveReviews / totalReviews) * 100 : 0;

    // 🔹 KPI scansioni
    const totalQrScans = filteredScans.length;

    // 🔹 Distribuzione punteggio
    const ratingDist = [1, 2, 3, 4, 5].map(stars => ({
        name: `${stars} ★`,
        value: filteredReviews.filter(r => r.rating === stars).length
    }));

    // 🔹 Distribuzione fonte
    const sourceDist = ["google", "public"].map(src => ({
        name: src === "google" ? "Google" : "Interna",
        value: filteredReviews.filter(r => r.source === src).length
    }));

    // 🔹 Andamento recensioni per giorno
    const reviewsTrend = useMemo(() => {
        const map = new Map<string, number>();

        filteredReviews.forEach(r => {
            const date = new Date(r.created_at).toLocaleDateString("it-IT", {
                day: "2-digit",
                month: "2-digit"
            });
            map.set(date, (map.get(date) || 0) + 1);
        });

        return Array.from(map.entries())
            .sort(([a], [b]) => {
                const [da, ma] = a.split("/");
                const [db, mb] = b.split("/");
                const dateA = new Date(new Date().getFullYear(), Number(ma) - 1, Number(da));
                const dateB = new Date(new Date().getFullYear(), Number(mb) - 1, Number(db));
                return dateA.getTime() - dateB.getTime();
            })
            .map(([date, count]) => ({
                name: date,
                recensioni: count
            }));
    }, [filteredReviews]);

    // 🔹 Andamento scansioni QR per giorno
    const qrScansTrend = useMemo(() => {
        const map = new Map<string, number>();

        filteredScans.forEach(s => {
            const date = new Date(s.created_at).toLocaleDateString("it-IT", {
                day: "2-digit",
                month: "2-digit"
            });
            map.set(date, (map.get(date) || 0) + 1);
        });

        return Array.from(map.entries())
            .sort(([a], [b]) => {
                const [da, ma] = a.split("/");
                const [db, mb] = b.split("/");
                const dateA = new Date(new Date().getFullYear(), Number(ma) - 1, Number(da));
                const dateB = new Date(new Date().getFullYear(), Number(mb) - 1, Number(db));
                return dateA.getTime() - dateB.getTime();
            })
            .map(([date, count]) => ({
                name: date,
                scansioni: count
            }));
    }, [filteredScans]);

    // 🔹 Skeleton realistici con nuovo layout
    if (isLoading) {
        return (
            <div className={styles.analytics} aria-busy="true" aria-live="polite">
                <div className={styles.header}>
                    <div className={styles.filtersRow}>
                        <Skeleton height="40px" radius="999px" />
                        <Skeleton height="40px" radius="999px" />
                    </div>
                </div>

                <div className={styles.kpiGrid} aria-busy="true" aria-live="polite">
                    {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} height="90px" radius="12px" />
                    ))}
                </div>

                <div className={styles.chartsGrid}>
                    {[...Array(4)].map((_, i) => (
                        <Skeleton key={i} height="340px" radius="16px" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <main className={styles.analytics} aria-label="Sezione analytics recensioni e scansioni QR">
            <header className={styles.header}>
                <div className={styles.filtersRow}>
                    <div className={styles.businessSelector}>
                        <Select
                            label="Attività"
                            value={selectedBusinessId}
                            onChange={e => setSelectedBusinessId(e.target.value)}
                            options={[
                                { value: "", label: "Seleziona una categoria" },
                                ...businesses.map(b => ({
                                    value: b.id,
                                    label: b.name
                                }))
                            ]}
                        />
                    </div>

                    <SegmentedControl<Range>
                        value={range}
                        onChange={setRange}
                        options={[
                            { value: 7, label: "7 giorni" },
                            { value: 30, label: "30 giorni" },
                            { value: 90, label: "90 giorni" }
                        ]}
                    />
                </div>
            </header>

            {/* KPI */}
            <section className={styles.kpiGrid} role="group" aria-label="Statistiche principali">
                <KPI label="Recensioni totali" value={totalReviews.toString()} />
                <KPI label="Valutazione media" value={avgRating.toFixed(1)} highlight />
                <KPI
                    label="Recensioni positive"
                    value={`${positiveReviews} (${positiveRatio.toFixed(0)}%)`}
                    color="success"
                />
                <KPI label="Recensioni negative" value={negativeReviews.toString()} color="error" />
                <KPI
                    label="Scansioni QR"
                    value={totalQrScans.toString()}
                    // badge={
                    //     selectedBusinessId === "all" ? "Somma totale" : "Business selezionato"
                    // }
                />
            </section>

            {/* GRAFICI */}
            <section className={styles.chartsGrid} aria-label="Grafici di distribuzione e trend">
                <ChartCard title="Distribuzione per punteggio">
                    <ResponsiveContainer width="100%" height={320}>
                        <PieChart>
                            <Pie
                                data={ratingDist}
                                dataKey="value"
                                nameKey="name"
                                innerRadius={70}
                                outerRadius={110}
                                label={({ name, percent }) =>
                                    `${name} (${(Number(percent) * 100).toFixed(0)}%)`
                                }
                                paddingAngle={2}
                            >
                                {ratingDist.map((_, i) => (
                                    <Cell key={i} fill={COLORS[i]} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Distribuzione per fonte">
                    <ResponsiveContainer width="100%" height={320}>
                        <PieChart>
                            <Pie
                                data={sourceDist}
                                dataKey="value"
                                nameKey="name"
                                outerRadius={110}
                                label={({ name, percent }) =>
                                    `${name} (${(Number(percent) * 100 || 0).toFixed(0)}%)`
                                }
                                paddingAngle={4}
                            >
                                <Cell fill="#2563eb" />
                                <Cell fill="#10b981" />
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Andamento recensioni nel periodo" wide>
                    <ResponsiveContainer width="100%" height={360}>
                        <LineChart data={reviewsTrend}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis allowDecimals={false} />
                            <Tooltip />
                            <Line
                                type="monotone"
                                dataKey="recensioni"
                                stroke="#3b82f6"
                                strokeWidth={2}
                                dot={{ r: 3 }}
                                activeDot={{ r: 5 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Andamento scansioni QR nel periodo" wide>
                    <ResponsiveContainer width="100%" height={360}>
                        <BarChart data={qrScansTrend}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis allowDecimals={false} />
                            <Tooltip />
                            <Bar
                                dataKey="scansioni"
                                fill="#22c55e"
                                radius={[6, 6, 0, 0]}
                                maxBarSize={40}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>
            </section>
        </main>
    );
}

// 🔸 COMPONENTI DI SUPPORTO
function KPI({
    label,
    value,
    color,
    highlight = false,
    badge
}: {
    label: string;
    value: string;
    color?: "success" | "error";
    highlight?: boolean;
    badge?: string;
}) {
    const colorClass = color === "success" ? styles.success : color === "error" ? styles.error : "";

    return (
        <div className={`${styles.kpiCard} ${colorClass}`} role="group">
            <div className={styles.kpiHeader}>
                <Text variant="caption" colorVariant="muted">
                    {label}
                </Text>
                {badge && (
                    <span className={styles.kpiBadge}>
                        <Text as="span" variant="caption" colorVariant="muted">
                            {badge}
                        </Text>
                    </span>
                )}
            </div>
            <Text
                variant={highlight ? "title-lg" : "title-md"}
                weight={600}
                colorVariant={
                    color === "success" ? "success" : color === "error" ? "error" : "default"
                }
            >
                {value}
            </Text>
        </div>
    );
}

function ChartCard({
    title,
    children,
    wide
}: {
    title: string;
    children: React.ReactNode;
    wide?: boolean;
}) {
    return (
        <article
            className={`${styles.chartCard} ${wide ? styles.chartCardWide : ""}`}
            aria-label={title}
        >
            <header className={styles.chartCardHeader}>
                <Text variant="title-sm" align="left">
                    {title}
                </Text>
            </header>
            <div className={styles.chartCardBody}>{children}</div>
        </article>
    );
}
