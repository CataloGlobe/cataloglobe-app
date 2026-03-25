import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, AlertCircle, Plus, ChevronRight } from "lucide-react";
import { useTenant } from "@/context/useTenant";
import { useTenantId } from "@/context/useTenantId";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { supabase } from "@/services/supabase/client";
import Text from "@/components/ui/Text/Text";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { Badge } from "@/components/ui/Badge/Badge";
import { getTenantLogoPublicUrl } from "@/services/supabase/tenants";
import styles from "./OverviewPage.module.scss";

const VERTICAL_LABELS: Record<string, string> = {
    restaurant: "Ristorante",
    bar: "Bar",
    retail: "Negozio",
    hotel: "Hotel",
    generic: "Generico"
};

const AVATAR_PALETTE = [
    { bg: "#ede9fe", text: "#7c3aed" },
    { bg: "#dbeafe", text: "#1d4ed8" },
    { bg: "#d1fae5", text: "#065f46" },
    { bg: "#fef3c7", text: "#b45309" },
    { bg: "#fce7f3", text: "#be185d" },
    { bg: "#e0f2fe", text: "#0369a1" }
];

function avatarColors(name: string) {
    return AVATAR_PALETTE[name.charCodeAt(0) % AVATAR_PALETTE.length];
}

interface Stats {
    locations: number;
    products: number;
    catalogs: number;
    featuredContents: number;
    schedules: number;
}

export default function OverviewPage() {
    const { selectedTenant, loading: tenantLoading } = useTenant();
    const tenantId = useTenantId();
    const navigate = useNavigate();

    const [stats, setStats] = useState<Stats | null>(null);
    const [loadingStats, setLoadingStats] = useState(true);

    useEffect(() => {
        if (!tenantId) return;

        async function loadStats() {
            setLoadingStats(true);
            const [locations, products, catalogs, featuredContents, schedules] = await Promise.all([
                supabase.from("activities").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!),
                supabase.from("products").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!),
                supabase.from("catalogs").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!),
                supabase.from("featured_contents").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!),
                supabase.from("schedules").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!)
            ]);
            setStats({
                locations: locations.count ?? 0,
                products: products.count ?? 0,
                catalogs: catalogs.count ?? 0,
                featuredContents: featuredContents.count ?? 0,
                schedules: schedules.count ?? 0
            });
            setLoadingStats(false);
        }

        loadStats();
    }, [tenantId]);

    if (tenantLoading || !selectedTenant) {
        return (
            <div className={styles.page}>
                <Skeleton height="80px" radius="12px" />
                <Skeleton height="160px" radius="12px" />
                <div className={styles.kpiGrid}>
                    {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} height="88px" radius="10px" />
                    ))}
                </div>
            </div>
        );
    }

    const b = `/business/${tenantId}`;
    const verticalLabel = VERTICAL_LABELS[selectedTenant.vertical_type] ?? selectedTenant.vertical_type;
    const { bg, text } = avatarColors(selectedTenant.name);
    const initial = selectedTenant.name.charAt(0).toUpperCase();

    const configItems = [
        {
            label: (stats?.locations ?? 0) > 0 ? "Sedi create" : "Nessuna sede creata",
            ok: (stats?.locations ?? 0) > 0,
            to: `${b}/locations`
        },
        {
            label: (stats?.products ?? 0) > 0 ? "Prodotti aggiunti" : "Nessun prodotto aggiunto",
            ok: (stats?.products ?? 0) > 0,
            to: `${b}/products`
        },
        {
            label: (stats?.catalogs ?? 0) > 0 ? "Catalogo creato" : "Nessun catalogo creato",
            ok: (stats?.catalogs ?? 0) > 0,
            to: `${b}/catalogs`
        },
        {
            label: (stats?.schedules ?? 0) > 0 ? "Programmazione configurata" : "Programmazione non configurata",
            ok: (stats?.schedules ?? 0) > 0,
            to: `${b}/scheduling`
        }
    ];

    const quickActions = [
        { label: "Nuovo prodotto", to: `${b}/products` },
        { label: "Nuovo catalogo", to: `${b}/catalogs` },
        { label: "Nuova programmazione", to: `${b}/scheduling` },
        { label: "Nuovo contenuto in evidenza", to: `${b}/featured` }
    ];

    return (
        <div className={styles.page}>
            <PageHeader title="Panoramica" businessName={selectedTenant.name} />

            {/* ===== Section 1 — Business Header ===== */}
            <div className={styles.section}>
                <div className={styles.businessHeader}>
                    {selectedTenant.logo_url ? (
                        <img
                            src={getTenantLogoPublicUrl(selectedTenant.logo_url)}
                            alt={`Logo ${selectedTenant.name}`}
                            className={styles.businessAvatarImg}
                        />
                    ) : (
                        <div className={styles.businessAvatar} style={{ background: bg, color: text }}>
                            {initial}
                        </div>
                    )}
                    <div className={styles.businessInfo}>
                        <Text variant="title-md" weight={700}>{selectedTenant.name}</Text>
                        <div style={{ marginTop: 6 }}>
                            <Badge variant="secondary">{verticalLabel}</Badge>
                        </div>
                        {!loadingStats && stats && (
                            <Text variant="body-sm" colorVariant="muted" style={{ marginTop: 8 }}>
                                {stats.locations} {stats.locations === 1 ? "sede" : "sedi"}&nbsp;&bull;&nbsp;
                                {stats.products} prodotti&nbsp;&bull;&nbsp;
                                {stats.catalogs} {stats.catalogs === 1 ? "catalogo" : "cataloghi"}
                            </Text>
                        )}
                    </div>
                </div>
            </div>

            {/* ===== Section 2 — Configuration Status ===== */}
            <div className={styles.section}>
                <Text variant="title-sm" weight={600}>Configurazione</Text>
                <div className={styles.configList}>
                    {loadingStats
                        ? [...Array(4)].map((_, i) => <Skeleton key={i} height="44px" radius="8px" />)
                        : configItems.map((item, i) => (
                            <button
                                key={i}
                                className={styles.configItem}
                                onClick={() => navigate(item.to)}
                            >
                                <span className={[
                                    styles.configIcon,
                                    item.ok ? styles.configOk : styles.configWarn
                                ].join(" ")}>
                                    {item.ok
                                        ? <CheckCircle2 size={16} />
                                        : <AlertCircle size={16} />
                                    }
                                </span>
                                <Text variant="body-sm" weight={500}>{item.label}</Text>
                                <ChevronRight size={14} className={styles.configArrow} />
                            </button>
                        ))
                    }
                </div>
            </div>

            {/* ===== Section 3 — Quick Stats ===== */}
            <div className={styles.section}>
                <Text variant="title-sm" weight={600}>Statistiche rapide</Text>
                <div className={styles.kpiGrid}>
                    <StatCard label="Sedi" value={stats?.locations} loading={loadingStats} />
                    <StatCard label="Prodotti" value={stats?.products} loading={loadingStats} />
                    <StatCard label="Cataloghi" value={stats?.catalogs} loading={loadingStats} />
                    <StatCard label="Programmi" value={stats?.schedules} loading={loadingStats} />
                    <StatCard label="Contenuti in evidenza" value={stats?.featuredContents} loading={loadingStats} />
                </div>
            </div>

            {/* ===== Section 4 — Quick Actions ===== */}
            <div className={styles.section}>
                <Text variant="title-sm" weight={600}>Azioni rapide</Text>
                <div className={styles.actionsGrid}>
                    {quickActions.map((action, i) => (
                        <button
                            key={i}
                            className={styles.actionBtn}
                            onClick={() => navigate(action.to)}
                        >
                            <Plus size={14} />
                            {action.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

function StatCard({
    label,
    value,
    loading
}: {
    label: string;
    value: number | undefined;
    loading: boolean;
}) {
    return (
        <div className={styles.kpiCard}>
            <Text variant="caption" colorVariant="muted">{label}</Text>
            {loading
                ? <Skeleton height="28px" width="40px" radius="6px" />
                : <Text variant="title-md" weight={600}>{value ?? 0}</Text>
            }
        </div>
    );
}
