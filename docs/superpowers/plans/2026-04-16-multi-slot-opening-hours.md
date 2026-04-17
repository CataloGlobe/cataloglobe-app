# Multi-Slot Opening Hours + Public Rendering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable multi-slot daily opening hours (e.g. lunch + dinner), move `hours_public` to `activities` table, and render hours on the public page.

**Architecture:** Database schema evolves `activity_hours` from 1-slot-per-day (UNIQUE on activity_id+day_of_week) to N-slots-per-day (UNIQUE on activity_id+day_of_week+slot_index). The `hours_public` flag moves from per-row in `activity_hours` to a single column on `activities`. The admin form gets a dynamic multi-slot editor. The edge function `resolve-public-catalog` conditionally fetches hours, and `PublicFooter` renders them.

**Tech Stack:** React 19, TypeScript 5.9, Supabase PostgreSQL, SCSS Modules, Framer Motion (not needed here)

---

## File Structure

### Files to CREATE
| File | Responsibility |
|------|----------------|
| `supabase/migrations/20260416120000_multi_slot_hours.sql` | Schema evolution: multi-slot hours + hours_public on activities |
| `src/components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours.tsx` | Public display component for opening hours |
| `src/components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours.module.scss` | Styles for public hours display |

### Files to MODIFY
| File | What changes |
|------|-------------|
| `src/types/activity-hours.ts` | Add `slot_index`, remove `hours_public` |
| `src/types/activity.ts` | Add `hours_public: boolean` to `V2Activity` |
| `src/services/supabase/activityHours.ts` | Update upsert (delete orphans + new conflict key), update list ordering |
| `src/services/supabase/activities.ts` | Add `updateActivityHoursPublic()` |
| `src/pages/Operativita/Attivita/tabs/hours-services/ActivityHoursForm.tsx` | Full rewrite: multi-slot form with validation |
| `src/pages/Operativita/Attivita/tabs/hours-services/ActivityHoursSection.tsx` | Remove toggle, update display for multi-slot |
| `src/pages/Operativita/Attivita/tabs/hours-services/ActivityHoursDrawer.tsx` | Pass `activity` for hours_public toggle |
| `src/pages/Operativita/Attivita/tabs/hours-services/HoursServices.module.scss` | New styles for multi-slot form + hours_public toggle |
| `supabase/functions/resolve-public-catalog/index.ts` | Conditionally fetch + return `opening_hours` |
| `src/pages/PublicCollectionPage/PublicCollectionPage.tsx` | Extract opening_hours from response, pass to CollectionView |
| `src/components/PublicCollectionView/CollectionView/CollectionView.tsx` | Add `openingHours` prop, pass to PublicFooter |
| `src/components/PublicCollectionView/PublicFooter/PublicFooter.tsx` | Render opening hours section |
| `src/components/PublicCollectionView/PublicFooter/PublicFooter.module.scss` | Styles for hours section in footer |
| `src/pages/Dashboard/Styles/Editor/StylePreview.tsx` | Add MOCK_OPENING_HOURS, pass to CollectionView |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260416120000_multi_slot_hours.sql`

- [ ] **Step 1: Create migration file with data cleanup + schema changes**

```sql
-- =====================================================
-- Migration: multi-slot opening hours + hours_public on activities
-- =====================================================

-- 1. Data cleanup: fix rows that would violate the new CHECK constraint
-- Rows with is_closed=false but NULL/incoherent times → mark as closed
UPDATE activity_hours
SET is_closed = true, opens_at = NULL, closes_at = NULL
WHERE is_closed = false
  AND (opens_at IS NULL OR closes_at IS NULL OR closes_at <= opens_at);

-- 2. Drop old UNIQUE constraint (activity_id, day_of_week)
ALTER TABLE activity_hours
  DROP CONSTRAINT IF EXISTS activity_hours_activity_id_day_of_week_key;

-- 3. Add slot_index column
ALTER TABLE activity_hours
  ADD COLUMN slot_index SMALLINT NOT NULL DEFAULT 0;

-- 4. Add new UNIQUE constraint (activity_id, day_of_week, slot_index)
ALTER TABLE activity_hours
  ADD CONSTRAINT activity_hours_activity_day_slot_key
  UNIQUE (activity_id, day_of_week, slot_index);

-- 5. Add CHECK constraint on slot_index range
ALTER TABLE activity_hours
  ADD CONSTRAINT activity_hours_slot_index_range
  CHECK (slot_index >= 0 AND slot_index < 10);

-- 6. Add CHECK constraint for time coherence
ALTER TABLE activity_hours
  ADD CONSTRAINT activity_hours_time_coherence
  CHECK (
    (is_closed = true AND opens_at IS NULL AND closes_at IS NULL)
    OR
    (is_closed = false AND opens_at IS NOT NULL AND closes_at IS NOT NULL AND closes_at > opens_at)
  );

-- 7. Add hours_public column to activities
ALTER TABLE activities
  ADD COLUMN hours_public BOOLEAN NOT NULL DEFAULT false;

-- 8. Backfill hours_public from activity_hours rows
UPDATE activities a
SET hours_public = true
WHERE EXISTS (
  SELECT 1 FROM activity_hours ah
  WHERE ah.activity_id = a.id AND ah.hours_public = true
);

-- 9. Drop hours_public column from activity_hours
ALTER TABLE activity_hours
  DROP COLUMN hours_public;
```

- [ ] **Step 2: Verify migration mentally against both scenarios**

**Clean DB (no data):** All ALTER TABLE statements are safe on empty tables. The UPDATE statements are no-ops. The DROP CONSTRAINT uses `IF EXISTS` for safety. Result: `activity_hours` has `slot_index` column, new UNIQUE + CHECK constraints, no `hours_public`. `activities` has `hours_public` column defaulting to false.

**Existing DB with data:** Step 1 cleans incoherent rows. Step 2 drops old UNIQUE. Step 3 adds `slot_index` with DEFAULT 0 (all existing rows get 0). Step 4 adds new UNIQUE — safe because all existing rows have slot_index=0 and the old UNIQUE ensured activity_id+day_of_week was unique. Steps 5-6 add CHECK constraints — safe after cleanup. Steps 7-9 move the flag.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260416120000_multi_slot_hours.sql
git commit -m "feat(db): multi-slot opening hours schema + hours_public on activities"
```

---

## Task 2: Type Updates

**Files:**
- Modify: `src/types/activity-hours.ts`
- Modify: `src/types/activity.ts`

- [ ] **Step 1: Update V2ActivityHours type**

Replace the full content of `src/types/activity-hours.ts` with:

```typescript
export interface V2ActivityHours {
    id: string;
    tenant_id: string;
    activity_id: string;
    day_of_week: number; // 0=Lun ... 6=Dom
    slot_index: number;
    opens_at: string | null; // "HH:MM"
    closes_at: string | null; // "HH:MM"
    is_closed: boolean;
    created_at: string;
    updated_at: string;
}
```

Changes: added `slot_index: number`, removed `hours_public: boolean`.

- [ ] **Step 2: Add hours_public to V2Activity**

In `src/types/activity.ts`, add `hours_public: boolean;` to the `V2Activity` interface, after `services_public: boolean;`:

```typescript
    services: string[];
    services_public: boolean;
    hours_public: boolean;
    qr_fg_color: string | null;
```

- [ ] **Step 3: Commit**

```bash
git add src/types/activity-hours.ts src/types/activity.ts
git commit -m "feat(types): add slot_index to V2ActivityHours, hours_public to V2Activity"
```

---

## Task 3: Service Layer Updates

**Files:**
- Modify: `src/services/supabase/activityHours.ts`
- Modify: `src/services/supabase/activities.ts`

- [ ] **Step 1: Update activityHours.ts**

Replace the full content of `src/services/supabase/activityHours.ts` with:

```typescript
import { supabase } from "@/services/supabase/client";
import type { V2ActivityHours } from "@/types/activity-hours";

export async function listActivityHours(
    activityId: string,
    tenantId: string
): Promise<V2ActivityHours[]> {
    const { data, error } = await supabase
        .from("activity_hours")
        .select("*")
        .eq("activity_id", activityId)
        .eq("tenant_id", tenantId)
        .order("day_of_week", { ascending: true })
        .order("slot_index", { ascending: true });

    if (error) throw error;
    return data ?? [];
}

export async function upsertActivityHours(
    tenantId: string,
    activityId: string,
    hours: Array<{
        day_of_week: number;
        slot_index: number;
        opens_at: string | null;
        closes_at: string | null;
        is_closed: boolean;
    }>
): Promise<V2ActivityHours[]> {
    // 1. Delete orphan rows not present in the incoming payload
    const keepKeys = new Set(
        hours.map(h => `${h.day_of_week}:${h.slot_index}`)
    );

    const { data: existing } = await supabase
        .from("activity_hours")
        .select("id, day_of_week, slot_index")
        .eq("activity_id", activityId)
        .eq("tenant_id", tenantId);

    if (existing) {
        const orphanIds = existing
            .filter(row => !keepKeys.has(`${row.day_of_week}:${row.slot_index}`))
            .map(row => row.id);

        if (orphanIds.length > 0) {
            const { error: deleteError } = await supabase
                .from("activity_hours")
                .delete()
                .in("id", orphanIds)
                .eq("tenant_id", tenantId);

            if (deleteError) throw deleteError;
        }
    }

    // 2. Upsert incoming rows
    const rows = hours.map(h => ({
        ...h,
        tenant_id: tenantId,
        activity_id: activityId,
        updated_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
        .from("activity_hours")
        .upsert(rows, { onConflict: "activity_id,day_of_week,slot_index" })
        .select();

    if (error) throw error;
    return data ?? [];
}
```

- [ ] **Step 2: Add updateActivityHoursPublic to activities.ts**

Add this function at the end of `src/services/supabase/activities.ts`, before the STORAGE section comment:

```typescript
export async function updateActivityHoursPublic(
    activityId: string,
    tenantId: string,
    hoursPublic: boolean
): Promise<void> {
    const { error } = await supabase
        .from("activities")
        .update({ hours_public: hoursPublic, updated_at: new Date().toISOString() })
        .eq("id", activityId)
        .eq("tenant_id", tenantId);

    if (error) throw error;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/services/supabase/activityHours.ts src/services/supabase/activities.ts
git commit -m "feat(services): multi-slot upsert with orphan cleanup, updateActivityHoursPublic"
```

---

## Task 4: ActivityHoursSection — Remove Toggle, Update Display

**Files:**
- Modify: `src/pages/Operativita/Attivita/tabs/hours-services/ActivityHoursSection.tsx`

- [ ] **Step 1: Rewrite ActivityHoursSection**

Replace the full content of `ActivityHoursSection.tsx` with:

```tsx
import React from "react";
import { IconEdit } from "@tabler/icons-react";
import { Card, Button } from "@/components/ui";
import Text from "@/components/ui/Text/Text";
import type { V2Activity } from "@/types/activity";
import type { V2ActivityHours } from "@/types/activity-hours";
import pageStyles from "../../ActivityDetailPage.module.scss";
import styles from "./HoursServices.module.scss";

const DAY_NAMES = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

interface ActivityHoursSectionProps {
    hours: V2ActivityHours[];
    activity: V2Activity;
    onEditRequest: () => void;
}

function formatDaySlots(slots: V2ActivityHours[]): React.ReactNode {
    if (slots.length === 0) {
        return <span className={styles.notConfigured}>&mdash;</span>;
    }
    if (slots[0].is_closed) {
        return <span className={styles.closedBadge}>Chiuso</span>;
    }
    const parts = slots
        .filter(s => !s.is_closed && s.opens_at && s.closes_at)
        .map(s => `${s.opens_at} – ${s.closes_at}`);
    if (parts.length === 0) {
        return <span className={styles.notConfigured}>&mdash;</span>;
    }
    return parts.join(" · ");
}

export const ActivityHoursSection: React.FC<ActivityHoursSectionProps> = ({
    hours,
    activity,
    onEditRequest
}) => {
    const hasHours = hours.length > 0;

    // Group by day_of_week
    const byDay = new Map<number, V2ActivityHours[]>();
    for (const h of hours) {
        const list = byDay.get(h.day_of_week) ?? [];
        list.push(h);
        byDay.set(h.day_of_week, list);
    }

    return (
        <Card className={pageStyles.card}>
            <div className={styles.cardHeader}>
                <div className={styles.headerLeft}>
                    <h3 className={styles.sectionTitle}>Orari di apertura</h3>
                    {activity.hours_public && (
                        <span className={styles.visibilityHint}>Visibili nella pagina pubblica</span>
                    )}
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<IconEdit size={16} />}
                    onClick={onEditRequest}
                >
                    Modifica
                </Button>
            </div>
            <div className={pageStyles.cardContent}>
                {!hasHours ? (
                    <Text variant="body-sm" colorVariant="muted">
                        Nessun orario configurato. Clicca "Modifica" per impostare gli orari.
                    </Text>
                ) : (
                    <table className={styles.hoursTable}>
                        <thead>
                            <tr>
                                <th className={styles.hoursTableHead}>Giorno</th>
                                <th className={styles.hoursTableHead}>Orario</th>
                            </tr>
                        </thead>
                        <tbody>
                            {DAY_NAMES.map((name, i) => (
                                <tr key={i} className={styles.hoursTableRow}>
                                    <td className={styles.hoursTableDay}>{name}</td>
                                    <td className={styles.hoursTableTime}>
                                        {formatDaySlots(byDay.get(i) ?? [])}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </Card>
    );
};
```

Key changes:
- Removed `tenantId` and `onSaved` props (no more inline toggle)
- Removed `hours_public` toggle and the `handlePublicToggle` callback
- Display now groups by `day_of_week` and shows multi-slot with `·` separator
- Shows "Visibili nella pagina pubblica" hint if `activity.hours_public` is true

- [ ] **Step 2: Commit**

```bash
git add src/pages/Operativita/Attivita/tabs/hours-services/ActivityHoursSection.tsx
git commit -m "feat(admin): update ActivityHoursSection for multi-slot display, remove toggle"
```

---

## Task 5: ActivityHoursForm — Multi-Slot Editor

**Files:**
- Modify: `src/pages/Operativita/Attivita/tabs/hours-services/ActivityHoursForm.tsx`

- [ ] **Step 1: Rewrite ActivityHoursForm with multi-slot support**

Replace the full content of `ActivityHoursForm.tsx`:

```tsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { X, Plus } from "lucide-react";
import { Switch } from "@/components/ui/Switch/Switch";
import { TimeInput } from "@/components/ui/Input/TimeInput";
import { upsertActivityHours } from "@/services/supabase/activityHours";
import { updateActivityHoursPublic } from "@/services/supabase/activities";
import type { V2Activity } from "@/types/activity";
import type { V2ActivityHours } from "@/types/activity-hours";
import { useToast } from "@/context/Toast/ToastContext";
import Text from "@/components/ui/Text/Text";
import formStyles from "./HoursServices.module.scss";

const DAY_NAMES = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const MAX_SLOTS_PER_DAY = 5;

/* ── Types ──────────────────────────────────────────────── */

interface TimeSlot {
    opens_at: string | null;
    closes_at: string | null;
}

interface DaySlots {
    is_closed: boolean;
    slots: TimeSlot[];
}

type DaysByIndex = Record<number, DaySlots>;

/* ── Validation ─────────────────────────────────────────── */

interface SlotError {
    day: number;
    slotIndex: number;
    message: string;
}

function timesToMinutes(time: string): number {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
}

function slotsOverlap(a: TimeSlot, b: TimeSlot): boolean {
    if (!a.opens_at || !a.closes_at || !b.opens_at || !b.closes_at) return false;
    const aStart = timesToMinutes(a.opens_at);
    const aEnd = timesToMinutes(a.closes_at);
    const bStart = timesToMinutes(b.opens_at);
    const bEnd = timesToMinutes(b.closes_at);
    return aStart < bEnd && bStart < aEnd;
}

function validateDays(days: DaysByIndex): SlotError[] {
    const errors: SlotError[] = [];
    for (let day = 0; day < 7; day++) {
        const dayData = days[day];
        if (dayData.is_closed) continue;

        for (let si = 0; si < dayData.slots.length; si++) {
            const slot = dayData.slots[si];
            const hasOpens = !!slot.opens_at;
            const hasCloses = !!slot.closes_at;

            if (!hasOpens || !hasCloses) {
                if (hasOpens || hasCloses) {
                    errors.push({
                        day,
                        slotIndex: si,
                        message: "Inserisci entrambi gli orari."
                    });
                }
                continue;
            }

            if (timesToMinutes(slot.closes_at!) <= timesToMinutes(slot.opens_at!)) {
                errors.push({
                    day,
                    slotIndex: si,
                    message: "L'orario di chiusura deve essere successivo all'apertura."
                });
                continue;
            }

            // Check overlap with subsequent slots in the same day
            for (let sj = si + 1; sj < dayData.slots.length; sj++) {
                if (slotsOverlap(slot, dayData.slots[sj])) {
                    errors.push({
                        day,
                        slotIndex: si,
                        message: "Le fasce orarie si sovrappongono."
                    });
                    break;
                }
            }
        }
    }
    return errors;
}

/* ── Helpers ─────────────────────────────────────────────── */

function buildDefaultDays(): DaysByIndex {
    const days: DaysByIndex = {};
    for (let i = 0; i < 7; i++) {
        days[i] = { is_closed: false, slots: [{ opens_at: null, closes_at: null }] };
    }
    return days;
}

function hoursToDays(hours: V2ActivityHours[]): DaysByIndex {
    const days = buildDefaultDays();

    // Group existing hours by day_of_week
    const byDay = new Map<number, V2ActivityHours[]>();
    for (const h of hours) {
        const list = byDay.get(h.day_of_week) ?? [];
        list.push(h);
        byDay.set(h.day_of_week, list);
    }

    for (const [dayIndex, rows] of byDay) {
        // Sort by slot_index
        rows.sort((a, b) => a.slot_index - b.slot_index);

        if (rows.length === 1 && rows[0].is_closed) {
            days[dayIndex] = { is_closed: true, slots: [] };
        } else {
            days[dayIndex] = {
                is_closed: false,
                slots: rows
                    .filter(r => !r.is_closed)
                    .map(r => ({ opens_at: r.opens_at, closes_at: r.closes_at }))
            };
            // Fallback: if all rows were closed but >1, treat as closed
            if (days[dayIndex].slots.length === 0) {
                days[dayIndex] = { is_closed: true, slots: [] };
            }
        }
    }

    return days;
}

function daysToPayload(
    days: DaysByIndex
): Array<{
    day_of_week: number;
    slot_index: number;
    opens_at: string | null;
    closes_at: string | null;
    is_closed: boolean;
}> {
    const result: Array<{
        day_of_week: number;
        slot_index: number;
        opens_at: string | null;
        closes_at: string | null;
        is_closed: boolean;
    }> = [];

    for (let day = 0; day < 7; day++) {
        const dayData = days[day];
        if (dayData.is_closed) {
            result.push({
                day_of_week: day,
                slot_index: 0,
                opens_at: null,
                closes_at: null,
                is_closed: true
            });
        } else {
            dayData.slots.forEach((slot, si) => {
                result.push({
                    day_of_week: day,
                    slot_index: si,
                    opens_at: slot.opens_at,
                    closes_at: slot.closes_at,
                    is_closed: false
                });
            });
        }
    }

    return result;
}

/* ── Component ──────────────────────────────────────────── */

type ActivityHoursFormProps = {
    formId: string;
    entityData: V2ActivityHours[];
    activity: V2Activity;
    tenantId: string;
    onSuccess: () => void;
    onSavingChange: (saving: boolean) => void;
};

export function ActivityHoursForm({
    formId,
    entityData,
    activity,
    tenantId,
    onSuccess,
    onSavingChange
}: ActivityHoursFormProps) {
    const { showToast } = useToast();
    const [days, setDays] = useState<DaysByIndex>(() => hoursToDays(entityData));
    const [hoursPublic, setHoursPublic] = useState(activity.hours_public);

    useEffect(() => {
        setDays(hoursToDays(entityData));
    }, [entityData]);

    useEffect(() => {
        setHoursPublic(activity.hours_public);
    }, [activity.hours_public]);

    const errors = useMemo(() => validateDays(days), [days]);
    const hasErrors = errors.length > 0;

    const getSlotError = useCallback(
        (day: number, slotIndex: number): string | undefined =>
            errors.find(e => e.day === day && e.slotIndex === slotIndex)?.message,
        [errors]
    );

    /* ── Day mutations ── */

    const updateDay = useCallback((dayIndex: number, patch: Partial<DaySlots>) => {
        setDays(prev => ({ ...prev, [dayIndex]: { ...prev[dayIndex], ...patch } }));
    }, []);

    const handleClosedToggle = useCallback((dayIndex: number, checked: boolean) => {
        if (checked) {
            updateDay(dayIndex, { is_closed: true, slots: [] });
        } else {
            updateDay(dayIndex, {
                is_closed: false,
                slots: [{ opens_at: null, closes_at: null }]
            });
        }
    }, [updateDay]);

    const updateSlot = useCallback(
        (dayIndex: number, slotIndex: number, patch: Partial<TimeSlot>) => {
            setDays(prev => {
                const day = prev[dayIndex];
                const newSlots = day.slots.map((s, i) =>
                    i === slotIndex ? { ...s, ...patch } : s
                );
                return { ...prev, [dayIndex]: { ...day, slots: newSlots } };
            });
        },
        []
    );

    const addSlot = useCallback((dayIndex: number) => {
        setDays(prev => {
            const day = prev[dayIndex];
            if (day.slots.length >= MAX_SLOTS_PER_DAY) return prev;
            return {
                ...prev,
                [dayIndex]: {
                    ...day,
                    slots: [...day.slots, { opens_at: null, closes_at: null }]
                }
            };
        });
    }, []);

    const removeSlot = useCallback((dayIndex: number, slotIndex: number) => {
        setDays(prev => {
            const day = prev[dayIndex];
            if (day.slots.length <= 1) {
                // Last slot → mark day as closed
                return { ...prev, [dayIndex]: { is_closed: true, slots: [] } };
            }
            return {
                ...prev,
                [dayIndex]: {
                    ...day,
                    slots: day.slots.filter((_, i) => i !== slotIndex)
                }
            };
        });
    }, []);

    /* ── Submit ── */

    const handleSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (hasErrors) return;

            onSavingChange(true);
            try {
                const payload = daysToPayload(days);
                await upsertActivityHours(tenantId, activity.id, payload);

                // Update hours_public flag separately
                if (hoursPublic !== activity.hours_public) {
                    try {
                        await updateActivityHoursPublic(activity.id, tenantId, hoursPublic);
                    } catch {
                        showToast({
                            message: "Orari salvati, ma errore nell'aggiornamento della visibilità.",
                            type: "warning"
                        });
                        onSuccess();
                        return;
                    }
                }

                showToast({ message: "Orari salvati con successo.", type: "success" });
                onSuccess();
            } catch (err: unknown) {
                const code = (err as { code?: string })?.code;
                if (code === "23514") {
                    showToast({
                        message: "Orari non validi, controlla i dati inseriti.",
                        type: "error"
                    });
                } else {
                    showToast({
                        message: "Errore nel salvataggio degli orari.",
                        type: "error"
                    });
                }
            } finally {
                onSavingChange(false);
            }
        },
        [days, hoursPublic, activity.id, activity.hours_public, tenantId, hasErrors, onSuccess, onSavingChange, showToast]
    );

    return (
        <form id={formId} onSubmit={handleSubmit}>
            <div className={formStyles.hoursFormLayout}>
                {/* ── Day rows ── */}
                {Array.from({ length: 7 }, (_, dayIndex) => {
                    const dayData = days[dayIndex];
                    return (
                        <div key={dayIndex} className={formStyles.dayRow}>
                            {/* Day name */}
                            <div className={formStyles.dayName}>
                                {DAY_NAMES[dayIndex]}
                            </div>

                            {/* Slots or closed label */}
                            <div className={formStyles.daySlotsCol}>
                                {dayData.is_closed ? (
                                    <span className={formStyles.closedLabel}>Chiuso</span>
                                ) : (
                                    <>
                                        {dayData.slots.map((slot, si) => {
                                            const error = getSlotError(dayIndex, si);
                                            return (
                                                <div key={si} className={formStyles.slotRow}>
                                                    <div className={formStyles.slotInputs}>
                                                        <TimeInput
                                                            value={slot.opens_at ?? ""}
                                                            onChange={e =>
                                                                updateSlot(dayIndex, si, {
                                                                    opens_at: e.target.value || null
                                                                })
                                                            }
                                                            aria-label={`${DAY_NAMES[dayIndex]} fascia ${si + 1} apertura`}
                                                        />
                                                        <span className={formStyles.slotSeparator}>–</span>
                                                        <TimeInput
                                                            value={slot.closes_at ?? ""}
                                                            onChange={e =>
                                                                updateSlot(dayIndex, si, {
                                                                    closes_at: e.target.value || null
                                                                })
                                                            }
                                                            aria-label={`${DAY_NAMES[dayIndex]} fascia ${si + 1} chiusura`}
                                                        />
                                                        <button
                                                            type="button"
                                                            className={formStyles.removeSlotBtn}
                                                            onClick={() => removeSlot(dayIndex, si)}
                                                            aria-label={`Rimuovi fascia ${si + 1} di ${DAY_NAMES[dayIndex]}`}
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                    {error && (
                                                        <span className={formStyles.slotError}>{error}</span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {dayData.slots.length < MAX_SLOTS_PER_DAY && (
                                            <button
                                                type="button"
                                                className={formStyles.addSlotBtn}
                                                onClick={() => addSlot(dayIndex)}
                                            >
                                                <Plus size={14} />
                                                Aggiungi fascia
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* Closed toggle */}
                            <div className={formStyles.dayClosedCol}>
                                <Switch
                                    checked={dayData.is_closed}
                                    onChange={checked => handleClosedToggle(dayIndex, checked)}
                                    aria-label={`${DAY_NAMES[dayIndex]} chiuso`}
                                />
                            </div>
                        </div>
                    );
                })}

                {/* ── Hours public toggle ── */}
                <div className={formStyles.hoursPublicSection}>
                    <div className={formStyles.hoursPublicRow}>
                        <div className={formStyles.hoursPublicText}>
                            <Text variant="body-sm" weight={500}>
                                Mostra orari sulla pagina pubblica
                            </Text>
                            <Text variant="body-xs" colorVariant="muted">
                                Se attivo, gli orari appaiono sull'hub visto dai clienti.
                            </Text>
                        </div>
                        <Switch
                            checked={hoursPublic}
                            onChange={setHoursPublic}
                        />
                    </div>
                </div>
            </div>
        </form>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Operativita/Attivita/tabs/hours-services/ActivityHoursForm.tsx
git commit -m "feat(admin): multi-slot hours form with validation and hours_public toggle"
```

---

## Task 6: Update Drawer and Tab Orchestrator

**Files:**
- Modify: `src/pages/Operativita/Attivita/tabs/hours-services/ActivityHoursDrawer.tsx`
- Modify: `src/pages/Operativita/Attivita/tabs/ActivityHoursServicesTab.tsx`

- [ ] **Step 1: Update ActivityHoursDrawer**

The drawer remains mostly the same but the subtitle changes to reflect multi-slot:

In `ActivityHoursDrawer.tsx`, no structural changes needed — the form already receives `activity` prop. The drawer is already correct. Keep as-is.

- [ ] **Step 2: Update ActivityHoursServicesTab**

In `ActivityHoursServicesTab.tsx`, update the `ActivityHoursSection` props. Remove `tenantId` and `onSaved` props since the section no longer has the toggle:

Replace lines 64-70:
```tsx
            <ActivityHoursSection
                hours={hours}
                activity={activity}
                tenantId={tenantId}
                onEditRequest={() => setIsHoursDrawerOpen(true)}
                onSaved={handleHoursSaved}
            />
```

With:
```tsx
            <ActivityHoursSection
                hours={hours}
                activity={activity}
                onEditRequest={() => setIsHoursDrawerOpen(true)}
            />
```

Also update `handleHoursSaved` to also reload the activity (since `hours_public` now lives on activity):

Replace lines 45-47:
```tsx
    const handleHoursSaved = useCallback(async () => {
        await loadHours();
    }, [loadHours]);
```

With:
```tsx
    const handleHoursSaved = useCallback(async () => {
        await Promise.all([loadHours(), onReload()]);
    }, [loadHours, onReload]);
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/Operativita/Attivita/tabs/ActivityHoursServicesTab.tsx
git commit -m "feat(admin): update tab orchestrator for multi-slot hours"
```

---

## Task 7: SCSS Updates for Multi-Slot Form

**Files:**
- Modify: `src/pages/Operativita/Attivita/tabs/hours-services/HoursServices.module.scss`

- [ ] **Step 1: Add multi-slot form styles**

Append the following to `HoursServices.module.scss` (keep all existing styles):

```scss
// ── Multi-slot day rows ─────────────────────────────────────────────────────

.dayRow {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid v.$gray-200;

  &:first-child {
    border-top: none;
  }
}

.dayName {
  width: 90px;
  flex-shrink: 0;
  font-weight: 500;
  font-size: 0.9375rem;
  color: v.$text-color;
  padding-top: 8px;
  white-space: nowrap;
}

.daySlotsCol {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.dayClosedCol {
  width: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 8px;
}

.closedLabel {
  font-size: 0.875rem;
  font-style: italic;
  color: v.$gray-400;
  padding: 8px 0;
}

.slotRow {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.slotInputs {
  display: flex;
  align-items: center;
  gap: 8px;
}

.slotSeparator {
  color: v.$gray-400;
  font-size: 0.875rem;
  flex-shrink: 0;
}

.removeSlotBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: v.$gray-400;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    background: v.$gray-100;
    color: v.$gray-600;
  }

  &:focus-visible {
    outline: 2px solid var(--color-focus-ring, v.$primary);
    outline-offset: 2px;
  }
}

.addSlotBtn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 0;
  border: none;
  background: transparent;
  color: var(--color-primary, v.$primary);
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s ease;

  &:hover {
    opacity: 0.75;
  }

  &:focus-visible {
    outline: 2px solid var(--color-focus-ring, v.$primary);
    outline-offset: 2px;
  }
}

.slotError {
  font-size: 0.75rem;
  color: var(--color-error, #ef4444);
  padding-left: 2px;
}

// ── Hours public toggle ─────────────────────────────────────────────────────

.hoursPublicSection {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid v.$gray-200;
}

.hoursPublicRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.hoursPublicText {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
```

- [ ] **Step 2: Remove old form table styles that are no longer used**

The old `.hoursFormTable`, `.hoursFormHead`, `.hoursFormRow`, `.hoursFormDay`, `.hoursFormCell`, `.hoursFormTimeCell` classes are no longer referenced by the new form. However, to be safe and avoid breaking anything, leave them in place — they'll be dead code but harmless. Only remove if a cleanup task explicitly requests it.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Operativita/Attivita/tabs/hours-services/HoursServices.module.scss
git commit -m "feat(admin): SCSS for multi-slot hours form"
```

---

## Task 8: Edge Function — Expose Opening Hours

**Files:**
- Modify: `supabase/functions/resolve-public-catalog/index.ts`

- [ ] **Step 1: Add hours_public to ACTIVITY_SELECT and fetch opening_hours**

In `supabase/functions/resolve-public-catalog/index.ts`:

1. Add `hours_public` to the `ACTIVITY_SELECT` string. Change line:

```typescript
        const ACTIVITY_SELECT =
            "id, tenant_id, name, slug, cover_image, status, inactive_reason, " +
            "address, street_number, postal_code, city, " +
            "instagram, instagram_public, facebook, facebook_public, " +
            "whatsapp, whatsapp_public, website, website_public, " +
            "phone, phone_public, email_public, email_public_visible, " +
            "google_review_url";
```

To:

```typescript
        const ACTIVITY_SELECT =
            "id, tenant_id, name, slug, cover_image, status, inactive_reason, " +
            "address, street_number, postal_code, city, " +
            "instagram, instagram_public, facebook, facebook_public, " +
            "whatsapp, whatsapp_public, website, website_public, " +
            "phone, phone_public, email_public, email_public_visible, " +
            "google_review_url, hours_public";
```

2. Add `hours_public` to the `business` object construction. After `google_review_url`:

```typescript
            google_review_url: activity.google_review_url ?? null,
            hours_public: activity.hours_public ?? false
```

3. After the `// 3. Resolve catalogs + tenant info in parallel` block, add an opening hours fetch. Find the `const [resolved, tenantInfo] = await Promise.all([` block and add a third parallel query:

Replace:
```typescript
        const [resolved, tenantInfo] = await Promise.all([
            resolveActivityCatalogs(supabase, activity.id, simulatedAt),
            supabase.rpc("get_tenant_public_info", { p_tenant_id: activity.tenant_id }),
        ]);
```

With:
```typescript
        const [resolved, tenantInfo, hoursResult] = await Promise.all([
            resolveActivityCatalogs(supabase, activity.id, simulatedAt),
            supabase.rpc("get_tenant_public_info", { p_tenant_id: activity.tenant_id }),
            activity.hours_public
                ? supabase
                      .from("activity_hours")
                      .select("day_of_week, slot_index, opens_at, closes_at, is_closed")
                      .eq("activity_id", activity.id)
                      .order("day_of_week", { ascending: true })
                      .order("slot_index", { ascending: true })
                : Promise.resolve({ data: null, error: null }),
        ]);

        const opening_hours = hoursResult.data ?? undefined;
```

4. Add `opening_hours` to all response objects. In the final success response:

Replace:
```typescript
        return new Response(
            JSON.stringify({
                business,
                tenantLogoUrl,
                resolved,
                canonical_slug: isAliasMatch ? activity.slug : null
            }),
```

With:
```typescript
        return new Response(
            JSON.stringify({
                business,
                tenantLogoUrl,
                resolved,
                canonical_slug: isAliasMatch ? activity.slug : null,
                ...(opening_hours ? { opening_hours } : {})
            }),
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/resolve-public-catalog/index.ts
git commit -m "feat(edge): expose opening_hours in resolve-public-catalog response"
```

---

## Task 9: Public Opening Hours Component

**Files:**
- Create: `src/components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours.tsx`
- Create: `src/components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours.module.scss`

- [ ] **Step 1: Create the type and component**

Create `src/components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours.tsx`:

```tsx
import styles from "./PublicOpeningHours.module.scss";

export type OpeningHoursEntry = {
    day_of_week: number;
    slot_index: number;
    opens_at: string | null;
    closes_at: string | null;
    is_closed: boolean;
};

type Props = {
    openingHours: OpeningHoursEntry[];
};

const DAY_NAMES = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

function formatDaySlots(slots: OpeningHoursEntry[]): string {
    if (slots.length === 0) return "—";
    if (slots[0].is_closed) return "Chiuso";
    const parts = slots
        .filter(s => !s.is_closed && s.opens_at && s.closes_at)
        .map(s => `${s.opens_at} – ${s.closes_at}`);
    return parts.length > 0 ? parts.join(" · ") : "—";
}

export default function PublicOpeningHours({ openingHours }: Props) {
    // Group by day_of_week
    const byDay = new Map<number, OpeningHoursEntry[]>();
    for (const entry of openingHours) {
        const list = byDay.get(entry.day_of_week) ?? [];
        list.push(entry);
        byDay.set(entry.day_of_week, list);
    }

    return (
        <div className={styles.hoursSection}>
            <h3 className={styles.hoursTitle}>Orari</h3>
            <dl className={styles.hoursList}>
                {DAY_NAMES.map((name, i) => {
                    const slots = byDay.get(i) ?? [];
                    const isClosed = slots.length > 0 && slots[0].is_closed;
                    return (
                        <div key={i} className={styles.hoursRow}>
                            <dt className={styles.hoursDay}>{name}</dt>
                            <dd
                                className={`${styles.hoursTime} ${
                                    isClosed ? styles.hoursTimeClosed : ""
                                }`}
                            >
                                {formatDaySlots(slots)}
                            </dd>
                        </div>
                    );
                })}
            </dl>
        </div>
    );
}
```

- [ ] **Step 2: Create the SCSS module**

Create `src/components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours.module.scss`:

```scss
/* ─────────────────────────────────────────────────────────
   PublicOpeningHours
   Orari di apertura — sezione nel footer pubblico
───────────────────────────────────────────────────────── */

.hoursSection {
  width: 100%;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.hoursTitle {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--pub-text-muted);
  font-family: var(--pub-font-family, sans-serif);
  margin: 0;
}

.hoursList {
  width: 100%;
  margin: 0;
  padding: 0;
}

.hoursRow {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 0.25rem 0;
  border-bottom: 1px solid var(--pub-border);
  opacity: 0.85;

  &:last-child {
    border-bottom: none;
  }
}

.hoursDay {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--pub-text);
  font-family: var(--pub-font-family, sans-serif);
}

.hoursTime {
  font-size: 0.8125rem;
  color: var(--pub-text-secondary);
  font-family: var(--pub-font-family, sans-serif);
  text-align: right;
}

.hoursTimeClosed {
  font-style: italic;
  color: var(--pub-text-muted);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours.tsx src/components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours.module.scss
git commit -m "feat(public): PublicOpeningHours component"
```

---

## Task 10: Integrate Opening Hours in Public Page Pipeline

**Files:**
- Modify: `src/pages/PublicCollectionPage/PublicCollectionPage.tsx`
- Modify: `src/components/PublicCollectionView/CollectionView/CollectionView.tsx`
- Modify: `src/components/PublicCollectionView/PublicFooter/PublicFooter.tsx`
- Modify: `src/components/PublicCollectionView/PublicFooter/PublicFooter.module.scss`

- [ ] **Step 1: Extract opening_hours from edge function response in PublicCollectionPage**

In `src/pages/PublicCollectionPage/PublicCollectionPage.tsx`:

1. Import the type at the top:

```typescript
import type { OpeningHoursEntry } from "@/components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours";
```

2. Add `opening_hours` to the `PageState` "ready" variant. Change lines 199-204:

```typescript
    | {
          status: "ready";
          business: PublicBusiness;
          resolved: ResolvedCollections;
          tenantLogoUrl: string | null;
      }
```

To:

```typescript
    | {
          status: "ready";
          business: PublicBusiness;
          resolved: ResolvedCollections;
          tenantLogoUrl: string | null;
          openingHours?: OpeningHoursEntry[];
      }
```

3. Extract `opening_hours` from the response. Change lines 255-261:

```typescript
                const { business, tenantLogoUrl, resolved, subscription_inactive, canonical_slug } = data as {
                    business: PublicBusiness;
                    tenantLogoUrl: string | null;
                    resolved: ResolvedCollections;
                    subscription_inactive?: boolean;
                    canonical_slug?: string | null;
                };
```

To:

```typescript
                const { business, tenantLogoUrl, resolved, subscription_inactive, canonical_slug, opening_hours } = data as {
                    business: PublicBusiness;
                    tenantLogoUrl: string | null;
                    resolved: ResolvedCollections;
                    subscription_inactive?: boolean;
                    canonical_slug?: string | null;
                    opening_hours?: OpeningHoursEntry[];
                };
```

4. Pass `openingHours` into state. Change lines 296-301:

```typescript
                setState({
                    status: "ready",
                    business,
                    resolved,
                    tenantLogoUrl
                });
```

To:

```typescript
                setState({
                    status: "ready",
                    business,
                    resolved,
                    tenantLogoUrl,
                    openingHours: opening_hours
                });
```

5. Destructure `openingHours` from state on line 402. Change:

```typescript
    const { business, resolved, tenantLogoUrl } = state;
```

To:

```typescript
    const { business, resolved, tenantLogoUrl, openingHours } = state;
```

6. Pass `openingHours` to `CollectionView`. Add after `socialLinks` prop (around line 499):

```typescript
                openingHours={openingHours}
```

- [ ] **Step 2: Add openingHours prop to CollectionView**

In `src/components/PublicCollectionView/CollectionView/CollectionView.tsx`:

1. Import the type at the top (add to imports section):

```typescript
import type { OpeningHoursEntry } from "../PublicOpeningHours/PublicOpeningHours";
```

2. Add to `Props` type (after `socialLinks`):

```typescript
    /** Orari di apertura dell'attività (opzionale, mostrati nel footer). */
    openingHours?: OpeningHoursEntry[];
```

3. Destructure from props in the component function. Find where `socialLinks` is destructured and add `openingHours` next to it.

4. Pass to `PublicFooter`. Change the footer rendering:

```tsx
{!emptyState && <PublicFooter socialLinks={socialLinks} activityId={activityId} openingHours={openingHours} />}
```

- [ ] **Step 3: Add openingHours to PublicFooter**

In `src/components/PublicCollectionView/PublicFooter/PublicFooter.tsx`:

1. Import `PublicOpeningHours` and its type:

```typescript
import PublicOpeningHours from "../PublicOpeningHours/PublicOpeningHours";
import type { OpeningHoursEntry } from "../PublicOpeningHours/PublicOpeningHours";
```

2. Add to `Props`:

```typescript
type Props = {
    socialLinks?: SocialLinks;
    activityId?: string;
    openingHours?: OpeningHoursEntry[];
};
```

3. Destructure in component:

```typescript
export default function PublicFooter({ socialLinks, activityId, openingHours }: Props) {
```

4. Render `PublicOpeningHours` above the social row (right after `<footer className={styles.footer}>`):

```tsx
        <footer className={styles.footer}>
            {/* Opening hours — visible only if data exists */}
            {openingHours && openingHours.length > 0 && (
                <PublicOpeningHours openingHours={openingHours} />
            )}

            {/* Social icons — visibili solo se configurati e pubblici */}
            {visibleSocials.length > 0 && (
```

- [ ] **Step 4: Add separator style to PublicFooter SCSS**

In `src/components/PublicCollectionView/PublicFooter/PublicFooter.module.scss`, no changes needed — the footer already has `gap: 1rem` between children which will naturally separate the hours section from social icons.

- [ ] **Step 5: Commit**

```bash
git add src/pages/PublicCollectionPage/PublicCollectionPage.tsx src/components/PublicCollectionView/CollectionView/CollectionView.tsx src/components/PublicCollectionView/PublicFooter/PublicFooter.tsx
git commit -m "feat(public): integrate opening hours in public page pipeline"
```

---

## Task 11: StylePreview Mock Data

**Files:**
- Modify: `src/pages/Dashboard/Styles/Editor/StylePreview.tsx`

- [ ] **Step 1: Add MOCK_OPENING_HOURS and pass to CollectionView**

In `StylePreview.tsx`:

1. Import the type:

```typescript
import type { OpeningHoursEntry } from "@/components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours";
```

2. Add mock data after `MOCK_SECTION_GROUPS` (before `NAV_SHAPE_MAP`):

```typescript
const MOCK_OPENING_HOURS: OpeningHoursEntry[] = [
    { day_of_week: 0, slot_index: 0, opens_at: "09:00", closes_at: "13:00", is_closed: false },
    { day_of_week: 0, slot_index: 1, opens_at: "19:00", closes_at: "23:00", is_closed: false },
    { day_of_week: 1, slot_index: 0, opens_at: "09:00", closes_at: "13:00", is_closed: false },
    { day_of_week: 1, slot_index: 1, opens_at: "19:00", closes_at: "23:00", is_closed: false },
    { day_of_week: 2, slot_index: 0, opens_at: "09:00", closes_at: "13:00", is_closed: false },
    { day_of_week: 2, slot_index: 1, opens_at: "19:00", closes_at: "23:00", is_closed: false },
    { day_of_week: 3, slot_index: 0, opens_at: "09:00", closes_at: "13:00", is_closed: false },
    { day_of_week: 3, slot_index: 1, opens_at: "19:00", closes_at: "23:00", is_closed: false },
    { day_of_week: 4, slot_index: 0, opens_at: "09:00", closes_at: "13:00", is_closed: false },
    { day_of_week: 4, slot_index: 1, opens_at: "19:00", closes_at: "23:00", is_closed: false },
    { day_of_week: 5, slot_index: 0, opens_at: "12:00", closes_at: "15:00", is_closed: false },
    { day_of_week: 5, slot_index: 1, opens_at: "19:00", closes_at: "23:30", is_closed: false },
    { day_of_week: 6, slot_index: 0, opens_at: null, closes_at: null, is_closed: true },
];
```

3. Add `openingHours` prop to the `CollectionView` call (after `activityAddress`):

```typescript
                            openingHours={MOCK_OPENING_HOURS}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Dashboard/Styles/Editor/StylePreview.tsx
git commit -m "feat(preview): add mock opening hours to style preview"
```

---

## Task 12: Cleanup and Verification

**Files:**
- Various (grep only, no modifications expected)

- [ ] **Step 1: Grep for residual hours_public references on activity_hours**

Run:
```bash
grep -rn "hours_public" src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules"
```

Expected: references only in:
- `src/types/activity.ts` (on V2Activity)
- `src/services/supabase/activities.ts` (updateActivityHoursPublic)
- `src/pages/Operativita/Attivita/tabs/hours-services/ActivityHoursForm.tsx` (toggle)
- `src/pages/Operativita/Attivita/tabs/hours-services/ActivityHoursSection.tsx` (hint display)
- `src/pages/PublicCollectionPage/PublicCollectionPage.tsx` (NOT expected — it comes from edge fn response)

If any references to `hours_public` exist in the OLD pattern (on activity_hours type or in the old toggle flow), fix them.

- [ ] **Step 2: Verify no broken imports**

Run:
```bash
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 3: Verify app compiles**

Run:
```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit any fixes**

If Step 1-3 required changes:
```bash
git add -A
git commit -m "fix: cleanup residual hours_public references and type errors"
```

---

## Execution Notes

**What NOT to touch** (per spec):
- `src/services/supabase/scheduleResolver.ts` — not related
- `supabase/functions/_shared/scheduleResolver.ts` — not related
- Any timezone logic — out of scope (Phase 3)
- Any "open now" logic — out of scope (Phase 3)
- `activity_closures` table — out of scope (Phase 2)
- `CLAUDE.md` — do not modify

**Key implementation details:**
- `day_of_week` convention: 0=Monday...6=Sunday (ISO 8601, NOT JS Date where 0=Sunday)
- `hours_public` moved from per-row on `activity_hours` to single column on `activities`
- Form submit saves hours first, then flag separately — if flag update fails, hours are still saved
- Edge function only queries `activity_hours` if `hours_public=true` (optimization)
- `opening_hours` field is `undefined` (not empty array) when not applicable — allows distinguishing "not configured" from "all days closed"
