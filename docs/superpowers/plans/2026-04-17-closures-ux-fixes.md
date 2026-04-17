# Closures UX Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the extraordinary closures feature with the approved mockups: schema evolution to JSONB slots + end_date, admin card list redesign, multi-slot form, stacked public layout.

**Architecture:** DB schema evolves `activity_closures` from scalar `opens_at`/`closes_at` to JSONB `slots` array + `end_date` range. Admin section moves from table to card list with danger/warning icons and badges. Form gains multi-slot (identical pattern to Phase 1 ActivityHoursForm) and end_date field. Public footer switches to CSS Grid stacked layout per day and updates closure rendering for the new schema.

**Tech Stack:** React 19, TypeScript 5.9 strict, Supabase PostgreSQL + JSONB, SCSS Modules (`@use "@/styles/variables" as v;`), Switch + TimeInput UI components, Lucide React icons

**DO NOT touch:** ActivityHoursForm, scheduleResolver.ts, weekly hours display logic (Phase 1 code).

---

## File Structure

### Files to CREATE
| File | Responsibility |
|------|----------------|
| `supabase/migrations/20260417100000_activity_closures_v2.sql` | Schema evolution: JSONB slots, end_date, updated constraints |

### Files to MODIFY
| File | What changes |
|------|-------------|
| `src/types/activity-closures.ts` | Add `ClosureSlot`, update `V2ActivityClosure` (slots, end_date, remove opens_at/closes_at) |
| `src/services/supabase/activityClosures.ts` | Update payload types (slots instead of opens_at/closes_at, add end_date), handle 23514 |
| `src/pages/Operativita/Attivita/tabs/hours-services/ActivityClosuresSection.tsx` | Table → card list with icons, badges, sorting |
| `src/pages/Operativita/Attivita/tabs/hours-services/ActivityClosureForm.tsx` | Multi-slot editor + end_date field + serialization |
| `src/pages/Operativita/Attivita/tabs/hours-services/ActivityClosureDeleteDrawer.tsx` | Show range in title when end_date present |
| `src/pages/Operativita/Attivita/tabs/hours-services/HoursServices.module.scss` | Add card list styles, remove/replace closure form time styles |
| `src/components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours.tsx` | Stacked slots layout + updated UpcomingClosure type |
| `src/components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours.module.scss` | Grid layout for hours rows, stacked closure slots |
| `supabase/functions/resolve-public-catalog/index.ts` | Updated select/filter for new schema |
| `src/pages/Dashboard/Styles/Editor/StylePreview.tsx` | Updated MOCK_UPCOMING_CLOSURES with new schema |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260417100000_activity_closures_v2.sql`

- [ ] **Step 1: Create migration file**

```sql
-- 20260417100000_activity_closures_v2.sql
-- Evolve activity_closures: JSONB slots, end_date range, drop scalar opens_at/closes_at

BEGIN;

-- 1. Add new columns first (before backfill, before dropping old ones)
ALTER TABLE activity_closures ADD COLUMN IF NOT EXISTS slots JSONB NULL;
ALTER TABLE activity_closures ADD COLUMN IF NOT EXISTS end_date DATE NULL;

-- 2. Backfill slots from existing opens_at/closes_at (only for special-hours rows)
UPDATE activity_closures
SET slots = jsonb_build_array(
    jsonb_build_object(
        'opens_at', to_char(opens_at, 'HH24:MI'),
        'closes_at', to_char(closes_at, 'HH24:MI')
    )
)
WHERE is_closed = false
  AND opens_at IS NOT NULL
  AND closes_at IS NOT NULL;

-- 3. Drop old time-coherence constraint
ALTER TABLE activity_closures DROP CONSTRAINT IF EXISTS activity_closures_time_coherence;

-- 4. Drop old scalar columns
ALTER TABLE activity_closures DROP COLUMN IF EXISTS opens_at;
ALTER TABLE activity_closures DROP COLUMN IF EXISTS closes_at;

-- 5. Add new constraints
ALTER TABLE activity_closures
    ADD CONSTRAINT activity_closures_slots_coherence CHECK (
        (is_closed = true AND slots IS NULL)
        OR
        (is_closed = false AND slots IS NOT NULL AND jsonb_array_length(slots) > 0)
    );

ALTER TABLE activity_closures
    ADD CONSTRAINT activity_closures_date_range CHECK (
        end_date IS NULL OR end_date > closure_date
    );

ALTER TABLE activity_closures
    ADD CONSTRAINT activity_closures_range_must_be_closed CHECK (
        end_date IS NULL OR is_closed = true
    );

COMMIT;
```

- [ ] **Step 2: ⚑ CHECKPOINT — Show the SQL above to the user and wait for explicit approval before committing.**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260417100000_activity_closures_v2.sql
git commit -m "feat(db): evolve activity_closures to JSONB slots + end_date range

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Types + Service Layer

**Files:**
- Modify: `src/types/activity-closures.ts`
- Modify: `src/services/supabase/activityClosures.ts`

- [ ] **Step 1: Replace `src/types/activity-closures.ts` entirely**

```typescript
export interface ClosureSlot {
    opens_at: string; // "HH:MM"
    closes_at: string; // "HH:MM"
}

export interface V2ActivityClosure {
    id: string;
    tenant_id: string;
    activity_id: string;
    closure_date: string;       // "YYYY-MM-DD"
    end_date: string | null;    // "YYYY-MM-DD" or null
    label: string | null;
    is_closed: boolean;
    slots: ClosureSlot[] | null; // null if is_closed=true, array if is_closed=false
    created_at: string;
    updated_at: string;
}
```

- [ ] **Step 2: Replace `src/services/supabase/activityClosures.ts` entirely**

```typescript
import { supabase } from "./client";
import type { V2ActivityClosure, ClosureSlot } from "@/types/activity-closures";

export async function listActivityClosures(
    activityId: string,
    tenantId: string
): Promise<V2ActivityClosure[]> {
    const { data, error } = await supabase
        .from("activity_closures")
        .select("*")
        .eq("activity_id", activityId)
        .eq("tenant_id", tenantId)
        .order("closure_date", { ascending: true });
    if (error) throw error;
    return data ?? [];
}

export async function getActivityClosure(
    id: string,
    tenantId: string
): Promise<V2ActivityClosure> {
    const { data, error } = await supabase
        .from("activity_closures")
        .select("*")
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
    if (error) throw error;
    if (!data) {
        const notFound = new Error("Chiusura non trovata");
        (notFound as unknown as { code: string }).code = "PGRST116";
        throw notFound;
    }
    return data;
}

type ClosurePayload = {
    activity_id: string;
    closure_date: string;
    end_date: string | null;
    label: string | null;
    is_closed: boolean;
    slots: ClosureSlot[] | null;
};

export async function createActivityClosure(
    tenantId: string,
    payload: ClosurePayload
): Promise<V2ActivityClosure> {
    const { data, error } = await supabase
        .from("activity_closures")
        .insert({ ...payload, tenant_id: tenantId })
        .select()
        .single();
    if (error) throw error;
    return data;
}

type ClosureUpdatePayload = {
    closure_date: string;
    end_date: string | null;
    label: string | null;
    is_closed: boolean;
    slots: ClosureSlot[] | null;
};

export async function updateActivityClosure(
    id: string,
    tenantId: string,
    payload: ClosureUpdatePayload
): Promise<V2ActivityClosure> {
    const { data, error } = await supabase
        .from("activity_closures")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deleteActivityClosure(
    id: string,
    tenantId: string
): Promise<void> {
    const { error } = await supabase
        .from("activity_closures")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId);
    if (error) throw error;
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -50
```

Expected: errors in `ActivityClosureForm.tsx` (references old `opens_at`/`closes_at`), `ActivityClosuresSection.tsx` (same), `PublicOpeningHours.tsx` (old UpcomingClosure shape). These will be fixed in Tasks 3 and 4.

- [ ] **Step 4: Commit**

```bash
git add src/types/activity-closures.ts src/services/supabase/activityClosures.ts
git commit -m "feat(types+service): update activity_closures to JSONB slots + end_date

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Admin UI — Section Card Redesign + Form Rewrite

**Files:**
- Modify: `src/pages/Operativita/Attivita/tabs/hours-services/HoursServices.module.scss` (append new styles)
- Modify: `src/pages/Operativita/Attivita/tabs/hours-services/ActivityClosuresSection.tsx`
- Modify: `src/pages/Operativita/Attivita/tabs/hours-services/ActivityClosureForm.tsx`
- Modify: `src/pages/Operativita/Attivita/tabs/hours-services/ActivityClosureDeleteDrawer.tsx`

- [ ] **Step 1: Append new SCSS classes to `HoursServices.module.scss`** (add at end of file, do not remove anything)

```scss
// ── Closure card list ────────────────────────────────────────────────────────

.closureCardList {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.closureCardItem {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid v.$gray-100;
  cursor: pointer;
  transition: background 0.1s ease;
  border-radius: 8px;
  padding-left: 6px;
  padding-right: 6px;
  margin: 0 -6px;

  &:first-child {
    border-top: none;
  }

  &:hover {
    background: v.$gray-50;
  }
}

.closureCardItemPast {
  opacity: 0.55;
}

.closureIconWrap {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.closureIconWrapDanger {
  background: #fee2e2;
  color: v.$error;
}

.closureIconWrapWarning {
  background: #fef3c7;
  color: v.$warning;
}

.closureCardBody {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.closureCardTitle {
  font-size: 0.9375rem;
  font-weight: 500;
  color: v.$text-color;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.closureCardSubtitle {
  font-size: 0.8125rem;
  color: v.$gray-500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.closureCardRight {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.closureBadge {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: 100px;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

.closureBadgeClosed {
  background: #fee2e2;
  color: v.$error;
}

.closureBadgeSpecial {
  background: #fef3c7;
  color: v.$warning;
}

.closureBadgePast {
  background: v.$gray-100;
  color: v.$gray-500;
}

.closuresEmptyState {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 2rem 0;
  text-align: center;
}
```

Note: add `v.$gray-50: #f9fafb` and `v.$gray-500: #6b7280` only if they exist in `_variables.scss`. If they don't exist, use `#f9fafb` and `#6b7280` as literal values instead of variables. Before writing this SCSS, **read `src/styles/_variables.scss`** to check which gray variables actually exist.

- [ ] **Step 2: Verify available SCSS variables**

Read `/Users/lorenzo_calzi/Lavoro/Progetti/Personali/CataloGlobe/src/styles/_variables.scss` and note which gray variables exist (v.$gray-50, v.$gray-500, etc.). Use only variables that actually exist; replace others with hardcoded hex values.

- [ ] **Step 3: Replace `ActivityClosuresSection.tsx` entirely**

```tsx
import React, { useMemo } from "react";
import { IconClock, IconX, IconPlus } from "@tabler/icons-react";
import { Card, Button } from "@/components/ui";
import Text from "@/components/ui/Text/Text";
import type { V2ActivityClosure, ClosureSlot } from "@/types/activity-closures";
import pageStyles from "../../ActivityDetailPage.module.scss";
import styles from "./HoursServices.module.scss";

// ── Date helpers ─────────────────────────────────────────────────────────────

const IT_MONTH_LONG = [
    "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
    "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"
];
const IT_MONTH_SHORT = [
    "gen", "feb", "mar", "apr", "mag", "giu",
    "lug", "ago", "set", "ott", "nov", "dic"
];

function parseDateStr(s: string): Date {
    return new Date(s + "T12:00:00");
}

function formatDateLong(dateStr: string): string {
    const d = parseDateStr(dateStr);
    return `${d.getDate()} ${IT_MONTH_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

function formatDateShort(dateStr: string): string {
    const d = parseDateStr(dateStr);
    return `${d.getDate()} ${IT_MONTH_SHORT[d.getMonth()]}`;
}

function formatSlots(slots: ClosureSlot[]): string {
    return slots.map(s => `${s.opens_at} – ${s.closes_at}`).join(", ");
}

function buildSubtitle(c: V2ActivityClosure): string {
    let dateStr: string;
    if (c.end_date) {
        dateStr = `${formatDateShort(c.closure_date)} – ${formatDateShort(c.end_date)} ${parseDateStr(c.closure_date).getFullYear()}`;
    } else {
        dateStr = formatDateLong(c.closure_date);
    }
    if (c.is_closed) {
        return `${dateStr} · Chiusura totale`;
    }
    const slotsStr = c.slots ? formatSlots(c.slots) : "";
    return `${dateStr} · Orario ridotto: ${slotsStr}`;
}

function getTodayISO(): string {
    return new Date().toISOString().slice(0, 10);
}

function isPast(c: V2ActivityClosure, today: string): boolean {
    return (c.end_date ?? c.closure_date) < today;
}

// ── Component ────────────────────────────────────────────────────────────────

interface ActivityClosuresSectionProps {
    closures: V2ActivityClosure[];
    onCreateRequest: () => void;
    onEditRequest: (closure: V2ActivityClosure) => void;
    onDeleteRequest: (closure: V2ActivityClosure) => void;
}

export const ActivityClosuresSection: React.FC<ActivityClosuresSectionProps> = ({
    closures,
    onCreateRequest,
    onEditRequest,
    onDeleteRequest,
}) => {
    const today = getTodayISO();

    const sorted = useMemo(() => {
        const future = closures.filter(c => !isPast(c, today));
        const past = closures.filter(c => isPast(c, today));
        future.sort((a, b) => a.closure_date.localeCompare(b.closure_date));
        past.sort((a, b) => b.closure_date.localeCompare(a.closure_date));
        return [...future, ...past];
    }, [closures, today]);

    return (
        <Card className={pageStyles.card}>
            <div className={styles.cardHeader}>
                <div className={styles.headerLeft}>
                    <h3 className={styles.sectionTitle}>Chiusure straordinarie</h3>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<IconPlus size={16} />}
                    onClick={onCreateRequest}
                >
                    Nuova chiusura
                </Button>
            </div>
            <div className={pageStyles.cardContent}>
                {sorted.length === 0 ? (
                    <div className={styles.closuresEmptyState}>
                        <Text variant="body-sm" colorVariant="muted">
                            Nessuna chiusura programmata.
                        </Text>
                        <Button variant="ghost" size="sm" leftIcon={<IconPlus size={14} />} onClick={onCreateRequest}>
                            Nuova chiusura
                        </Button>
                    </div>
                ) : (
                    <div className={styles.closureCardList}>
                        {sorted.map((c) => {
                            const past = isPast(c, today);
                            const title = c.label ?? (c.is_closed ? "Chiusura" : "Orario speciale");
                            return (
                                <div
                                    key={c.id}
                                    className={`${styles.closureCardItem}${past ? ` ${styles.closureCardItemPast}` : ""}`}
                                    onClick={() => onEditRequest(c)}
                                >
                                    {/* Icon */}
                                    <div className={`${styles.closureIconWrap} ${c.is_closed ? styles.closureIconWrapDanger : styles.closureIconWrapWarning}`}>
                                        {c.is_closed
                                            ? <IconX size={18} />
                                            : <IconClock size={18} />
                                        }
                                    </div>

                                    {/* Body */}
                                    <div className={styles.closureCardBody}>
                                        <span className={styles.closureCardTitle}>{title}</span>
                                        <span className={styles.closureCardSubtitle}>{buildSubtitle(c)}</span>
                                    </div>

                                    {/* Right: badge + delete */}
                                    <div className={styles.closureCardRight}>
                                        {past ? (
                                            <span className={`${styles.closureBadge} ${styles.closureBadgePast}`}>
                                                Passata
                                            </span>
                                        ) : c.is_closed ? (
                                            <span className={`${styles.closureBadge} ${styles.closureBadgeClosed}`}>
                                                Chiuso
                                            </span>
                                        ) : (
                                            <span className={`${styles.closureBadge} ${styles.closureBadgeSpecial}`}>
                                                Orario speciale
                                            </span>
                                        )}
                                        <button
                                            type="button"
                                            className={`${styles.closuresActionBtn} ${styles.closuresActionBtnDanger}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDeleteRequest(c);
                                            }}
                                            aria-label="Elimina"
                                        >
                                            <IconX size={14} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </Card>
    );
};
```

- [ ] **Step 4: Replace `ActivityClosureForm.tsx` entirely**

```tsx
import React, { useState, useMemo, useCallback } from "react";
import { X, Plus } from "lucide-react";
import { Switch } from "@/components/ui/Switch/Switch";
import { TimeInput } from "@/components/ui/Input/TimeInput";
import { createActivityClosure, updateActivityClosure } from "@/services/supabase/activityClosures";
import { useToast } from "@/context/Toast/ToastContext";
import type { V2ActivityClosure, ClosureSlot } from "@/types/activity-closures";
import Text from "@/components/ui/Text/Text";
import styles from "./HoursServices.module.scss";

const MAX_SLOTS = 5;

// ── Validation helpers ────────────────────────────────────────────────────────

function timesToMinutes(t: string): number {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
}

function slotsOverlap(a: ClosureSlot, b: ClosureSlot): boolean {
    const aS = timesToMinutes(a.opens_at), aE = timesToMinutes(a.closes_at);
    const bS = timesToMinutes(b.opens_at), bE = timesToMinutes(b.closes_at);
    return aS < bE && bS < aE;
}

type SlotDraft = { opens_at: string | null; closes_at: string | null };
type SlotError = { index: number; message: string };

function validateSlots(slots: SlotDraft[]): SlotError[] {
    const errors: SlotError[] = [];
    for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        const hasOpen = !!s.opens_at;
        const hasClose = !!s.closes_at;
        if (!hasOpen || !hasClose) {
            if (hasOpen || hasClose) {
                errors.push({ index: i, message: "Inserisci entrambi gli orari." });
            }
            continue;
        }
        if (timesToMinutes(s.closes_at!) <= timesToMinutes(s.opens_at!)) {
            errors.push({ index: i, message: "L'orario di chiusura deve essere successivo all'apertura." });
            continue;
        }
        for (let j = i + 1; j < slots.length; j++) {
            const b = slots[j];
            if (b.opens_at && b.closes_at &&
                slotsOverlap(
                    { opens_at: s.opens_at!, closes_at: s.closes_at! },
                    { opens_at: b.opens_at, closes_at: b.closes_at }
                )
            ) {
                errors.push({ index: i, message: "Le fasce orarie si sovrappongono." });
                break;
            }
        }
    }
    return errors;
}

// ── Props ────────────────────────────────────────────────────────────────────

interface ActivityClosureFormProps {
    formId: string;
    mode: "create" | "edit";
    activityId: string;
    entityData?: V2ActivityClosure;
    tenantId: string;
    onSuccess: () => void | Promise<void>;
    onSavingChange: (saving: boolean) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export const ActivityClosureForm: React.FC<ActivityClosureFormProps> = ({
    formId,
    mode,
    activityId,
    entityData,
    tenantId,
    onSuccess,
    onSavingChange,
}) => {
    const { showToast } = useToast();

    const [closureDate, setClosureDate] = useState(entityData?.closure_date ?? "");
    const [endDate, setEndDate] = useState(entityData?.end_date ?? "");
    const [label, setLabel] = useState(entityData?.label ?? "");
    const [isClosed, setIsClosed] = useState(entityData?.is_closed ?? true);
    const [slots, setSlots] = useState<SlotDraft[]>(
        entityData?.slots
            ? entityData.slots.map(s => ({ opens_at: s.opens_at, closes_at: s.closes_at }))
            : [{ opens_at: null, closes_at: null }]
    );

    // Field-level errors
    const [dateError, setDateError] = useState<string>();
    const [endDateError, setEndDateError] = useState<string>();
    const slotErrors = useMemo(() => validateSlots(slots), [slots]);
    const hasSlotErrors = slotErrors.length > 0;

    // When end_date is set, force is_closed=true
    const hasEndDate = endDate.trim() !== "";

    const handleEndDateChange = useCallback((val: string) => {
        setEndDate(val);
        setEndDateError(undefined);
        if (val) {
            setIsClosed(true);
        }
    }, []);

    const handleIsClosedChange = useCallback((checked: boolean) => {
        setIsClosed(checked);
        if (!checked) {
            // Reset to one empty slot when switching to special hours
            if (slots.length === 0) {
                setSlots([{ opens_at: null, closes_at: null }]);
            }
        }
    }, [slots.length]);

    const updateSlot = useCallback((i: number, patch: Partial<SlotDraft>) => {
        setSlots(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
    }, []);

    const addSlot = useCallback(() => {
        setSlots(prev => prev.length < MAX_SLOTS ? [...prev, { opens_at: null, closes_at: null }] : prev);
    }, []);

    const removeSlot = useCallback((i: number) => {
        setSlots(prev => {
            if (prev.length <= 1) {
                // Last slot removed → switch back to fully closed
                setIsClosed(true);
                return [{ opens_at: null, closes_at: null }];
            }
            return prev.filter((_, idx) => idx !== i);
        });
    }, []);

    const validate = (): boolean => {
        let ok = true;
        if (!closureDate) {
            setDateError("La data è obbligatoria.");
            ok = false;
        }
        if (endDate && endDate <= closureDate) {
            setEndDateError("La data di fine deve essere successiva alla data di inizio.");
            ok = false;
        }
        if (!isClosed && hasSlotErrors) {
            ok = false;
        }
        return ok;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;
        onSavingChange(true);
        try {
            const payload = {
                closure_date: closureDate,
                end_date: endDate || null,
                label: label.trim() || null,
                is_closed: isClosed,
                slots: isClosed
                    ? null
                    : slots
                          .filter(s => s.opens_at && s.closes_at)
                          .map(s => ({ opens_at: s.opens_at!, closes_at: s.closes_at! })),
            };
            if (mode === "create") {
                await createActivityClosure(tenantId, { ...payload, activity_id: activityId });
                showToast({ message: "Chiusura aggiunta.", type: "success" });
            } else {
                await updateActivityClosure(entityData!.id, tenantId, payload);
                showToast({ message: "Chiusura aggiornata.", type: "success" });
            }
            await onSuccess();
        } catch (err: unknown) {
            const code = (err as { code?: string }).code;
            if (code === "23505") {
                setDateError("Esiste già una chiusura per questa data.");
            } else if (code === "23514") {
                showToast({ message: "Dati non validi, controlla gli orari inseriti.", type: "error" });
            } else {
                showToast({ message: (err as Error).message ?? "Errore durante il salvataggio.", type: "error" });
            }
        } finally {
            onSavingChange(false);
        }
    };

    const getSlotError = (i: number) => slotErrors.find(e => e.index === i)?.message;

    return (
        <form id={formId} onSubmit={handleSubmit} noValidate>
            <div className={styles.closureFormLayout}>

                {/* Data inizio */}
                <div className={styles.closureFormField}>
                    <label htmlFor={`${formId}-date`} className={styles.closureFormLabel}>
                        Data
                    </label>
                    <input
                        id={`${formId}-date`}
                        type="date"
                        value={closureDate}
                        onChange={(e) => { setClosureDate(e.target.value); setDateError(undefined); }}
                        className={`${styles.closureFormInput}${dateError ? ` ${styles.closureFormInputError}` : ""}`}
                    />
                    {dateError && <span className={styles.closureFormError}>{dateError}</span>}
                </div>

                {/* Data fine */}
                <div className={styles.closureFormField}>
                    <label htmlFor={`${formId}-end-date`} className={styles.closureFormLabel}>
                        Data fine
                        <span className={styles.closureFormLabelOptional}>opzionale</span>
                    </label>
                    <Text variant="caption" colorVariant="muted">
                        Per chiusure su più giorni consecutivi (es. ferie estive).
                    </Text>
                    <input
                        id={`${formId}-end-date`}
                        type="date"
                        value={endDate}
                        onChange={(e) => handleEndDateChange(e.target.value)}
                        className={`${styles.closureFormInput}${endDateError ? ` ${styles.closureFormInputError}` : ""}`}
                    />
                    {endDateError && <span className={styles.closureFormError}>{endDateError}</span>}
                    {hasEndDate && (
                        <Text variant="caption" colorVariant="muted">
                            Le chiusure su più giorni sono sempre totali.
                        </Text>
                    )}
                </div>

                {/* Etichetta */}
                <div className={styles.closureFormField}>
                    <label htmlFor={`${formId}-label`} className={styles.closureFormLabel}>
                        Etichetta
                        <span className={styles.closureFormLabelOptional}>opzionale</span>
                    </label>
                    <input
                        id={`${formId}-label`}
                        type="text"
                        placeholder="es. Natale, Ferie, Manutenzione"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        className={styles.closureFormInput}
                        maxLength={120}
                    />
                </div>

                {/* is_closed toggle — hidden when end_date is set */}
                {!hasEndDate && (
                    <div className={styles.closureFormToggleRow}>
                        <div className={styles.closureFormToggleText}>
                            <span className={styles.closureFormToggleLabel}>
                                {isClosed ? "Chiuso tutto il giorno" : "Orari speciali"}
                            </span>
                            <span className={styles.closureFormToggleHint}>
                                {isClosed
                                    ? "La sede sarà completamente chiusa in questa data."
                                    : "La sede aprirà con orari diversi dal solito."}
                            </span>
                        </div>
                        <Switch
                            checked={isClosed}
                            onChange={handleIsClosedChange}
                            aria-label="Chiuso tutto il giorno"
                        />
                    </div>
                )}

                {/* Multi-slot editor — shown only when !isClosed and no end_date */}
                {!isClosed && !hasEndDate && (
                    <div className={styles.closureFormField}>
                        <label className={styles.closureFormLabel}>Fasce orarie</label>
                        <div className={styles.daySlotsCol}>
                            {slots.map((slot, i) => {
                                const err = getSlotError(i);
                                return (
                                    <div key={i} className={styles.slotRow}>
                                        <div className={styles.slotInputs}>
                                            <TimeInput
                                                value={slot.opens_at ?? ""}
                                                onChange={e => updateSlot(i, { opens_at: e.target.value || null })}
                                                aria-label={`Fascia ${i + 1} apertura`}
                                            />
                                            <span className={styles.slotSeparator}>–</span>
                                            <TimeInput
                                                value={slot.closes_at ?? ""}
                                                onChange={e => updateSlot(i, { closes_at: e.target.value || null })}
                                                aria-label={`Fascia ${i + 1} chiusura`}
                                            />
                                            <button
                                                type="button"
                                                className={styles.removeSlotBtn}
                                                onClick={() => removeSlot(i)}
                                                aria-label={`Rimuovi fascia ${i + 1}`}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                        {err && <span className={styles.slotError}>{err}</span>}
                                    </div>
                                );
                            })}
                            {slots.length < MAX_SLOTS && (
                                <button
                                    type="button"
                                    className={styles.addSlotBtn}
                                    onClick={addSlot}
                                >
                                    <Plus size={14} />
                                    Aggiungi fascia
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </form>
    );
};
```

- [ ] **Step 5: Update `ActivityClosureDeleteDrawer.tsx`** — update `formatDateIT` to handle ranges

Find the `formatDateIT` function and replace it:

```typescript
function formatClosureTitle(c: V2ActivityClosure): string {
    const d = new Date(c.closure_date + "T12:00:00");
    const dateStr = d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
    if (c.end_date) {
        const e = new Date(c.end_date + "T12:00:00");
        const endStr = e.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
        return `${dateStr} – ${endStr}`;
    }
    return dateStr;
}
```

And in the JSX where `formatDateIT(closure.closure_date)` is called, replace with `formatClosureTitle(closure)`.

Also update the import to include `V2ActivityClosure` and `ClosureSlot` if needed (remove unused `formatDateIT` which no longer exists).

- [ ] **Step 6: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -60
```

Remaining errors should be only in `PublicOpeningHours.tsx` (old UpcomingClosure type) and `StylePreview.tsx` (old mock data). Fix any unexpected errors in the admin files before continuing.

- [ ] **Step 7: ⚑ CHECKPOINT — Screenshot the Activity detail "Orari e servizi" tab showing the closure card list (add 3 sample closures via the UI). Also screenshot the create/edit drawer with multi-slot time fields and end_date field visible.**

- [ ] **Step 8: Commit**

```bash
git add \
  src/pages/Operativita/Attivita/tabs/hours-services/HoursServices.module.scss \
  src/pages/Operativita/Attivita/tabs/hours-services/ActivityClosuresSection.tsx \
  src/pages/Operativita/Attivita/tabs/hours-services/ActivityClosureForm.tsx \
  src/pages/Operativita/Attivita/tabs/hours-services/ActivityClosureDeleteDrawer.tsx
git commit -m "feat(admin): card list for closures section + multi-slot form with end_date

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Public Rendering — Stacked Layout + Updated Schema

**Files:**
- Modify: `src/components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours.tsx`
- Modify: `src/components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours.module.scss`
- Modify: `src/pages/Dashboard/Styles/Editor/StylePreview.tsx`

- [ ] **Step 1: Replace `PublicOpeningHours.tsx` entirely**

```tsx
import styles from "./PublicOpeningHours.module.scss";
import type { ClosureSlot } from "@/types/activity-closures";

export type OpeningHoursEntry = {
    day_of_week: number;
    slot_index: number;
    opens_at: string | null;
    closes_at: string | null;
    is_closed: boolean;
};

export type UpcomingClosure = {
    closure_date: string;    // "YYYY-MM-DD"
    end_date: string | null; // "YYYY-MM-DD" or null
    label: string | null;
    is_closed: boolean;
    slots: ClosureSlot[] | null;
};

type Props = {
    openingHours: OpeningHoursEntry[];
    upcomingClosures?: UpcomingClosure[];
};

const DAY_NAMES = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const IT_MONTH_SHORT = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

function parseDate(s: string): Date {
    return new Date(s + "T12:00:00");
}

function formatShort(dateStr: string): string {
    const d = parseDate(dateStr);
    return `${d.getDate()} ${IT_MONTH_SHORT[d.getMonth()]}`;
}

function formatClosureDateLabel(c: UpcomingClosure): string {
    if (c.end_date) {
        return `${formatShort(c.closure_date)} – ${formatShort(c.end_date)}`;
    }
    return formatShort(c.closure_date);
}

export default function PublicOpeningHours({ openingHours, upcomingClosures }: Props) {
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
                    const openSlots = slots.filter(s => !s.is_closed && s.opens_at && s.closes_at);
                    return (
                        <div key={i} className={styles.hoursRow}>
                            <dt className={styles.hoursDay}>{name}</dt>
                            <dd className={styles.hoursSlotsCol}>
                                {isClosed || slots.length === 0 ? (
                                    <span className={`${styles.hoursSlot} ${styles.hoursSlotClosed}`}>
                                        {isClosed ? "Chiuso" : "—"}
                                    </span>
                                ) : openSlots.length === 0 ? (
                                    <span className={`${styles.hoursSlot} ${styles.hoursSlotClosed}`}>—</span>
                                ) : (
                                    openSlots.map((s, idx) => (
                                        <span key={idx} className={styles.hoursSlot}>
                                            {s.opens_at!.slice(0, 5)} – {s.closes_at!.slice(0, 5)}
                                        </span>
                                    ))
                                )}
                            </dd>
                        </div>
                    );
                })}
            </dl>

            {upcomingClosures && upcomingClosures.length > 0 && (
                <div className={styles.closuresSection}>
                    <h4 className={styles.closuresTitle}>Prossime chiusure</h4>
                    <dl className={styles.closuresList}>
                        {upcomingClosures.map((c) => (
                            <div key={c.closure_date} className={styles.closureRow}>
                                <dt className={styles.closureDate}>
                                    {formatClosureDateLabel(c)}
                                </dt>
                                <dd className={styles.closureInfo}>
                                    {c.label && (
                                        <span className={styles.closureLabel}>{c.label}</span>
                                    )}
                                    {c.is_closed ? (
                                        <span className={styles.closureStatus}>Chiuso</span>
                                    ) : (
                                        c.slots?.map((slot, i) => (
                                            <span key={i} className={styles.closureStatus}>
                                                {slot.opens_at} – {slot.closes_at}
                                            </span>
                                        ))
                                    )}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Replace `PublicOpeningHours.module.scss` entirely**

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
  display: grid;
  grid-template-columns: 5.5rem 1fr;
  align-items: start;
  padding: 0.35rem 0;
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
  padding-top: 0.1rem;
}

.hoursSlotsCol {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.1rem;
}

.hoursSlot {
  font-size: 0.8125rem;
  color: var(--pub-text-secondary);
  font-family: var(--pub-font-family, sans-serif);
}

.hoursSlotClosed {
  font-style: italic;
  color: var(--pub-text-muted);
}

/* ── Upcoming closures ───────────────────────────────────────────────── */

.closuresSection {
  width: 100%;
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--pub-border);
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.closuresTitle {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--pub-text-muted);
  font-family: var(--pub-font-family, sans-serif);
  margin: 0;
}

.closuresList {
  width: 100%;
  margin: 0;
  padding: 0;
}

.closureRow {
  display: grid;
  grid-template-columns: 5.5rem 1fr;
  align-items: start;
  padding: 0.3rem 0;
  border-bottom: 1px solid var(--pub-border);

  &:last-child {
    border-bottom: none;
  }
}

.closureDate {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--pub-text);
  font-family: var(--pub-font-family, sans-serif);
  padding-top: 0.1rem;
}

.closureInfo {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.1rem;
}

.closureLabel {
  font-size: 0.75rem;
  color: var(--pub-text-muted);
  font-family: var(--pub-font-family, sans-serif);
}

.closureStatus {
  font-size: 0.8125rem;
  font-style: italic;
  color: var(--pub-text-muted);
  font-family: var(--pub-font-family, sans-serif);
}
```

- [ ] **Step 3: Update `StylePreview.tsx`** — update `MOCK_UPCOMING_CLOSURES`

Find the existing `MOCK_UPCOMING_CLOSURES` constant in `StylePreview.tsx` and replace it with:

```typescript
const MOCK_UPCOMING_CLOSURES: UpcomingClosure[] = [
    {
        closure_date: "2026-12-25",
        end_date: null,
        label: "Natale",
        is_closed: true,
        slots: null,
    },
    {
        closure_date: "2026-12-24",
        end_date: null,
        label: "Vigilia",
        is_closed: false,
        slots: [
            { opens_at: "09:00", closes_at: "13:00" },
            { opens_at: "18:00", closes_at: "20:00" },
        ],
    },
    {
        closure_date: "2026-08-10",
        end_date: "2026-08-25",
        label: "Ferie estive",
        is_closed: true,
        slots: null,
    },
];
```

Make sure `UpcomingClosure` is still imported from `PublicOpeningHours`. No other changes to `StylePreview.tsx`.

- [ ] **Step 4: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -60
```

Expected: 0 errors. If there are errors in `CollectionView.tsx` or `PublicFooter.tsx` because `UpcomingClosure` now has additional fields, they may need minor updates — the new fields (`end_date`, `slots`) are present in the type but those components just pass the prop through without inspecting it, so no changes should be needed.

- [ ] **Step 5: ⚑ CHECKPOINT — Screenshot the public page (or StylePreview in style editor). Weekly hours should show stacked slots (each time range on its own line). Closures section should show range format ("10 – 25 ago") and multi-slot special hours.**

- [ ] **Step 6: Commit**

```bash
git add \
  src/components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours.tsx \
  src/components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours.module.scss \
  src/pages/Dashboard/Styles/Editor/StylePreview.tsx
git commit -m "feat(public): stacked slot layout + updated UpcomingClosure schema

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Edge Function Update

**Files:**
- Modify: `supabase/functions/resolve-public-catalog/index.ts`

- [ ] **Step 1: Update the `upcoming_closures` query**

In the IIFE for the upcoming closures query (inside the `Promise.all`), replace the current query with:

```typescript
// Was: .select("closure_date, label, is_closed, opens_at, closes_at")
// Was: .gte("closure_date", todayStr).lte("closure_date", futureStr)
// New:
return supabase
    .from("activity_closures")
    .select("closure_date, end_date, label, is_closed, slots")
    .or(`closure_date.gte.${todayStr},end_date.gte.${todayStr}`)
    .order("closure_date", { ascending: true })
    .limit(10);
```

Remove the `future`/`futureStr` variables (60-day window) — they are no longer needed since we use `.or()` with today as the only threshold.

- [ ] **Step 2: Commit (do NOT deploy)**

```bash
git add supabase/functions/resolve-public-catalog/index.ts
git commit -m "feat(edge): update upcoming_closures query for new JSONB schema

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

Note: **Do not deploy.** Signal to the user: `supabase db push && supabase functions deploy resolve-public-catalog` needed.

---

## Task 6: Cleanup

- [ ] **Step 1: Grep for stale references**

```bash
grep -rn "opens_at\|closes_at" src/ --include="*.ts" --include="*.tsx" | grep -i "activ.*closur\|closure.*activ" | grep -v "node_modules"
```

Expected: 0 results. If any found, fix them.

- [ ] **Step 2: Full TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Production build**

```bash
npm run build
```

Expected: build succeeds. Bundle size warnings are acceptable.

- [ ] **Step 4: Commit if any fixes were needed**

```bash
# Only if there were stale references fixed:
git add -p
git commit -m "chore: remove stale opens_at/closes_at references from closures

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- ✅ Migration: slots JSONB + end_date + 3 constraints + backfill → Task 1
- ✅ Types: ClosureSlot + updated V2ActivityClosure → Task 2
- ✅ Service: new payload types + 23514 handling → Task 2
- ✅ Section: card list with icons/badges/sorting → Task 3 Step 3
- ✅ Form: multi-slot + end_date + serialization → Task 3 Step 4
- ✅ Delete drawer: range title → Task 3 Step 5
- ✅ Public: stacked layout for weekly hours → Task 4 Step 1
- ✅ Public: updated UpcomingClosure with end_date + slots → Task 4 Step 1
- ✅ Mock data updated → Task 4 Step 3
- ✅ Edge function: new select/filter → Task 5
- ✅ 3 checkpoints: after migration SQL, after admin UI, after public footer → Tasks 1/3/4

**Constraints respected:**
- ActivityHoursForm.tsx not touched
- scheduleResolver.ts not touched
- No new npm libraries
- Italian text throughout
- SCSS Modules, no inline CSS

**Deploy reminder (manual by Lorenzo):**
```bash
supabase db push
supabase functions deploy resolve-public-catalog
```
