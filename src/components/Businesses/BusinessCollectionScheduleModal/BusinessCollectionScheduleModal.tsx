import { useEffect, useMemo, useState } from "react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import styles from "./BusinessCollectionScheduleModal.module.scss";

import {
    listBusinessSchedules,
    createBusinessSchedule,
    updateBusinessSchedule,
    deleteBusinessSchedule,
    BusinessScheduleRow
} from "@/services/supabase/schedules";

import { supabase } from "@/services/supabase/client";
import Tooltip from "@/components/ui/Tooltip/Tooltip";
import { TriangleAlert } from "lucide-react";
import { getActiveWinner, isNowActive } from "@/domain/schedules/scheduleUtils";
import { resolveBusinessCollections } from "@/services/supabase/resolveBusinessCollections";
import { CheckboxInput } from "@/components/ui/Input/CheckboxInput";
import { TimeInput } from "@/components/ui/Input/TimeInput";
import { Select } from "@/components/ui/Select/Select";

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

type DraftRule = {
    collectionId: string | null;
    start: string; // HH:MM
    end: string; // HH:MM
    days: number[];
    allDay: boolean;
};

type EditDraft = {
    collectionId: string;
    start: string; // HH:MM
    end: string; // HH:MM
    days: number[];
    allDay: boolean;
};

const DAY_LABELS = ["D", "L", "M", "M", "G", "V", "S"];
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

function toggleDay(days: number[], day: number) {
    return days.includes(day) ? days.filter(d => d !== day) : [...days, day];
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

function toMinutes(t: string) {
    const [h, m] = t.slice(0, 5).split(":").map(Number);
    return h * 60 + m;
}

function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
    const aS = toMinutes(aStart);
    const aE = toMinutes(aEnd);
    const bS = toMinutes(bStart);
    const bE = toMinutes(bEnd);

    // all-day overlaps with everything
    if (aS === aE || bS === bE) return true;

    const aWrap = aS > aE;
    const bWrap = bS > bE;

    const overlaps = (s1: number, e1: number, s2: number, e2: number) => s1 < e2 && s2 < e1;

    if (!aWrap && !bWrap) return overlaps(aS, aE, bS, bE);

    if (aWrap && !bWrap) return overlaps(aS, 1440, bS, bE) || overlaps(0, aE, bS, bE);

    if (!aWrap && bWrap) return overlaps(aS, aE, bS, 1440) || overlaps(aS, aE, 0, bE);

    // both wrap
    return true;
}

function daysOverlap(a: number[], b: number[]) {
    return a.some(d => b.includes(d));
}

function hasOverlap(rule: BusinessScheduleRow, all: BusinessScheduleRow[]) {
    return all.some(other => {
        if (other.id === rule.id) return false;
        if (other.slot !== rule.slot) return false;

        return (
            daysOverlap(rule.days_of_week, other.days_of_week) &&
            timesOverlap(rule.start_time, rule.end_time, other.start_time, other.end_time)
        );
    });
}

export default function BusinessCollectionScheduleModal({ isOpen, businessId, onClose }: Props) {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [schedules, setSchedules] = useState<BusinessScheduleRow[]>([]);

    const [collections, setCollections] = useState<CollectionOption[]>([]);

    // Draft “Add”
    const [draftPrimary, setDraftPrimary] = useState<DraftRule>({
        collectionId: null,
        start: "09:00",
        end: "18:00",
        days: [1, 2, 3, 4, 5],
        allDay: false
    });

    const [draftOverlay, setDraftOverlay] = useState<DraftRule>({
        collectionId: null,
        start: "09:00",
        end: "18:00",
        days: [1, 2, 3, 4, 5],
        allDay: false
    });

    // Edit
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState<EditDraft | null>(null);

    const [activeNow, setActiveNow] = useState<{
        primaryId: string | null;
        overlayId: string | null;
        isFallback: boolean;
    } | null>(null);

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

    const [showPrimaryAdd, setShowPrimaryAdd] = useState(false);
    const [showOverlaySection, setShowOverlaySection] = useState(overlayRules.length > 0);

    const standardCollections = useMemo(
        () => collections.filter(c => c.kind === "standard"),
        [collections]
    );

    const specialCollections = useMemo(
        () => collections.filter(c => c.kind === "special"),
        [collections]
    );

    const canAddPrimary = !!draftPrimary.collectionId && draftPrimary.days.length > 0;

    const canAddOverlay = !!draftOverlay.collectionId && draftOverlay.days.length > 0;

    async function refresh() {
        const data = await listBusinessSchedules(businessId);
        setSchedules(data);
    }

    /* ============================
       Load when opened
    ============================ */
    useEffect(() => {
        if (!isOpen) return;

        let cancelled = false;

        async function load() {
            try {
                setLoading(true);
                setError(null);

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
            } catch (e) {
                console.log("error", e);
                if (cancelled) return;
                setError("Errore nel caricamento delle impostazioni.");
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
                // non blocchiamo la UI se il resolver fallisce
                if (!cancelled) setActiveNow(null);
            }
        }

        resolveNow();

        return () => {
            cancelled = true;
        };
    }, [isOpen, businessId, schedules]);

    /* ============================
       ESC to close
    ============================ */
    useEffect(() => {
        if (!isOpen) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [isOpen, onClose]);

    // Reset edit state when closing
    useEffect(() => {
        if (isOpen) return;
        setEditingId(null);
        setEditDraft(null);
        setError(null);
        setDraftPrimary({
            collectionId: null,
            start: "09:00",
            end: "18:00",
            days: [1, 2, 3, 4, 5],
            allDay: false
        });
        setDraftOverlay({
            collectionId: null,
            start: "09:00",
            end: "18:00",
            days: [1, 2, 3, 4, 5],
            allDay: false
        });
        setShowPrimaryAdd(false);
        setShowOverlaySection(false);
        setActiveNow(null);
    }, [isOpen]);

    useEffect(() => {
        if (overlayRules.length > 0) {
            setShowOverlaySection(true);
        }
    }, [overlayRules.length]);

    useEffect(() => {
        if (!isOpen) return;
        if (primaryRules.length === 0) setShowPrimaryAdd(true);
    }, [isOpen, primaryRules.length]);

    if (!isOpen) return null;

    const openEdit = (rule: BusinessScheduleRow) => {
        const isAllDay = rule.start_time.slice(0, 5) === rule.end_time.slice(0, 5);

        setEditingId(rule.id);
        setEditDraft({
            collectionId: rule.collection.id,
            start: rule.start_time.slice(0, 5),
            end: rule.end_time.slice(0, 5),
            days: rule.days_of_week,
            allDay: isAllDay
        });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditDraft(null);
    };

    const saveEdit = async (ruleId: string) => {
        if (!editDraft) return;

        if (!editDraft.collectionId || editDraft.days.length === 0) {
            setError("Controlla contenuto, giorni e orario.");
            return;
        }

        try {
            setSaving(true);
            setError(null);

            const start = editDraft.allDay ? "00:00" : editDraft.start.slice(0, 5);
            const end = editDraft.allDay ? "00:00" : editDraft.end.slice(0, 5);

            await updateBusinessSchedule(ruleId, {
                collectionId: editDraft.collectionId,
                days: editDraft.days,
                start,
                end
            });

            cancelEdit();
            await refresh();
        } catch {
            setError("Errore durante il salvataggio.");
        } finally {
            setSaving(false);
        }
    };

    const removeRule = async (ruleId: string) => {
        try {
            setSaving(true);
            setError(null);

            await deleteBusinessSchedule(ruleId);
            cancelEdit();
            await refresh();
        } catch {
            setError("Errore durante l'eliminazione.");
        } finally {
            setSaving(false);
        }
    };

    const addRule = async (slot: "primary" | "overlay") => {
        if (saving) return;

        const draft = slot === "primary" ? draftPrimary : draftOverlay;
        if (!draft.collectionId) return;

        try {
            setSaving(true);
            setError(null);

            const startToSend = draft.allDay ? "00:00" : draft.start;
            const endToSend = draft.allDay ? "00:00" : draft.end;

            const normalize = (t: string) => t.slice(0, 5);

            const start = normalize(startToSend);
            const end = normalize(endToSend);

            await createBusinessSchedule({
                businessId,
                collectionId: draft.collectionId,
                slot,
                days: draft.days,
                start,
                end
            });

            if (slot === "primary") {
                setDraftPrimary({
                    collectionId: null,
                    start: "09:00",
                    end: "18:00",
                    days: [1, 2, 3, 4, 5],
                    allDay: false
                });
            } else {
                setDraftOverlay({
                    collectionId: null,
                    start: "09:00",
                    end: "18:00",
                    days: [1, 2, 3, 4, 5],
                    allDay: false
                });
            }

            await refresh();
            if (slot === "primary") setShowPrimaryAdd(false);
        } catch {
            setError("Errore durante la creazione della regola.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            className={styles.overlay}
            role="dialog"
            aria-modal="true"
            aria-labelledby="content-schedule-title"
            onMouseDown={e => {
                // click overlay to close (only if clicking the backdrop)
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className={styles.modal}>
                {/* Header */}
                <header className={styles.header}>
                    <div className={styles.headerText}>
                        <Text as="h2" variant="title-md" weight={600}>
                            Contenuti &amp; Orari
                        </Text>
                        <Text variant="body" colorVariant="muted">
                            Imposta quali contenuti vengono mostrati automaticamente in base a
                            giorni e orari.
                        </Text>
                    </div>
                </header>

                {activeNow && (
                    <div className={styles.activeNowBanner}>
                        <Text variant="caption" weight={600}>
                            Attivo ora:
                        </Text>

                        {activeNow.primaryId ? (
                            <Text variant="caption">
                                {collections.find(c => c.id === activeNow.primaryId)?.name ??
                                    "Contenuto"}
                                {activeNow.isFallback && (
                                    <span className={styles.fallbackBadge}>Fallback</span>
                                )}
                            </Text>
                        ) : (
                            <Text variant="caption" colorVariant="muted">
                                Nessun contenuto attivo
                            </Text>
                        )}
                    </div>
                )}

                {/* Content */}
                <div className={styles.content}>
                    {error && (
                        <div className={styles.notice} role="status" aria-live="polite">
                            <Text variant="body" colorVariant="muted">
                                {error}
                            </Text>
                        </div>
                    )}

                    {loading ? (
                        <div className={styles.loading}>
                            <Text variant="body" colorVariant="muted">
                                Caricamento…
                            </Text>
                        </div>
                    ) : (
                        <>
                            {/* Primary */}
                            <section className={styles.section}>
                                <div className={styles.sectionHeader}>
                                    <div>
                                        <Text as="h3" variant="title-sm" weight={600}>
                                            Contenuti principali
                                        </Text>
                                        <Text variant="caption" colorVariant="muted">
                                            Mostrati come contenuto principale in base all’orario.
                                        </Text>
                                    </div>

                                    <button
                                        type="button"
                                        className={styles.toggleBtn}
                                        onClick={() => setShowPrimaryAdd(v => !v)}
                                        aria-expanded={showPrimaryAdd}
                                    >
                                        <Text variant="caption" weight={600}>
                                            {showPrimaryAdd ? "Nascondi" : "Aggiungi schedulazione"}
                                        </Text>
                                    </button>
                                </div>

                                {/* Add Primary */}
                                {showPrimaryAdd && (
                                    <div
                                        className={styles.addPanel}
                                        aria-label="Aggiungi regola contenuto principale"
                                    >
                                        <div className={styles.addRow}>
                                            <div className={styles.field}>
                                                <Select
                                                    label="Contenuto"
                                                    value={draftPrimary.collectionId ?? ""}
                                                    onChange={e =>
                                                        setDraftPrimary(p => ({
                                                            ...p,
                                                            collectionId: e.target.value || null
                                                        }))
                                                    }
                                                    options={[
                                                        { value: "", label: "Seleziona…" },
                                                        ...standardCollections.map(c => ({
                                                            value: c.id,
                                                            label: c.name
                                                        }))
                                                    ]}
                                                />
                                            </div>

                                            <div className={styles.field}>
                                                <CheckboxInput
                                                    label="Tutto il giorno"
                                                    description="Impostalo per tutto il giorno"
                                                    checked={draftPrimary.allDay}
                                                    onChange={e =>
                                                        setDraftPrimary(p => ({
                                                            ...p,
                                                            allDay: e.target.checked,
                                                            start: e.target.checked
                                                                ? "00:00"
                                                                : p.start,
                                                            end: e.target.checked ? "00:00" : p.end
                                                        }))
                                                    }
                                                />
                                            </div>

                                            <div className={styles.field}>
                                                <div className={styles.timeRow}>
                                                    <TimeInput
                                                        label="Orario inizio"
                                                        step={60}
                                                        disabled={draftPrimary.allDay}
                                                        value={draftPrimary.start}
                                                        onChange={e =>
                                                            setDraftPrimary(p => ({
                                                                ...p,
                                                                start: e.target.value
                                                            }))
                                                        }
                                                        aria-label="Orario inizio"
                                                    />
                                                    <TimeInput
                                                        label="Orario fine"
                                                        step={60}
                                                        disabled={draftPrimary.allDay}
                                                        value={draftPrimary.end}
                                                        onChange={e =>
                                                            setDraftPrimary(p => ({
                                                                ...p,
                                                                end: e.target.value
                                                            }))
                                                        }
                                                        aria-label="Orario fine"
                                                    />
                                                </div>
                                            </div>

                                            <div className={styles.field}>
                                                <Text variant="caption" colorVariant="muted">
                                                    Giorni
                                                </Text>
                                                <div className={styles.days}>
                                                    {DAY_UI_ORDER.map(day => {
                                                        const label = DAY_LABELS[day];
                                                        const active =
                                                            draftPrimary.days.includes(day);
                                                        return (
                                                            <button
                                                                key={day}
                                                                type="button"
                                                                className={
                                                                    active
                                                                        ? styles.dayChipActive
                                                                        : styles.dayChip
                                                                }
                                                                aria-pressed={active}
                                                                aria-label={DAY_FULL[day]}
                                                                onClick={() =>
                                                                    setDraftPrimary(p => ({
                                                                        ...p,
                                                                        days: toggleDay(p.days, day)
                                                                    }))
                                                                }
                                                            >
                                                                <Text
                                                                    variant="caption"
                                                                    weight={600}
                                                                >
                                                                    {label}
                                                                </Text>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>

                                        <div className={styles.addActions}>
                                            <Button
                                                variant="primary"
                                                label="Aggiungi"
                                                disabled={!canAddPrimary || saving}
                                                onClick={() => addRule("primary")}
                                            />
                                            <Text variant="caption" colorVariant="muted">
                                                {canAddPrimary
                                                    ? " "
                                                    : "Seleziona contenuto, giorni e un intervallo orario valido."}
                                            </Text>
                                        </div>
                                    </div>
                                )}

                                {/* List Primary */}
                                <div
                                    className={styles.list}
                                    role="list"
                                    aria-label="Regole contenuti principali"
                                >
                                    {primaryRules.length === 0 ? (
                                        <div className={styles.empty}>
                                            <Text variant="body" colorVariant="muted">
                                                Nessuna regola configurata.
                                            </Text>
                                        </div>
                                    ) : (
                                        primaryRules.map(rule => {
                                            const isActiveNow = isNowActive(rule);
                                            const isResolvedPrimary =
                                                activeNow?.primaryId === rule.collection.id &&
                                                isActiveNow;

                                            const isEditing = editingId === rule.id;
                                            const overlap = hasOverlap(rule, schedules);
                                            const showOverlapAlert =
                                                overlap &&
                                                isActiveNow &&
                                                primaryWinner !== null &&
                                                primaryWinner.id !== rule.id;

                                            return (
                                                <div
                                                    key={rule.id}
                                                    className={styles.ruleWrap}
                                                    role="listitem"
                                                >
                                                    <div
                                                        className={styles.rule}
                                                        data-active={isActiveNow}
                                                    >
                                                        <div className={styles.ruleMain}>
                                                            <div className={styles.ruleTopLine}>
                                                                <Text weight={600}>
                                                                    {rule.collection.name}
                                                                </Text>
                                                                {isActiveNow && (
                                                                    <span
                                                                        className={styles.badge}
                                                                        aria-label="Attivo ora"
                                                                    >
                                                                        <Text
                                                                            variant="caption"
                                                                            weight={700}
                                                                        >
                                                                            Attivo ora
                                                                        </Text>
                                                                    </span>
                                                                )}
                                                                {isResolvedPrimary && (
                                                                    <span className={styles.badge}>
                                                                        <Text
                                                                            variant="caption"
                                                                            weight={700}
                                                                        >
                                                                            In uso ora
                                                                        </Text>
                                                                    </span>
                                                                )}

                                                                {showOverlapAlert && (
                                                                    <Tooltip
                                                                        content="Questo contenuto è sovrascritto da un altro attivo nello stesso orario."
                                                                        placement="right"
                                                                    >
                                                                        <TriangleAlert
                                                                            size={18}
                                                                            fill="#FFD700"
                                                                        />
                                                                    </Tooltip>
                                                                )}
                                                            </div>

                                                            <Text
                                                                variant="caption"
                                                                colorVariant="muted"
                                                            >
                                                                {formatDays(rule.days_of_week)} ·{" "}
                                                                {formatTimeRange(
                                                                    rule.start_time,
                                                                    rule.end_time
                                                                )}
                                                            </Text>
                                                        </div>

                                                        <button
                                                            type="button"
                                                            className={styles.iconBtn}
                                                            onClick={() => openEdit(rule)}
                                                            aria-label="Modifica regola"
                                                        >
                                                            <Text variant="caption" weight={700}>
                                                                Modifica
                                                            </Text>
                                                        </button>
                                                    </div>

                                                    {isEditing && editDraft && (
                                                        <div
                                                            className={styles.editor}
                                                            aria-label="Modifica regola"
                                                        >
                                                            <div className={styles.editorGrid}>
                                                                <div className={styles.field}>
                                                                    <Select
                                                                        label="Contenuto"
                                                                        value={
                                                                            editDraft.collectionId
                                                                        }
                                                                        onChange={e =>
                                                                            setEditDraft(p =>
                                                                                p
                                                                                    ? {
                                                                                          ...p,
                                                                                          collectionId:
                                                                                              e
                                                                                                  .target
                                                                                                  .value
                                                                                      }
                                                                                    : p
                                                                            )
                                                                        }
                                                                        options={[
                                                                            {
                                                                                value: "",
                                                                                label: "Seleziona..."
                                                                            },
                                                                            ...standardCollections.map(
                                                                                c => ({
                                                                                    value: c.id,
                                                                                    label: c.name
                                                                                })
                                                                            )
                                                                        ]}
                                                                    />
                                                                </div>

                                                                <div className={styles.field}>
                                                                    <CheckboxInput
                                                                        label="Tutto il giorno"
                                                                        description="Impostalo per tutto il giorno"
                                                                        checked={editDraft.allDay}
                                                                        onChange={e =>
                                                                            setEditDraft(p =>
                                                                                p
                                                                                    ? {
                                                                                          ...p,
                                                                                          allDay: e
                                                                                              .target
                                                                                              .checked,
                                                                                          start: e
                                                                                              .target
                                                                                              .checked
                                                                                              ? "00:00"
                                                                                              : p.start,
                                                                                          end: e
                                                                                              .target
                                                                                              .checked
                                                                                              ? "00:00"
                                                                                              : p.end
                                                                                      }
                                                                                    : p
                                                                            )
                                                                        }
                                                                    />
                                                                </div>

                                                                <div className={styles.field}>
                                                                    <div className={styles.timeRow}>
                                                                        <TimeInput
                                                                            label="Orario inizio"
                                                                            step={60}
                                                                            disabled={
                                                                                editDraft.allDay
                                                                            }
                                                                            value={editDraft.start}
                                                                            onChange={e =>
                                                                                setEditDraft(p =>
                                                                                    p
                                                                                        ? {
                                                                                              ...p,
                                                                                              start: e
                                                                                                  .target
                                                                                                  .value
                                                                                          }
                                                                                        : p
                                                                                )
                                                                            }
                                                                            aria-label="Orario inizio"
                                                                        />
                                                                        <TimeInput
                                                                            label="Orario fine"
                                                                            step={60}
                                                                            disabled={
                                                                                editDraft.allDay
                                                                            }
                                                                            value={editDraft.end}
                                                                            onChange={e =>
                                                                                setEditDraft(p =>
                                                                                    p
                                                                                        ? {
                                                                                              ...p,
                                                                                              end: e
                                                                                                  .target
                                                                                                  .value
                                                                                          }
                                                                                        : p
                                                                                )
                                                                            }
                                                                            aria-label="Orario fine"
                                                                        />
                                                                    </div>
                                                                </div>

                                                                <div className={styles.field}>
                                                                    <Text
                                                                        variant="caption"
                                                                        colorVariant="muted"
                                                                    >
                                                                        Giorni
                                                                    </Text>
                                                                    <div className={styles.days}>
                                                                        {DAY_UI_ORDER.map(day => {
                                                                            const label =
                                                                                DAY_LABELS[day];
                                                                            const on =
                                                                                editDraft.days.includes(
                                                                                    day
                                                                                );
                                                                            return (
                                                                                <button
                                                                                    key={day}
                                                                                    type="button"
                                                                                    className={
                                                                                        on
                                                                                            ? styles.dayChipActive
                                                                                            : styles.dayChip
                                                                                    }
                                                                                    aria-pressed={
                                                                                        on
                                                                                    }
                                                                                    aria-label={
                                                                                        DAY_FULL[
                                                                                            day
                                                                                        ]
                                                                                    }
                                                                                    onClick={() =>
                                                                                        setEditDraft(
                                                                                            p =>
                                                                                                p
                                                                                                    ? {
                                                                                                          ...p,
                                                                                                          days: toggleDay(
                                                                                                              p.days,
                                                                                                              day
                                                                                                          )
                                                                                                      }
                                                                                                    : p
                                                                                        )
                                                                                    }
                                                                                >
                                                                                    <Text
                                                                                        variant="caption"
                                                                                        weight={600}
                                                                                    >
                                                                                        {label}
                                                                                    </Text>
                                                                                </button>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className={styles.editorActions}>
                                                                <Button
                                                                    variant="primary"
                                                                    label="Salva"
                                                                    disabled={
                                                                        saving ||
                                                                        !editDraft.collectionId ||
                                                                        editDraft.days.length === 0
                                                                    }
                                                                    onClick={() =>
                                                                        saveEdit(rule.id)
                                                                    }
                                                                />
                                                                <Button
                                                                    variant="secondary"
                                                                    label="Elimina"
                                                                    disabled={saving}
                                                                    onClick={() =>
                                                                        removeRule(rule.id)
                                                                    }
                                                                />
                                                                <Button
                                                                    variant="ghost"
                                                                    label="Annulla"
                                                                    disabled={saving}
                                                                    onClick={cancelEdit}
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </section>

                            {/* Overlay */}
                            <section className={styles.section}>
                                <div className={styles.sectionHeader}>
                                    <div>
                                        <Text as="h3" variant="body" weight={600}>
                                            Contenuti in evidenza
                                        </Text>
                                        <Text variant="caption" colorVariant="muted">
                                            Contenuti aggiuntivi mostrati sopra al principale.
                                        </Text>
                                    </div>

                                    <button
                                        type="button"
                                        className={styles.toggleBtn}
                                        onClick={() => setShowOverlaySection(v => !v)}
                                        aria-expanded={showOverlaySection}
                                    >
                                        <Text variant="caption" weight={600}>
                                            {showOverlaySection
                                                ? "Nascondi"
                                                : "Aggiungi contenuto in evidenza"}
                                        </Text>
                                    </button>
                                </div>

                                {showOverlaySection && (
                                    <>
                                        {/* Add panel */}
                                        <div
                                            className={styles.addPanel}
                                            aria-label="Aggiungi contenuto in evidenza"
                                        >
                                            <div className={styles.addRow}>
                                                <div className={styles.field}>
                                                    <Select
                                                        label="Contenuto"
                                                        value={draftOverlay.collectionId ?? ""}
                                                        onChange={e =>
                                                            setDraftOverlay(p => ({
                                                                ...p,
                                                                collectionId: e.target.value || null
                                                            }))
                                                        }
                                                        options={[
                                                            {
                                                                value: "",
                                                                label: "Seleziona..."
                                                            },
                                                            ...specialCollections.map(c => ({
                                                                value: c.id,
                                                                label: c.name
                                                            }))
                                                        ]}
                                                    />
                                                </div>

                                                <div className={styles.field}>
                                                    <CheckboxInput
                                                        label="Tutto il giorno"
                                                        description="Impostalo per tutto il giorno"
                                                        checked={draftOverlay.allDay}
                                                        onChange={e =>
                                                            setDraftOverlay(p => ({
                                                                ...p,
                                                                allDay: e.target.checked,
                                                                start: e.target.checked
                                                                    ? "00:00"
                                                                    : p.start,
                                                                end: e.target.checked
                                                                    ? "00:00"
                                                                    : p.end
                                                            }))
                                                        }
                                                    />
                                                </div>

                                                <div className={styles.field}>
                                                    <div className={styles.timeRow}>
                                                        <TimeInput
                                                            label="Orario inizio"
                                                            step={60}
                                                            disabled={draftOverlay.allDay}
                                                            value={draftOverlay.start}
                                                            onChange={e =>
                                                                setDraftOverlay(p => ({
                                                                    ...p,
                                                                    start: e.target.value
                                                                }))
                                                            }
                                                            aria-label="Orario inizio"
                                                        />
                                                        <TimeInput
                                                            label="Orario fine"
                                                            step={60}
                                                            disabled={draftOverlay.allDay}
                                                            value={draftOverlay.end}
                                                            onChange={e =>
                                                                setDraftOverlay(p => ({
                                                                    ...p,
                                                                    end: e.target.value
                                                                }))
                                                            }
                                                            aria-label="Orario fine"
                                                        />
                                                    </div>
                                                </div>

                                                <div className={styles.field}>
                                                    <Text variant="caption" colorVariant="muted">
                                                        Giorni
                                                    </Text>
                                                    <div className={styles.days}>
                                                        {DAY_UI_ORDER.map(day => {
                                                            const label = DAY_LABELS[day];
                                                            const active =
                                                                draftOverlay.days.includes(day);
                                                            return (
                                                                <button
                                                                    key={day}
                                                                    type="button"
                                                                    disabled={draftOverlay.allDay}
                                                                    className={
                                                                        active
                                                                            ? styles.dayChipActive
                                                                            : styles.dayChip
                                                                    }
                                                                    aria-pressed={active}
                                                                    aria-label={DAY_FULL[day]}
                                                                    onClick={() =>
                                                                        setDraftOverlay(p => ({
                                                                            ...p,
                                                                            days: toggleDay(
                                                                                p.days,
                                                                                day
                                                                            )
                                                                        }))
                                                                    }
                                                                >
                                                                    <Text
                                                                        variant="caption"
                                                                        weight={600}
                                                                    >
                                                                        {label}
                                                                    </Text>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className={styles.addActions}>
                                                <Button
                                                    variant="secondary"
                                                    label="Aggiungi"
                                                    disabled={!canAddOverlay || saving}
                                                    onClick={() => addRule("overlay")}
                                                />
                                                <Text variant="caption" colorVariant="muted">
                                                    {canAddOverlay
                                                        ? " "
                                                        : "Seleziona contenuto, giorni e un intervallo orario valido."}
                                                </Text>
                                            </div>
                                        </div>

                                        {/* Lista */}
                                        <div
                                            className={styles.list}
                                            role="list"
                                            aria-label="Regole contenuti in evidenza"
                                        >
                                            {overlayRules.length === 0 ? (
                                                <div className={styles.empty}>
                                                    <Text variant="body" colorVariant="muted">
                                                        Nessun contenuto in evidenza configurato.
                                                    </Text>
                                                </div>
                                            ) : (
                                                overlayRules.map(rule => {
                                                    const isActiveNow = isNowActive(rule);
                                                    const isEditing = editingId === rule.id;
                                                    const overlap = hasOverlap(rule, schedules);
                                                    const showOverlapAlert =
                                                        overlap &&
                                                        isActiveNow &&
                                                        overlayWinner !== null &&
                                                        overlayWinner.id !== rule.id;

                                                    return (
                                                        <div
                                                            key={rule.id}
                                                            className={styles.ruleWrap}
                                                            role="listitem"
                                                        >
                                                            <div
                                                                className={styles.rule}
                                                                data-active={isActiveNow}
                                                            >
                                                                <div className={styles.ruleMain}>
                                                                    <div
                                                                        className={
                                                                            styles.ruleTopLine
                                                                        }
                                                                    >
                                                                        <Text weight={600}>
                                                                            {rule.collection.name}
                                                                        </Text>
                                                                        {isActiveNow && (
                                                                            <span
                                                                                className={
                                                                                    styles.badge
                                                                                }
                                                                                aria-label="Attivo ora"
                                                                            >
                                                                                <Text
                                                                                    variant="caption"
                                                                                    weight={700}
                                                                                >
                                                                                    Attivo ora
                                                                                </Text>
                                                                            </span>
                                                                        )}
                                                                        {showOverlapAlert && (
                                                                            <Tooltip
                                                                                content="Questo contenuto è sovrascritto da un altro attivo nello stesso orario."
                                                                                placement="right"
                                                                            >
                                                                                <TriangleAlert
                                                                                    size={18}
                                                                                    fill="#FFD700"
                                                                                />
                                                                            </Tooltip>
                                                                        )}
                                                                    </div>

                                                                    <Text
                                                                        variant="caption"
                                                                        colorVariant="muted"
                                                                    >
                                                                        {formatDays(
                                                                            rule.days_of_week
                                                                        )}{" "}
                                                                        ·{" "}
                                                                        {formatTimeRange(
                                                                            rule.start_time,
                                                                            rule.end_time
                                                                        )}
                                                                    </Text>
                                                                </div>

                                                                <button
                                                                    type="button"
                                                                    className={styles.iconBtn}
                                                                    onClick={() => openEdit(rule)}
                                                                    aria-label="Modifica regola"
                                                                >
                                                                    <Text
                                                                        variant="caption"
                                                                        weight={700}
                                                                    >
                                                                        Modifica
                                                                    </Text>
                                                                </button>
                                                            </div>

                                                            {isEditing && editDraft && (
                                                                <div
                                                                    className={styles.editor}
                                                                    aria-label="Modifica regola"
                                                                >
                                                                    <div
                                                                        className={
                                                                            styles.editorGrid
                                                                        }
                                                                    >
                                                                        <div
                                                                            className={styles.field}
                                                                        >
                                                                            <Select
                                                                                label="Contenuto"
                                                                                value={
                                                                                    editDraft.collectionId
                                                                                }
                                                                                onChange={e =>
                                                                                    setEditDraft(
                                                                                        p =>
                                                                                            p
                                                                                                ? {
                                                                                                      ...p,
                                                                                                      collectionId:
                                                                                                          e
                                                                                                              .target
                                                                                                              .value
                                                                                                  }
                                                                                                : p
                                                                                    )
                                                                                }
                                                                                options={[
                                                                                    {
                                                                                        value: "",
                                                                                        label: "Seleziona..."
                                                                                    },
                                                                                    ...specialCollections.map(
                                                                                        c => ({
                                                                                            value: c.id,
                                                                                            label: c.name
                                                                                        })
                                                                                    )
                                                                                ]}
                                                                            />
                                                                        </div>

                                                                        <div
                                                                            className={styles.field}
                                                                        >
                                                                            <CheckboxInput
                                                                                label="Tutto il giorno"
                                                                                description="Impostalo per tutto il giorno"
                                                                                checked={
                                                                                    editDraft.allDay
                                                                                }
                                                                                onChange={e =>
                                                                                    setEditDraft(
                                                                                        p =>
                                                                                            p
                                                                                                ? {
                                                                                                      ...p,
                                                                                                      allDay: e
                                                                                                          .target
                                                                                                          .checked,
                                                                                                      start: e
                                                                                                          .target
                                                                                                          .checked
                                                                                                          ? "00:00"
                                                                                                          : p.start,
                                                                                                      end: e
                                                                                                          .target
                                                                                                          .checked
                                                                                                          ? "00:00"
                                                                                                          : p.end
                                                                                                  }
                                                                                                : p
                                                                                    )
                                                                                }
                                                                            />
                                                                        </div>

                                                                        <div
                                                                            className={styles.field}
                                                                        >
                                                                            <div
                                                                                className={
                                                                                    styles.timeRow
                                                                                }
                                                                            >
                                                                                <TimeInput
                                                                                    label="Orario inizio"
                                                                                    step={60}
                                                                                    disabled={
                                                                                        editDraft.allDay
                                                                                    }
                                                                                    value={
                                                                                        editDraft.start
                                                                                    }
                                                                                    onChange={e =>
                                                                                        setEditDraft(
                                                                                            p =>
                                                                                                p
                                                                                                    ? {
                                                                                                          ...p,
                                                                                                          start: e
                                                                                                              .target
                                                                                                              .value
                                                                                                      }
                                                                                                    : p
                                                                                        )
                                                                                    }
                                                                                    aria-label="Orario inizio"
                                                                                />
                                                                                <TimeInput
                                                                                    label="Orario fine"
                                                                                    step={60}
                                                                                    disabled={
                                                                                        editDraft.allDay
                                                                                    }
                                                                                    value={
                                                                                        editDraft.end
                                                                                    }
                                                                                    onChange={e =>
                                                                                        setEditDraft(
                                                                                            p =>
                                                                                                p
                                                                                                    ? {
                                                                                                          ...p,
                                                                                                          end: e
                                                                                                              .target
                                                                                                              .value
                                                                                                      }
                                                                                                    : p
                                                                                        )
                                                                                    }
                                                                                    aria-label="Orario fine"
                                                                                />
                                                                            </div>
                                                                        </div>

                                                                        <div
                                                                            className={styles.field}
                                                                        >
                                                                            <Text
                                                                                variant="caption"
                                                                                colorVariant="muted"
                                                                            >
                                                                                Giorni
                                                                            </Text>
                                                                            <div
                                                                                className={
                                                                                    styles.days
                                                                                }
                                                                            >
                                                                                {DAY_UI_ORDER.map(
                                                                                    day => {
                                                                                        const label =
                                                                                            DAY_LABELS[
                                                                                                day
                                                                                            ];
                                                                                        const on =
                                                                                            editDraft.days.includes(
                                                                                                day
                                                                                            );
                                                                                        return (
                                                                                            <button
                                                                                                key={
                                                                                                    day
                                                                                                }
                                                                                                type="button"
                                                                                                disabled={
                                                                                                    editDraft.allDay
                                                                                                }
                                                                                                className={
                                                                                                    on
                                                                                                        ? styles.dayChipActive
                                                                                                        : styles.dayChip
                                                                                                }
                                                                                                aria-pressed={
                                                                                                    on
                                                                                                }
                                                                                                aria-label={
                                                                                                    DAY_FULL[
                                                                                                        day
                                                                                                    ]
                                                                                                }
                                                                                                onClick={() =>
                                                                                                    setEditDraft(
                                                                                                        p =>
                                                                                                            p
                                                                                                                ? {
                                                                                                                      ...p,
                                                                                                                      days: toggleDay(
                                                                                                                          p.days,
                                                                                                                          day
                                                                                                                      )
                                                                                                                  }
                                                                                                                : p
                                                                                                    )
                                                                                                }
                                                                                            >
                                                                                                <Text
                                                                                                    variant="caption"
                                                                                                    weight={
                                                                                                        600
                                                                                                    }
                                                                                                >
                                                                                                    {
                                                                                                        label
                                                                                                    }
                                                                                                </Text>
                                                                                            </button>
                                                                                        );
                                                                                    }
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <div
                                                                        className={
                                                                            styles.editorActions
                                                                        }
                                                                    >
                                                                        <Button
                                                                            variant="primary"
                                                                            label="Salva"
                                                                            disabled={
                                                                                saving ||
                                                                                !editDraft.collectionId ||
                                                                                editDraft.days
                                                                                    .length === 0
                                                                            }
                                                                            onClick={() =>
                                                                                saveEdit(rule.id)
                                                                            }
                                                                        />
                                                                        <Button
                                                                            variant="secondary"
                                                                            label="Elimina"
                                                                            disabled={saving}
                                                                            onClick={() =>
                                                                                removeRule(rule.id)
                                                                            }
                                                                        />
                                                                        <Button
                                                                            variant="ghost"
                                                                            label="Annulla"
                                                                            disabled={saving}
                                                                            onClick={cancelEdit}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </>
                                )}
                            </section>
                        </>
                    )}
                </div>

                {/* Footer */}
                <footer className={styles.footer}>
                    <Text variant="caption" colorVariant="muted">
                        Le modifiche sono salvate per singola regola.
                    </Text>
                    <Button variant="ghost" label="Chiudi" onClick={onClose} />
                </footer>
            </div>
        </div>
    );
}
