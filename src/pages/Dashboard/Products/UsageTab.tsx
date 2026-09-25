import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { IconChevronRight } from "@tabler/icons-react";
import {
    type ProductCategoryAssignment,
    getProductCategoryAssignments
} from "@/services/supabase/productUsage";
import { SectionCard } from "@/components/ui/SectionCard/SectionCard";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { Card } from "@/components/ui/Card/Card";
import { Chip } from "@/components/ui/Chip/Chip";
import { Badge } from "@/components/ui/Badge/Badge";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import {
    type ProductGroup,
    getProductGroups,
    getProductGroupAssignments
} from "@/services/supabase/productGroups";
import { ProductGroupsEditDrawer } from "./ProductGroupsEditDrawer";
import styles from "./UsageTab.module.scss";

interface UsageItem {
    id: string;
    name: string;
}

interface UsageData {
    catalogs: UsageItem[];
    schedules: UsageItem[];
    activities: UsageItem[];
}

interface UsageTabProps {
    productId: string;
    tenantId: string;
    usageData: UsageData | null;
    usageLoading: boolean;
}

export function UsageTab({ productId, tenantId, usageData, usageLoading }: UsageTabProps) {
    const { businessId } = useParams<{ businessId: string }>();

    const [categoryAssignments, setCategoryAssignments] = useState<
        ProductCategoryAssignment[]
    >([]);
    const [loadingAssignments, setLoadingAssignments] = useState(true);

    // ── Gruppi del prodotto (§50.9/3): erano nella Scheda, ma salvano subito;
    // qui, fra le cose che dicono dove sta il prodotto.
    const { showToast } = useToast();
    const [allGroups, setAllGroups] = useState<ProductGroup[]>([]);
    const [assignedGroupIds, setAssignedGroupIds] = useState<Set<string>>(new Set());
    const [groupsLoading, setGroupsLoading] = useState(true);
    const [isGroupsDrawerOpen, setIsGroupsDrawerOpen] = useState(false);

    const loadGroups = useCallback(async () => {
        try {
            setGroupsLoading(true);
            const [groups, assignments] = await Promise.all([
                getProductGroups(tenantId),
                getProductGroupAssignments(productId)
            ]);
            setAllGroups(groups);
            setAssignedGroupIds(new Set(assignments.map(a => a.group_id)));
        } catch {
            showToast({ message: "Errore nel caricamento dei gruppi", type: "error" });
        } finally {
            setGroupsLoading(false);
        }
    }, [tenantId, productId, showToast]);

    useEffect(() => {
        loadGroups();
    }, [loadGroups]);

    const assignedGroups = allGroups.filter(g => assignedGroupIds.has(g.id));

    useEffect(() => {
        if (!productId || !tenantId) return;
        let cancelled = false;
        setLoadingAssignments(true);
        getProductCategoryAssignments(productId, tenantId)
            .then(data => {
                if (!cancelled) setCategoryAssignments(data);
            })
            .catch(() => {
                if (!cancelled) setCategoryAssignments([]);
            })
            .finally(() => {
                if (!cancelled) setLoadingAssignments(false);
            });
        return () => {
            cancelled = true;
        };
    }, [productId, tenantId]);

    if (usageLoading || loadingAssignments) {
        return (
            <div className={styles.grid}>
                <div className={styles.loading}>Caricamento utilizzo prodotto...</div>
            </div>
        );
    }

    const data = usageData ?? { catalogs: [], schedules: [], activities: [] };
    const counts = {
        activities: data.activities.length,
        catalogs: data.catalogs.length,
        schedules: data.schedules.length
    };

    return (
        <div className={styles.grid}>
            {/* ──────────────── Card 1 — Riepilogo utilizzo ──────────────── */}
            <SectionCard
                title="Riepilogo utilizzo"
                subtitle="Visualizza dove questo prodotto è utilizzato nella piattaforma."
            >
                <div className={styles.summaryStats}>
                    <span className={styles.summaryBadge}>
                        <span className={styles.summaryBadgeNumber}>{counts.activities}</span>
                        attività
                    </span>
                    <span className={styles.summaryBadge}>
                        <span className={styles.summaryBadgeNumber}>{counts.catalogs}</span>
                        {counts.catalogs === 1 ? "catalogo" : "cataloghi"}
                    </span>
                    <span className={styles.summaryBadge}>
                        <span className={styles.summaryBadgeNumber}>{counts.schedules}</span>
                        {counts.schedules === 1 ? "regola" : "regole"}
                    </span>
                </div>
                <div className={styles.microcopy}>
                    Per gestire i cataloghi vai a{" "}
                    <Link to={`/business/${businessId}/catalogs`}>Cataloghi</Link>. Per
                    modificare le regole di programmazione vai a{" "}
                    <Link to={`/business/${businessId}/scheduling`}>Programmazione</Link>.
                </div>
            </SectionCard>

            {/* ──────────────── Card 2 — Cataloghi (con breadcrumb categoria) ──────────────── */}
            <SectionCard title="Cataloghi">
                {categoryAssignments.length === 0 ? (
                    <EmptyState
                        variant="inline"
                        icon={null}
                        title="Questo prodotto non è incluso in nessun catalogo."
                    />
                ) : (
                    <ul className={styles.list}>
                        {categoryAssignments.map(a => (
                            <li
                                key={`${a.catalog.id}-${a.category.id}`}
                                className={styles.listItem}
                            >
                                <Link
                                    to={`/business/${businessId}/catalogs/${a.catalog.id}?highlightProduct=${productId}`}
                                    className={styles.link}
                                >
                                    <span className={styles.breadcrumb}>
                                        <span className={styles.breadcrumbCatalog}>
                                            {a.catalog.name}
                                        </span>
                                        <span className={styles.breadcrumbSeparator}>›</span>
                                        <span className={styles.breadcrumbCategory}>
                                            {a.category.name}
                                        </span>
                                    </span>
                                    <IconChevronRight className={styles.chevron} size={16} />
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </SectionCard>

            {/* ──────────────── Card 3 — Programmazione ──────────────── */}
            <SectionCard title="Programmazione">
                {data.schedules.length === 0 ? (
                    <EmptyState
                        variant="inline"
                        icon={null}
                        title="Nessuna regola di programmazione coinvolge questo prodotto."
                    />
                ) : (
                    <ul className={styles.list}>
                        {data.schedules.map(schedule => (
                            <li key={schedule.id} className={styles.listItem}>
                                <Link
                                    to={`/business/${businessId}/scheduling/${schedule.id}`}
                                    className={styles.link}
                                >
                                    <span>{schedule.name}</span>
                                    <IconChevronRight
                                        className={styles.chevron}
                                        size={16}
                                    />
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </SectionCard>

            {/* ──────────────── Gruppi (§50.9/3, salvataggio immediato) ──────────────── */}
            <Card
                title="Gruppi"
                badge={assignedGroups.length > 0 ? <Badge variant="secondary">{assignedGroups.length}</Badge> : undefined}
                actions={
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setIsGroupsDrawerOpen(true)}
                        disabled={groupsLoading}
                    >
                        {assignedGroups.length > 0 ? "Modifica" : "Aggiungi"}
                    </Button>
                }
            >
                {groupsLoading ? (
                    <Text variant="body-sm" colorVariant="muted">
                        Caricamento gruppi...
                    </Text>
                ) : assignedGroups.length === 0 ? (
                    <Text variant="body-sm" colorVariant="muted">
                        {allGroups.length === 0 ? "L'azienda non ha ancora gruppi." : "In nessun gruppo."}
                    </Text>
                ) : (
                    <div className={styles.chips}>
                        {assignedGroups.map(g => (
                            <Chip key={g.id} label={g.name} />
                        ))}
                    </div>
                )}
            </Card>

            {/* ──────────────── Card 4 — Attività coinvolte ──────────────── */}
            <SectionCard title="Attività coinvolte">
                {data.activities.length === 0 ? (
                    <EmptyState
                        variant="inline"
                        icon={null}
                        title="Questo prodotto non è attualmente visibile in nessuna attività."
                    />
                ) : (
                    <ul className={styles.list}>
                        {data.activities.map(activity => (
                            <li key={activity.id} className={styles.listItem}>
                                <Link
                                    to={`/business/${businessId}/locations/${activity.id}`}
                                    className={styles.link}
                                >
                                    <span>{activity.name}</span>
                                    <IconChevronRight
                                        className={styles.chevron}
                                        size={16}
                                    />
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </SectionCard>

            <ProductGroupsEditDrawer
                open={isGroupsDrawerOpen}
                onClose={() => setIsGroupsDrawerOpen(false)}
                productId={productId}
                tenantId={tenantId}
                onSuccess={async () => {
                    await loadGroups();
                    setIsGroupsDrawerOpen(false);
                }}
            />
        </div>
    );
}
