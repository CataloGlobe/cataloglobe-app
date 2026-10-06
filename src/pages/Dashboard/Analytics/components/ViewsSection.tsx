import { BarList } from "@/components/ui/BarList/BarList";
import { Card } from "@/components/ui/Card/Card";
import Text from "@/components/ui/Text/Text";
import { TrendChart } from "@/components/ui/TrendChart/TrendChart";
import type {
    DeviceData,
    FeaturedPerformanceData,
    FunnelStep,
    HourlyData,
    OverviewStats,
    SocialClickData,
    TopProduct,
    TrendDataPoint
} from "@/services/supabase/analytics";
import { fillDaily, fillHourly, formatHour } from "../utils/analyticsSeries";
import { isBelowSample, type DateRange, type PeriodKey } from "../utils/periodComparison";
import styles from "../Analytics.module.scss";

type Props = {
    stats: OverviewStats | null;
    pageViewsTrend: TrendDataPoint[];
    topViewed: TopProduct[];
    topSelected: TopProduct[];
    hourly: HourlyData[];
    devices: DeviceData[];
    funnel: FunnelStep[];
    featured: FeaturedPerformanceData[];
    social: SocialClickData[];
    dateRange: DateRange;
    period: PeriodKey;
    isLoading: boolean;
};

const nf = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });
const df = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" });

const DEVICE_LABEL: Record<string, string> = { mobile: "Telefono", desktop: "Computer", tablet: "Tablet" };
const SLOT_LABEL: Record<string, string> = { before_catalog: "Prima del menù", after_catalog: "Dopo il menù" };
const SOCIAL_LABEL: Record<string, string> = {
    instagram: "Instagram",
    whatsapp: "WhatsApp",
    phone: "Telefono",
    facebook: "Facebook",
    email: "Email",
    website: "Sito web"
};

/**
 * «Cosa guardano» (§36.2/4): la serie delle visite e i prodotti aperti, poi i
 * blocchi che il mockup non disegna ma che non si perdono (A2): tutti sotto la
 * stessa soglia dei 100 — sotto, conteggi e niente percentuali (§36.1/3).
 */
export default function ViewsSection({
    stats,
    pageViewsTrend,
    topViewed,
    topSelected,
    hourly,
    devices,
    funnel,
    featured,
    social,
    dateRange,
    period,
    isLoading
}: Props) {
    const visits = stats?.total_views ?? 0;
    const small = isBelowSample(visits);
    const openings = topViewed.reduce((sum, p) => sum + p.count, 0);
    const withPct = (count: number, pct: number) => (small ? nf.format(count) : `${nf.format(count)} · ${nf.format(pct)}%`);

    return (
        <section className={styles.section} aria-label="Cosa guardano">
            <Card title="Cosa guardano" subtitle={`${df.format(dateRange.from)} – ${df.format(dateRange.to)}`}>
                <div className={styles.cardStack}>
                    <TrendChart
                        aria-label="Visite nel tempo"
                        data={fillDaily(pageViewsTrend.map(p => ({ date: p.date, value: p.count })), dateRange, period)}
                        loading={isLoading}
                        emptyTitle="Nessuna visita nel periodo"
                    />
                    <div className={styles.cardStack}>
                        <Text as="h3" variant="body-sm" weight={600}>
                            Prodotti più aperti
                        </Text>
                        {openings > 0 && (
                            <Text as="p" variant="caption" colorVariant="muted">
                                {openings} {openings === 1 ? "apertura" : "aperture"} in tutto: sono nomi, non una classifica.
                            </Text>
                        )}
                        <BarList
                            aria-label="Prodotti più aperti"
                            loading={isLoading}
                            limit={5}
                            emptyTitle="Nessun prodotto aperto nel periodo"
                            items={topViewed.map(p => ({ id: p.product_name, label: p.product_name, value: p.count }))}
                        />
                    </div>
                </div>
            </Card>

            <div className={styles.grid}>
                <Card title="Dalla visita alla selezione">
                    <BarList
                        aria-label="Dalla visita alla selezione"
                        loading={isLoading}
                        emptyTitle="Nessuna visita nel periodo"
                        items={funnel.map(step => ({
                            id: step.step_name,
                            label: step.step_label,
                            value: step.session_count,
                            valueLabel: withPct(step.session_count, step.percentage)
                        }))}
                    />
                </Card>
                <Card title="Prodotti più selezionati">
                    <BarList
                        aria-label="Prodotti più selezionati"
                        loading={isLoading}
                        limit={5}
                        emptyTitle="Nessun prodotto aggiunto alla selezione"
                        items={topSelected.map(p => ({ id: p.product_name, label: p.product_name, value: p.count }))}
                    />
                </Card>
                <Card title="Fasce orarie delle visite">
                    <TrendChart
                        aria-label="Visite per fascia oraria"
                        variant="bars"
                        data={fillHourly(hourly.map(h => ({ hour: h.hour, value: h.view_count })))}
                        formatDate={formatHour}
                        loading={isLoading}
                        emptyTitle="Nessuna visita nel periodo"
                    />
                </Card>
                <Card title="Dispositivi">
                    <BarList
                        aria-label="Dispositivi"
                        loading={isLoading}
                        emptyTitle="Nessuna visita nel periodo"
                        items={devices.map(d => ({
                            id: d.device_type,
                            label: DEVICE_LABEL[d.device_type] ?? d.device_type,
                            value: d.device_count,
                            valueLabel: withPct(d.device_count, d.percentage)
                        }))}
                    />
                </Card>
                <Card title="Contenuti in evidenza">
                    <BarList
                        aria-label="Clic sui contenuti in evidenza"
                        loading={isLoading}
                        emptyTitle="Nessun clic sui contenuti in evidenza"
                        emptyDescription="Il conteggio funziona: nessuno ha toccato un contenuto in evidenza nel periodo."
                        items={featured.map((f, i) => ({
                            id: `${f.title}-${i}`,
                            label: (
                                <span className={styles.labelStack}>
                                    <span>{f.title}</span>
                                    <Text as="span" variant="caption" colorVariant="muted">
                                        {SLOT_LABEL[f.slot] ?? f.slot}
                                    </Text>
                                </span>
                            ),
                            value: f.click_count
                        }))}
                    />
                </Card>
                <Card title="Clic sui contatti e sui social">
                    <BarList
                        aria-label="Clic sui social"
                        loading={isLoading}
                        emptyTitle="Nessun clic sui social nel periodo"
                        emptyDescription="Il conteggio funziona, nessuno ha toccato quei link: verifica che siano compilati nell'Anagrafica delle sedi."
                        items={social.map(s => ({
                            id: s.social_type,
                            label: SOCIAL_LABEL[s.social_type] ?? s.social_type,
                            value: s.click_count
                        }))}
                    />
                </Card>
            </div>
        </section>
    );
}
