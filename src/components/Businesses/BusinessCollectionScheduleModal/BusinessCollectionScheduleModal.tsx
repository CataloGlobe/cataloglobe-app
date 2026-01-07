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
    days: number[]; // 0..6
};

type EditDraft = {
    collectionId: string;
    start: string; // HH:MM
    end: string; // HH:MM
    days: number[];
};

const DAY_LABELS = ["D", "L", "M", "M", "G", "V", "S"];
const DAY_FULL = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

function formatDays(days: number[]) {
    if (days.length === 7) return "Tutti i giorni";
    const sorted = [...days].sort((a, b) => a - b);
    return sorted.map(d => DAY_FULL[d]).join(", ");
}

function formatTimeRange(start: string, end: string) {
    return `${start.slice(0, 5)}–${end.slice(0, 5)}`;
}

function nowPartsLocal() {
    const d = new Date();
    const dow = d.getDay(); // 0..6
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return { dow, time: `${hh}:${mm}:${ss}` };
}

function isNowActive(rule: BusinessScheduleRow) {
    const { dow, time } = nowPartsLocal();
    if (!rule.days_of_week.includes(dow)) return false;
    // confronto lessicografico ok con HH:MM:SS
    return time >= rule.start_time && time < rule.end_time;
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

function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
    return aStart < bEnd && bStart < aEnd;
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

function getActiveWinner(
    rules: BusinessScheduleRow[],
    isNowActiveFn: (r: BusinessScheduleRow) => boolean
): BusinessScheduleRow | null {
    const active = rules.filter(isNowActiveFn);

    if (active.length <= 1) return active[0] ?? null;

    return active.slice().sort((a, b) => {
        // 1️⃣ vince chi inizia più tardi
        if (a.start_time !== b.start_time) {
            return a.start_time > b.start_time ? -1 : 1;
        }
        // 2️⃣ a parità, vince la più recente
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })[0];
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
        days: [1, 2, 3, 4, 5]
    });

    const [draftOverlay, setDraftOverlay] = useState<DraftRule>({
        collectionId: null,
        start: "09:00",
        end: "18:00",
        days: [1, 2, 3, 4, 5]
    });

    // Edit
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState<EditDraft | null>(null);

    const primaryRules = useMemo(() => {
        const rules = schedules.filter(s => s.slot === "primary");
        return sortByActiveNow(rules, isNowActive);
    }, [schedules]);

    const overlayRules = useMemo(() => {
        const rules = schedules.filter(s => s.slot === "overlay");
        return sortByActiveNow(rules, isNowActive);
    }, [schedules]);

    const [showOverlaySection, setShowOverlaySection] = useState(overlayRules.length > 0);

    const standardCollections = useMemo(
        () => collections.filter(c => c.kind === "standard"),
        [collections]
    );

    const specialCollections = useMemo(
        () => collections.filter(c => c.kind === "special"),
        [collections]
    );

    const canAddPrimary =
        !!draftPrimary.collectionId &&
        draftPrimary.days.length > 0 &&
        draftPrimary.start < draftPrimary.end;

    const canAddOverlay =
        !!draftOverlay.collectionId &&
        draftOverlay.days.length > 0 &&
        draftOverlay.start < draftOverlay.end;

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
    }, [isOpen]);

    useEffect(() => {
        if (overlayRules.length > 0) {
            setShowOverlaySection(true);
        }
    }, [overlayRules.length]);

    if (!isOpen) return null;

    const openEdit = (rule: BusinessScheduleRow) => {
        setEditingId(rule.id);
        setEditDraft({
            collectionId: rule.collection.id,
            start: rule.start_time.slice(0, 5),
            end: rule.end_time.slice(0, 5),
            days: rule.days_of_week
        });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditDraft(null);
    };

    const saveEdit = async (ruleId: string) => {
        if (!editDraft) return;

        if (
            !editDraft.collectionId ||
            editDraft.days.length === 0 ||
            editDraft.start >= editDraft.end
        ) {
            setError("Controlla contenuto, giorni e orario.");
            return;
        }

        try {
            setSaving(true);
            setError(null);

            await updateBusinessSchedule(ruleId, {
                collectionId: editDraft.collectionId,
                days: editDraft.days,
                start: editDraft.start,
                end: editDraft.end
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
        const draft = slot === "primary" ? draftPrimary : draftOverlay;
        if (!draft.collectionId) return;

        try {
            setSaving(true);
            setError(null);

            await createBusinessSchedule({
                businessId,
                collectionId: draft.collectionId,
                slot,
                days: draft.days,
                start: draft.start,
                end: draft.end
            });

            if (slot === "primary") {
                setDraftPrimary({
                    collectionId: null,
                    start: "09:00",
                    end: "18:00",
                    days: [1, 2, 3, 4, 5]
                });
            } else {
                setDraftOverlay({
                    collectionId: null,
                    start: "09:00",
                    end: "18:00",
                    days: [1, 2, 3, 4, 5]
                });
            }

            await refresh();
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

                                    <div className={styles.sectionMeta}>
                                        <Text variant="caption" colorVariant="muted">
                                            {primaryRules.length} regole
                                        </Text>
                                    </div>
                                </div>

                                {/* Add Primary */}
                                <div
                                    className={styles.addPanel}
                                    aria-label="Aggiungi regola contenuto principale"
                                >
                                    <div className={styles.addRow}>
                                        <div className={styles.field}>
                                            <Text variant="caption" colorVariant="muted">
                                                Contenuto
                                            </Text>
                                            <select
                                                className={styles.select}
                                                value={draftPrimary.collectionId ?? ""}
                                                onChange={e =>
                                                    setDraftPrimary(p => ({
                                                        ...p,
                                                        collectionId: e.target.value || null
                                                    }))
                                                }
                                            >
                                                <option value="">Seleziona…</option>
                                                {standardCollections.map(c => (
                                                    <option key={c.id} value={c.id}>
                                                        {c.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className={styles.field}>
                                            <Text variant="caption" colorVariant="muted">
                                                Orario
                                            </Text>
                                            <div className={styles.timeRow}>
                                                <input
                                                    className={styles.time}
                                                    type="time"
                                                    value={draftPrimary.start}
                                                    onChange={e =>
                                                        setDraftPrimary(p => ({
                                                            ...p,
                                                            start: e.target.value
                                                        }))
                                                    }
                                                    aria-label="Orario inizio"
                                                />
                                                <Text variant="caption" colorVariant="muted">
                                                    –
                                                </Text>
                                                <input
                                                    className={styles.time}
                                                    type="time"
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
                                                {DAY_LABELS.map((label, day) => {
                                                    const active = draftPrimary.days.includes(day);
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
                                                            <Text variant="caption" weight={600}>
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
                                            const primaryWinner = getActiveWinner(
                                                primaryRules,
                                                isNowActive
                                            );

                                            const activeNow = isNowActive(rule);
                                            const isEditing = editingId === rule.id;
                                            const overlap = hasOverlap(rule, schedules);
                                            const showOverlapAlert =
                                                overlap &&
                                                activeNow &&
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
                                                        data-active={activeNow}
                                                    >
                                                        <div className={styles.ruleMain}>
                                                            <div className={styles.ruleTopLine}>
                                                                <Text weight={600}>
                                                                    {rule.collection.name}
                                                                </Text>
                                                                {activeNow && (
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
                                                                    <Text
                                                                        variant="caption"
                                                                        colorVariant="muted"
                                                                    >
                                                                        Contenuto
                                                                    </Text>
                                                                    <select
                                                                        className={styles.select}
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
                                                                    >
                                                                        {standardCollections.map(
                                                                            c => (
                                                                                <option
                                                                                    key={c.id}
                                                                                    value={c.id}
                                                                                >
                                                                                    {c.name}
                                                                                </option>
                                                                            )
                                                                        )}
                                                                    </select>
                                                                </div>

                                                                <div className={styles.field}>
                                                                    <Text
                                                                        variant="caption"
                                                                        colorVariant="muted"
                                                                    >
                                                                        Orario
                                                                    </Text>
                                                                    <div className={styles.timeRow}>
                                                                        <input
                                                                            className={styles.time}
                                                                            type="time"
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
                                                                        <Text
                                                                            variant="caption"
                                                                            colorVariant="muted"
                                                                        >
                                                                            –
                                                                        </Text>
                                                                        <input
                                                                            className={styles.time}
                                                                            type="time"
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
                                                                        {DAY_LABELS.map(
                                                                            (label, day) => {
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
                                                                                            weight={
                                                                                                600
                                                                                            }
                                                                                        >
                                                                                            {label}
                                                                                        </Text>
                                                                                    </button>
                                                                                );
                                                                            }
                                                                        )}
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
                                                                        editDraft.days.length ===
                                                                            0 ||
                                                                        editDraft.start >=
                                                                            editDraft.end
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
                                                    <Text variant="caption" colorVariant="muted">
                                                        Contenuto
                                                    </Text>
                                                    <select
                                                        className={styles.select}
                                                        value={draftOverlay.collectionId ?? ""}
                                                        onChange={e =>
                                                            setDraftOverlay(p => ({
                                                                ...p,
                                                                collectionId: e.target.value || null
                                                            }))
                                                        }
                                                    >
                                                        <option value="">Seleziona…</option>
                                                        {specialCollections.map(c => (
                                                            <option key={c.id} value={c.id}>
                                                                {c.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div className={styles.field}>
                                                    <Text variant="caption" colorVariant="muted">
                                                        Orario
                                                    </Text>
                                                    <div className={styles.timeRow}>
                                                        <input
                                                            className={styles.time}
                                                            type="time"
                                                            value={draftOverlay.start}
                                                            onChange={e =>
                                                                setDraftOverlay(p => ({
                                                                    ...p,
                                                                    start: e.target.value
                                                                }))
                                                            }
                                                            aria-label="Orario inizio"
                                                        />
                                                        <Text
                                                            variant="caption"
                                                            colorVariant="muted"
                                                        >
                                                            –
                                                        </Text>
                                                        <input
                                                            className={styles.time}
                                                            type="time"
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
                                                        {DAY_LABELS.map((label, day) => {
                                                            const active =
                                                                draftOverlay.days.includes(day);
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
                                                    const primaryWinner = getActiveWinner(
                                                        primaryRules,
                                                        isNowActive
                                                    );
                                                    const activeNow = isNowActive(rule);
                                                    const isEditing = editingId === rule.id;
                                                    const overlap = hasOverlap(rule, schedules);
                                                    const showOverlapAlert =
                                                        overlap &&
                                                        activeNow &&
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
                                                                data-active={activeNow}
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
                                                                        {activeNow && (
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
                                                                            <Text
                                                                                variant="caption"
                                                                                colorVariant="muted"
                                                                            >
                                                                                Contenuto
                                                                            </Text>
                                                                            <select
                                                                                className={
                                                                                    styles.select
                                                                                }
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
                                                                            >
                                                                                {specialCollections.map(
                                                                                    c => (
                                                                                        <option
                                                                                            key={
                                                                                                c.id
                                                                                            }
                                                                                            value={
                                                                                                c.id
                                                                                            }
                                                                                        >
                                                                                            {c.name}
                                                                                        </option>
                                                                                    )
                                                                                )}
                                                                            </select>
                                                                        </div>

                                                                        <div
                                                                            className={styles.field}
                                                                        >
                                                                            <Text
                                                                                variant="caption"
                                                                                colorVariant="muted"
                                                                            >
                                                                                Orario
                                                                            </Text>
                                                                            <div
                                                                                className={
                                                                                    styles.timeRow
                                                                                }
                                                                            >
                                                                                <input
                                                                                    className={
                                                                                        styles.time
                                                                                    }
                                                                                    type="time"
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
                                                                                <Text
                                                                                    variant="caption"
                                                                                    colorVariant="muted"
                                                                                >
                                                                                    –
                                                                                </Text>
                                                                                <input
                                                                                    className={
                                                                                        styles.time
                                                                                    }
                                                                                    type="time"
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
                                                                                {DAY_LABELS.map(
                                                                                    (
                                                                                        label,
                                                                                        day
                                                                                    ) => {
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
                                                                                    .length === 0 ||
                                                                                editDraft.start >=
                                                                                    editDraft.end
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
