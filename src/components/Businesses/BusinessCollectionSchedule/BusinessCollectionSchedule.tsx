import { useEffect, useMemo, useRef, useState } from "react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import styles from "./BusinessCollectionSchedule.module.scss";

import {
    listBusinessSchedules,
    BusinessScheduleRow,
    createBusinessSchedule,
    updateBusinessSchedule,
    deleteBusinessSchedule
} from "@/services/supabase/schedules";

import { supabase } from "@/services/supabase/client";
import Tooltip from "@/components/ui/Tooltip/Tooltip";
import { Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { getActiveWinner, isNowActive } from "@/domain/schedules/scheduleUtils";
import { resolveBusinessCollections } from "@/services/supabase/resolveBusinessCollections";

import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutDrawer,
    ModalLayoutHeader
} from "@/components/ui/ModalLayout/ModalLayout";
import { IconButton } from "@/components/ui/Button/IconButton";
import { Badge } from "@/components/ui/Badge/Badge";
import { Drawer } from "@/components/ui/Drawer/Drawer";

import ScheduleRuleDrawer, { DraftRule, ScheduleRuleDrawerRef } from "./ScheduleRuleDrawer";
import ConfirmModal from "@/components/ui/ConfirmModal/ConfirmModal";

/* ============================
   Types
============================ */

type Props = {
    isOpen: boolean;
    businessId: string;
    onClose: () => void;
};

type CollectionOption = {
    id: string;
    name: string;
    kind: "standard" | "special";
};

type DrawerState =
    | { type: "closed" }
    | { type: "add"; slot: "primary" | "overlay" }
    | { type: "edit"; rule: BusinessScheduleRow };

/* ============================
   Helpers UI
============================ */

const DAY_FULL = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
const DAY_UI_ORDER = [1, 2, 3, 4, 5, 6, 0];

function formatDays(days: number[]) {
    if (days.length === 7) return "Tutti i giorni";
    return DAY_UI_ORDER.filter(d => days.includes(d))
        .map(d => DAY_FULL[d])
        .join(", ");
}

function formatTimeRange(start: string, end: string) {
    return `${start.slice(0, 5)}–${end.slice(0, 5)}`;
}

function sortByActiveNow<T extends BusinessScheduleRow>(
    rules: T[],
    isActive: (r: T) => boolean
): T[] {
    return [...rules].sort((a, b) => {
        const aActive = isActive(a);
        const bActive = isActive(b);
        if (aActive === bActive) return 0;
        return aActive ? -1 : 1;
    });
}

/* ============================
   Component
============================ */

export default function BusinessCollectionSchedule({ isOpen, businessId, onClose }: Props) {
    const [loading, setLoading] = useState(false);
    const [schedules, setSchedules] = useState<BusinessScheduleRow[]>([]);
    const [collections, setCollections] = useState<CollectionOption[]>([]);
    const [drawer, setDrawer] = useState<DrawerState>({ type: "closed" });
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const [activeNow, setActiveNow] = useState<{
        primaryId: string | null;
        overlayId: string | null;
        isFallback: boolean;
    } | null>(null);

    /* ============================
       Drawer refs
    ============================ */

    const addDrawerRef = useRef<ScheduleRuleDrawerRef>(null);
    const editDrawerRef = useRef<ScheduleRuleDrawerRef>(null);

    /* ============================
       Derived data
    ============================ */

    const primaryRules = useMemo(() => {
        const rules = schedules.filter(s => s.slot === "primary");
        return sortByActiveNow(rules, isNowActive);
    }, [schedules]);

    const overlayRules = useMemo(() => {
        const rules = schedules.filter(s => s.slot === "overlay");
        return sortByActiveNow(rules, isNowActive);
    }, [schedules]);

    const primaryWinner = useMemo(() => getActiveWinner(primaryRules, isNowActive), [primaryRules]);

    const overlayWinner = useMemo(() => getActiveWinner(overlayRules, isNowActive), [overlayRules]);

    /* ============================
       Data loading
    ============================ */

    async function refresh() {
        const data = await listBusinessSchedules(businessId);
        setSchedules(data);
    }

    useEffect(() => {
        if (!isOpen) {
            setDrawer({ type: "closed" });
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        let cancelled = false;

        async function load() {
            try {
                setLoading(true);

                const [schedRes, collRes] = await Promise.all([
                    listBusinessSchedules(businessId),
                    supabase
                        .from("collections")
                        .select("id, name, kind")
                        .order("name", { ascending: true })
                ]);

                if (cancelled) return;

                setSchedules(schedRes);
                setCollections((collRes.data ?? []) as CollectionOption[]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [isOpen, businessId]);

    useEffect(() => {
        if (!isOpen) return;

        let cancelled = false;

        async function resolveNow() {
            try {
                const resolved = await resolveBusinessCollections(businessId, new Date());
                if (cancelled) return;

                const hasActivePrimaryRule = schedules.some(
                    s => s.slot === "primary" && isNowActive(s)
                );

                setActiveNow({
                    primaryId: resolved.primary,
                    overlayId: resolved.overlay,
                    isFallback: !!resolved.primary && !hasActivePrimaryRule
                });
            } catch {
                if (!cancelled) setActiveNow(null);
            }
        }

        resolveNow();
        return () => {
            cancelled = true;
        };
    }, [isOpen, businessId, schedules]);

    /* ============================
       Drawer actions
    ============================ */

    const closeDrawer = () => setDrawer({ type: "closed" });
    const openAddDrawer = (slot: "primary" | "overlay") => setDrawer({ type: "add", slot });
    const openEditDrawer = (rule: BusinessScheduleRow) => setDrawer({ type: "edit", rule });

    /* ============================
       CRUD handlers
    ============================ */

    const handleAddRule = async (slot: "primary" | "overlay", draft: DraftRule) => {
        if (!draft.collectionId) return;

        const start = draft.allDay ? "00:00" : draft.start;
        const end = draft.allDay ? "00:00" : draft.end;

        await createBusinessSchedule({
            businessId,
            collectionId: draft.collectionId,
            slot,
            days: draft.days,
            start,
            end
        });

        await refresh();
        closeDrawer();
    };

    const handleEditRule = async (rule: BusinessScheduleRow, draft: DraftRule) => {
        if (!draft.collectionId) return;

        const start = draft.allDay ? "00:00" : draft.start;
        const end = draft.allDay ? "00:00" : draft.end;

        await updateBusinessSchedule(rule.id, {
            collectionId: draft.collectionId,
            days: draft.days,
            start,
            end
        });

        await refresh();
        closeDrawer();
    };

    const confirmDelete = async () => {
        if (!deleteTargetId) return;

        try {
            setIsDeleting(true);
            await deleteBusinessSchedule(deleteTargetId);
            await refresh();
        } finally {
            setIsDeleting(false);
            setShowDeleteModal(false);
            setDeleteTargetId(null);
        }
    };

    /* ============================
       Render
    ============================ */

    return (
        <ModalLayout
            isOpen={isOpen}
            onClose={onClose}
            isDrawerOpen={drawer.type !== "closed"}
            onCloseDrawer={closeDrawer}
            width="md"
        >
            <ModalLayoutHeader>
                <div className={styles.headerLeft}>
                    <Text as="h2" variant="title-md" weight={700}>
                        Programmazione collezioni
                    </Text>
                    <Text variant="caption" colorVariant="muted">
                        Gestisci quando mostrare le collezioni
                    </Text>
                </div>

                <div className={styles.headerRight}>
                    <Button variant="secondary" onClick={onClose}>
                        Chiudi
                    </Button>
                </div>
            </ModalLayoutHeader>
            <ModalLayoutContent>
                <div className={styles.sections}>
                    {/* PRIMARY */}
                    <section className={styles.section}>
                        <header className={styles.sectionHeader}>
                            <Text variant="body-lg" weight={600}>
                                Schedulazione principale
                            </Text>
                            <IconButton
                                variant="primary"
                                icon={<Plus size={15} />}
                                aria-label="Aggiungi"
                                onClick={() => openAddDrawer("primary")}
                            />
                        </header>

                        <div className={styles.list}>
                            {loading ? (
                                <Text colorVariant="muted">Caricamento…</Text>
                            ) : primaryRules.length === 0 ? (
                                <Text colorVariant="muted">Nessuna regola configurata.</Text>
                            ) : (
                                primaryRules.map(rule => {
                                    const isActiveNow = isNowActive(rule);
                                    const isFallback =
                                        activeNow?.primaryId === rule.collection?.id &&
                                        !isActiveNow;
                                    const overlap =
                                        isActiveNow &&
                                        primaryWinner &&
                                        primaryWinner.id !== rule.id;

                                    return (
                                        <div className={styles.ruleWrap}>
                                            <div
                                                key={rule.id}
                                                className={styles.rule}
                                                data-active={isActiveNow}
                                            >
                                                <div className={styles.ruleMain}>
                                                    <div className={styles.ruleTopLine}>
                                                        <Text weight={600}>
                                                            {rule.collection?.name}
                                                        </Text>
                                                        {isActiveNow && (
                                                            <Badge variant="primary">In uso</Badge>
                                                        )}
                                                        {isFallback && (
                                                            <Badge variant="warning">
                                                                In uso - Backup
                                                            </Badge>
                                                        )}
                                                        {overlap && (
                                                            <Tooltip
                                                                content="Sovrascritta da un'altra regola attiva"
                                                                placement="right"
                                                            >
                                                                <TriangleAlert
                                                                    size={18}
                                                                    fill="#edb20e"
                                                                    color="black"
                                                                />
                                                            </Tooltip>
                                                        )}
                                                    </div>

                                                    <Text variant="caption" colorVariant="muted">
                                                        {formatDays(rule.days_of_week)} ·{" "}
                                                        {formatTimeRange(
                                                            rule.start_time,
                                                            rule.end_time
                                                        )}
                                                    </Text>
                                                </div>

                                                <div className={styles.ruleActions}>
                                                    <IconButton
                                                        variant="secondary"
                                                        icon={<Pencil size={16} />}
                                                        aria-label="Modifica"
                                                        onClick={() => openEditDrawer(rule)}
                                                    />
                                                    <IconButton
                                                        variant="secondary"
                                                        icon={<Trash2 size={16} />}
                                                        aria-label="Elimina"
                                                        onClick={() => {
                                                            setDeleteTargetId(rule.id);
                                                            setShowDeleteModal(true);
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </section>

                    {/* OVERLAY */}
                    <section className={styles.section}>
                        <header className={styles.sectionHeader}>
                            <Text variant="body-lg" weight={600}>
                                Schedulazione in evidenza
                            </Text>
                            <IconButton
                                variant="primary"
                                icon={<Plus size={15} />}
                                aria-label="Aggiungi"
                                onClick={() => openAddDrawer("overlay")}
                            />
                        </header>

                        <div className={styles.list}>
                            {overlayRules.length === 0 ? (
                                <Text colorVariant="muted">Nessuna regola configurata.</Text>
                            ) : (
                                overlayRules.map(rule => {
                                    const isActiveNow = isNowActive(rule);
                                    const isOverlapped =
                                        isActiveNow &&
                                        overlayWinner &&
                                        overlayWinner.id !== rule.id;

                                    return (
                                        <div className={styles.ruleWrap}>
                                            <div key={rule.id} className={styles.rule}>
                                                <div className={styles.ruleMain}>
                                                    <div className={styles.ruleTopLine}>
                                                        <Text weight={600}>
                                                            {rule.collection?.name}
                                                        </Text>

                                                        {isOverlapped && (
                                                            <Tooltip
                                                                content="Questa regola è sovrascritta da un'altra overlay attiva"
                                                                placement="right"
                                                            >
                                                                <TriangleAlert
                                                                    size={18}
                                                                    fill="#edb20e"
                                                                    color="black"
                                                                />
                                                            </Tooltip>
                                                        )}
                                                    </div>

                                                    <Text variant="caption" colorVariant="muted">
                                                        {formatDays(rule.days_of_week)} ·{" "}
                                                        {formatTimeRange(
                                                            rule.start_time,
                                                            rule.end_time
                                                        )}
                                                    </Text>
                                                </div>

                                                <div className={styles.ruleActions}>
                                                    <IconButton
                                                        icon={<Pencil size={16} />}
                                                        aria-label="Modifica"
                                                        onClick={() => openEditDrawer(rule)}
                                                    />
                                                    <IconButton
                                                        icon={<Trash2 size={16} />}
                                                        aria-label="Elimina"
                                                        onClick={() => {
                                                            setDeleteTargetId(rule.id);
                                                            setShowDeleteModal(true);
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </section>
                </div>

                <ConfirmModal
                    isOpen={showDeleteModal}
                    title="Elimina schedulazione"
                    description="Sei sicuro di voler eliminare questa schedulazione? L'operazione non è reversibile."
                    confirmLabel={isDeleting ? "Eliminazione..." : "Elimina"}
                    cancelLabel="Annulla"
                    onConfirm={confirmDelete}
                    onCancel={() => {
                        setShowDeleteModal(false);
                        setDeleteTargetId(null);
                    }}
                />
            </ModalLayoutContent>
            <ModalLayoutDrawer>
                <Drawer
                    isOpen={drawer.type !== "closed"}
                    onClose={closeDrawer}
                    title={
                        drawer.type === "edit" ? "Modifica schedulazione" : "Aggiungi schedulazione"
                    }
                    footer={
                        drawer.type === "add" ? (
                            <Button
                                variant="primary"
                                onClick={() => addDrawerRef.current?.submit()}
                            >
                                Aggiungi
                            </Button>
                        ) : drawer.type === "edit" ? (
                            <>
                                <Button variant="secondary" onClick={closeDrawer}>
                                    Annulla
                                </Button>
                                <Button
                                    variant="primary"
                                    onClick={() => editDrawerRef.current?.submit()}
                                >
                                    Applica
                                </Button>
                            </>
                        ) : null
                    }
                >
                    {drawer.type === "add" && (
                        <ScheduleRuleDrawer
                            ref={addDrawerRef}
                            mode="add"
                            slot={drawer.slot}
                            collections={collections}
                            onSubmit={draft => handleAddRule(drawer.slot, draft)}
                            onCancel={closeDrawer}
                        />
                    )}

                    {drawer.type === "edit" && (
                        <ScheduleRuleDrawer
                            ref={editDrawerRef}
                            mode="edit"
                            rule={drawer.rule}
                            collections={collections}
                            onSubmit={draft => handleEditRule(drawer.rule, draft)}
                            onCancel={closeDrawer}
                        />
                    )}
                </Drawer>
            </ModalLayoutDrawer>
        </ModalLayout>
    );
}
