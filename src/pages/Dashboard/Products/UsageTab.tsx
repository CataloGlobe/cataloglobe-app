import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    type ProductCategoryAssignment,
    getProductCategoryAssignments
} from "@/services/supabase/productUsage";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
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

/**
 * Tab «Utilizzo» (lotto Prodotti P9): dove sta il prodotto. Tre `Card flush`
 * di `ListRow` coi conteggi nel `badge` — {Menù} (menù › categoria, «Apri il
 * menù»), Regole, Sedi — più «Gruppi» (§50.9/3). La card «Riepilogo» esce: i
 * suoi numeri sono i badge. Le sedi restano anche se il mockup non le mostra
 * (registro 10b, «invariata»).
 */
export function UsageTab({ productId, tenantId, usageData, usageLoading }: UsageTabProps) {
    const { businessId } = useParams<{ businessId: string }>();
    const navigate = useNavigate();
    const verticalConfig = useVerticalConfig();
    const menuLower = verticalConfig.catalogLabel.toLowerCase();
    const productLower = verticalConfig.productLabel.toLowerCase();

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

    const data = usageData ?? { catalogs: [], schedules: [], activities: [] };
    const loadingUsage = usageLoading || loadingAssignments;
    const count = (n: number) => (n > 0 ? <Badge variant="secondary">{n}</Badge> : undefined);
    const loadingRow = <ListRow loading />;

    return (
        <div className={styles.grid}>
            <Card title={verticalConfig.catalogLabelPlural} badge={count(categoryAssignments.length)} flush>
                {loadingUsage ? (
                    loadingRow
                ) : categoryAssignments.length === 0 ? (
                    <Text variant="body-sm" colorVariant="muted" className={styles.empty}>
                        Il {productLower} non è in nessun {menuLower}.
                    </Text>
                ) : (
                    <div role="list">
                        {categoryAssignments.map(a => (
                            <div role="listitem" key={`${a.catalog.id}-${a.category.id}`}>
                                <ListRow
                                    title={a.catalog.name}
                                    subtitle={`${verticalConfig.categoryLabel} «${a.category.name}»`}
                                    trailing={
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() =>
                                                navigate(`/business/${businessId}/catalogs/${a.catalog.id}?highlightProduct=${productId}`)
                                            }
                                        >
                                            Apri il {menuLower}
                                        </Button>
                                    }
                                />
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            <Card title="Regole che lo toccano" badge={count(data.schedules.length)} flush>
                {loadingUsage ? (
                    loadingRow
                ) : data.schedules.length === 0 ? (
                    <Text variant="body-sm" colorVariant="muted" className={styles.empty}>
                        Nessuna regola di programmazione nomina questo {productLower}.
                    </Text>
                ) : (
                    <div role="list">
                        {data.schedules.map(schedule => (
                            <div role="listitem" key={schedule.id}>
                                <ListRow title={schedule.name} to={`/business/${businessId}/scheduling/${schedule.id}`} />
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            <Card title="Sedi" badge={count(data.activities.length)} flush>
                {loadingUsage ? (
                    loadingRow
                ) : data.activities.length === 0 ? (
                    <Text variant="body-sm" colorVariant="muted" className={styles.empty}>
                        Nessuna regola lo porta oggi in una sede.
                    </Text>
                ) : (
                    <div role="list">
                        {data.activities.map(activity => (
                            <div role="listitem" key={activity.id}>
                                <ListRow title={activity.name} to={`/business/${businessId}/locations/${activity.id}`} />
                            </div>
                        ))}
                    </div>
                )}
            </Card>

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
