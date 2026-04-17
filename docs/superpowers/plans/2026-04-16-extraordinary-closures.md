# Extraordinary Closures — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-date extraordinary closures (and special hours) to the activity hours system, visible in both admin UI and the public page footer.

**Architecture:** New `activity_closures` table stores date-specific overrides (full-day closed, or special open hours). Service layer follows existing patterns. Admin UI extends the `ActivityHoursServicesTab` with a new section card + create/edit/delete drawers. The edge function `resolve-public-catalog` conditionally fetches upcoming closures (next 60 days) and returns them as `upcoming_closures`. `PublicOpeningHours` renders a "Prossime chiusure" section below the weekly table.

**Tech Stack:** React 19, TypeScript 5.9 strict, Supabase PostgreSQL + RLS, SCSS Modules (`@use "@/styles/variables" as v;`), Deno edge functions

---

## File Structure

### Files to CREATE
| File | Responsibility |
|------|----------------|
| `supabase/migrations/20260416140000_activity_closures.sql` | New `activity_closures` table, RLS, constraints, index |
| `src/types/activity-closures.ts` | `V2ActivityClosure` TypeScript interface |
| `src/services/supabase/activityClosures.ts` | CRUD service (list/get/create/update/delete) |
| `src/pages/Operativita/Attivita/tabs/hours-services/ActivityClosuresSection.tsx` | Read-only card listing closures with edit/delete actions |
| `src/pages/Operativita/Attivita/tabs/hours-services/ActivityClosureForm.tsx` | Pure form component (date, label, is_closed, times) |
| `src/pages/Operativita/Attivita/tabs/hours-services/ActivityClosureCreateEditDrawer.tsx` | Drawer wrapper for create/edit |
| `src/pages/Operativita/Attivita/tabs/hours-services/ActivityClosureDeleteDrawer.tsx` | Confirm-delete drawer |

### Files to MODIFY
| File | What changes |
|------|-------------|
| `src/pages/Operativita/Attivita/tabs/ActivityHoursServicesTab.tsx` | Add closures state, load, section, drawers |
| `src/pages/Operativita/Attivita/tabs/hours-services/HoursServices.module.scss` | Add closure table + form styles |
| `supabase/functions/resolve-public-catalog/index.ts` | Fetch `upcoming_closures` when `hours_public=true` |
| `src/components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours.tsx` | Add `UpcomingClosure` type + render upcoming closures section |
| `src/components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours.module.scss` | Add `.closuresSection` and related styles |
| `src/components/PublicCollectionView/CollectionView/CollectionView.tsx` | Add `upcomingClosures` prop, pass to `PublicFooter` |
| `src/components/PublicCollectionView/PublicFooter/PublicFooter.tsx` | Add `upcomingClosures` prop, pass to `PublicOpeningHours` |
| `src/pages/PublicCollectionPage/PublicCollectionPage.tsx` | Extract `upcoming_closures` from response, store in state |
| `src/pages/Dashboard/Styles/Editor/StylePreview.tsx` | Add `MOCK_UPCOMING_CLOSURES`, pass to `CollectionView` |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260416140000_activity_closures.sql`

- [ ] **Step 1: Write migration file**

```sql
-- 20260416140000_activity_closures.sql
-- Extraordinary closures: per-date overrides (full-day closed or special hours)

BEGIN;

CREATE TABLE activity_closures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    closure_date DATE NOT NULL,
    label TEXT,
    is_closed BOOLEAN NOT NULL DEFAULT true,
    opens_at TIME,
    closes_at TIME,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (activity_id, closure_date)
);

-- Time coherence: if fully closed, no times; if special hours, times required and coherent
ALTER TABLE activity_closures
    ADD CONSTRAINT activity_closures_time_coherence CHECK (
        (is_closed = true AND opens_at IS NULL AND closes_at IS NULL)
        OR
        (is_closed = false AND opens_at IS NOT NULL AND closes_at IS NOT NULL AND closes_at > opens_at)
    );

-- RLS
ALTER TABLE activity_closures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own" ON activity_closures
    FOR SELECT USING (tenant_id = ANY(get_my_tenant_ids()));

CREATE POLICY "insert_own" ON activity_closures
    FOR INSERT WITH CHECK (tenant_id = ANY(get_my_tenant_ids()));

CREATE POLICY "update_own" ON activity_closures
    FOR UPDATE USING (tenant_id = ANY(get_my_tenant_ids()));

CREATE POLICY "delete_own" ON activity_closures
    FOR DELETE USING (tenant_id = ANY(get_my_tenant_ids()));

-- Index for range queries (upcoming closures)
CREATE INDEX activity_closures_activity_date_idx
    ON activity_closures (activity_id, closure_date);

COMMIT;
```

- [ ] **Step 2: ⚑ CHECKPOINT — Show the SQL above to the user and wait for explicit approval before continuing.**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260416140000_activity_closures.sql
git commit -m "feat(db): add activity_closures table for extraordinary date overrides"
```

---

## Task 2: TypeScript Type

**Files:**
- Create: `src/types/activity-closures.ts`

- [ ] **Step 1: Create type file**

```typescript
export interface V2ActivityClosure {
    id: string;
    tenant_id: string;
    activity_id: string;
    closure_date: string; // "YYYY-MM-DD"
    label: string | null;
    is_closed: boolean;
    opens_at: string | null;  // "HH:MM:SS" from DB, use .slice(0,5) for display
    closes_at: string | null; // "HH:MM:SS" from DB, use .slice(0,5) for display
    created_at: string;
    updated_at: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/activity-closures.ts
git commit -m "feat(types): add V2ActivityClosure interface"
```

---

## Task 3: Service Layer

**Files:**
- Create: `src/services/supabase/activityClosures.ts`

- [ ] **Step 1: Create service file**

```typescript
import { supabase } from "./client";
import type { V2ActivityClosure } from "@/types/activity-closures";

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
    label: string | null;
    is_closed: boolean;
    opens_at: string | null;
    closes_at: string | null;
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
    label: string | null;
    is_closed: boolean;
    opens_at: string | null;
    closes_at: string | null;
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

- [ ] **Step 2: Commit**

```bash
git add src/services/supabase/activityClosures.ts
git commit -m "feat(service): add activityClosures CRUD service"
```

---

## Task 4: Admin UI — Section, Form, Drawers, Tab Integration

**Files:**
- Create: `src/pages/Operativita/Attivita/tabs/hours-services/ActivityClosuresSection.tsx`
- Create: `src/pages/Operativita/Attivita/tabs/hours-services/ActivityClosureForm.tsx`
- Create: `src/pages/Operativita/Attivita/tabs/hours-services/ActivityClosureCreateEditDrawer.tsx`
- Create: `src/pages/Operativita/Attivita/tabs/hours-services/ActivityClosureDeleteDrawer.tsx`
- Modify: `src/pages/Operativita/Attivita/tabs/hours-services/HoursServices.module.scss`
- Modify: `src/pages/Operativita/Attivita/tabs/ActivityHoursServicesTab.tsx`

- [ ] **Step 1: Add SCSS classes to `HoursServices.module.scss`** (append to existing file — do not remove anything)

```scss
// ── Closures table ───────────────────────────────────────────────────────────

.closuresTable {
  width: 100%;
  border-collapse: collapse;
}

.closuresTableHead {
  text-align: left;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: v.$gray-400;
  padding: 0.5rem 0;
}

.closuresTableRow {
  border-top: 1px solid v.$gray-200;
}

.closuresTableCell {
  padding: 0.75rem 0;
  font-size: 0.9375rem;
  color: v.$text-color;
}

.closuresTableCellMuted {
  padding: 0.75rem 0;
  font-size: 0.9375rem;
  color: v.$gray-400;
}

.closuresTableActions {
  padding: 0.5rem 0;
  text-align: right;
  white-space: nowrap;
}

.closuresActionBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: v.$gray-400;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    background: v.$gray-100;
    color: v.$gray-700;
  }

  &.closuresActionBtnDanger:hover {
    background: #fef2f2;
    color: v.$error;
  }
}

// ── Closure form ─────────────────────────────────────────────────────────────

.closureFormLayout {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.closureFormField {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.closureFormLabel {
  font-size: 0.875rem;
  font-weight: 500;
  color: v.$text-color;
}

.closureFormLabelOptional {
  font-size: 0.75rem;
  font-weight: 400;
  color: v.$gray-400;
  margin-left: 4px;
}

.closureFormInput {
  width: 100%;
  height: 38px;
  padding: 0 12px;
  border: 1px solid v.$gray-300;
  border-radius: 8px;
  font-size: 0.9375rem;
  color: v.$text-color;
  background: #fff;
  outline: none;
  transition: border-color 0.15s ease;
  box-sizing: border-box;

  &:focus {
    border-color: v.$brand-primary;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
  }

  &.closureFormInputError {
    border-color: v.$error;
  }
}

.closureFormError {
  font-size: 0.75rem;
  color: v.$error;
}

.closureFormToggleRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
  border-top: 1px solid v.$gray-200;
}

.closureFormToggleText {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.closureFormToggleLabel {
  font-size: 0.9375rem;
  font-weight: 500;
  color: v.$text-color;
}

.closureFormToggleHint {
  font-size: 0.8125rem;
  color: v.$gray-400;
}

.closureFormTimeRow {
  display: flex;
  align-items: center;
  gap: 10px;
}

.closureFormTimeSep {
  color: v.$gray-400;
  font-size: 0.9375rem;
  flex-shrink: 0;
}

.closureFormTimeInput {
  width: 120px;
  height: 38px;
  padding: 0 12px;
  border: 1px solid v.$gray-300;
  border-radius: 8px;
  font-size: 0.9375rem;
  color: v.$text-color;
  background: #fff;
  outline: none;
  transition: border-color 0.15s ease;
  box-sizing: border-box;

  &:focus {
    border-color: v.$brand-primary;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
  }

  &.closureFormInputError {
    border-color: v.$error;
  }
}

// ── Closure delete drawer ────────────────────────────────────────────────────

.closureDeleteBox {
  display: flex;
  gap: 12px;
  padding: 16px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 10px;
}

.closureDeleteIcon {
  flex-shrink: 0;
  color: v.$error;
  margin-top: 2px;
}

.closureDeleteText {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
```

- [ ] **Step 2: Create `ActivityClosuresSection.tsx`**

```tsx
import React from "react";
import { IconPlus, IconEdit, IconTrash } from "@tabler/icons-react";
import { Card, Button } from "@/components/ui";
import Text from "@/components/ui/Text/Text";
import type { V2ActivityClosure } from "@/types/activity-closures";
import pageStyles from "../../ActivityDetailPage.module.scss";
import styles from "./HoursServices.module.scss";

function formatDateIT(dateStr: string): string {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
}

function formatClosureStatus(c: V2ActivityClosure): string {
    if (c.is_closed) return "Chiuso";
    return `${c.opens_at!.slice(0, 5)} – ${c.closes_at!.slice(0, 5)}`;
}

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
                {closures.length === 0 ? (
                    <Text variant="body-sm" colorVariant="muted">
                        Nessuna chiusura straordinaria configurata.
                    </Text>
                ) : (
                    <table className={styles.closuresTable}>
                        <thead>
                            <tr>
                                <th className={styles.closuresTableHead}>Data</th>
                                <th className={styles.closuresTableHead}>Etichetta</th>
                                <th className={styles.closuresTableHead}>Stato</th>
                                <th className={styles.closuresTableHead}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {closures.map((c) => (
                                <tr key={c.id} className={styles.closuresTableRow}>
                                    <td className={styles.closuresTableCell}>
                                        {formatDateIT(c.closure_date)}
                                    </td>
                                    <td className={c.label ? styles.closuresTableCell : styles.closuresTableCellMuted}>
                                        {c.label ?? "—"}
                                    </td>
                                    <td className={styles.closuresTableCell}>
                                        {formatClosureStatus(c)}
                                    </td>
                                    <td className={styles.closuresTableActions}>
                                        <button
                                            type="button"
                                            className={styles.closuresActionBtn}
                                            onClick={() => onEditRequest(c)}
                                            aria-label="Modifica"
                                        >
                                            <IconEdit size={16} />
                                        </button>
                                        <button
                                            type="button"
                                            className={`${styles.closuresActionBtn} ${styles.closuresActionBtnDanger}`}
                                            onClick={() => onDeleteRequest(c)}
                                            aria-label="Elimina"
                                        >
                                            <IconTrash size={16} />
                                        </button>
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

- [ ] **Step 3: Create `ActivityClosureForm.tsx`**

```tsx
import React, { useState } from "react";
import { createActivityClosure, updateActivityClosure } from "@/services/supabase/activityClosures";
import { useToast } from "@/context/Toast/ToastContext";
import type { V2ActivityClosure } from "@/types/activity-closures";
import styles from "./HoursServices.module.scss";

const TOGGLE_LABELS = {
    closed: "Chiuso tutto il giorno",
    special: "Orari speciali",
};

interface ActivityClosureFormProps {
    formId: string;
    mode: "create" | "edit";
    activityId: string;
    entityData?: V2ActivityClosure;
    tenantId: string;
    onSuccess: () => void | Promise<void>;
    onSavingChange: (saving: boolean) => void;
}

type FormErrors = {
    closure_date?: string;
    opens_at?: string;
    closes_at?: string;
};

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
    const [label, setLabel] = useState(entityData?.label ?? "");
    const [isClosed, setIsClosed] = useState(entityData?.is_closed ?? true);
    const [opensAt, setOpensAt] = useState(entityData?.opens_at?.slice(0, 5) ?? "");
    const [closesAt, setClosesAt] = useState(entityData?.closes_at?.slice(0, 5) ?? "");
    const [errors, setErrors] = useState<FormErrors>({});

    const validate = (): boolean => {
        const e: FormErrors = {};
        if (!closureDate) {
            e.closure_date = "La data è obbligatoria.";
        }
        if (!isClosed) {
            if (!opensAt) e.opens_at = "Orario di apertura obbligatorio.";
            if (!closesAt) e.closes_at = "Orario di chiusura obbligatorio.";
            if (opensAt && closesAt && closesAt <= opensAt) {
                e.closes_at = "La chiusura deve essere dopo l'apertura.";
            }
        }
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;
        onSavingChange(true);
        try {
            const payload = {
                closure_date: closureDate,
                label: label.trim() || null,
                is_closed: isClosed,
                opens_at: isClosed ? null : opensAt || null,
                closes_at: isClosed ? null : closesAt || null,
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
                setErrors({ closure_date: "Esiste già una chiusura per questa data." });
            } else {
                const msg = (err as Error).message ?? "Errore durante il salvataggio.";
                showToast({ message: msg, type: "error" });
            }
        } finally {
            onSavingChange(false);
        }
    };

    return (
        <form id={formId} onSubmit={handleSubmit} noValidate>
            <div className={styles.closureFormLayout}>
                {/* Date */}
                <div className={styles.closureFormField}>
                    <label htmlFor={`${formId}-date`} className={styles.closureFormLabel}>
                        Data
                    </label>
                    <input
                        id={`${formId}-date`}
                        type="date"
                        value={closureDate}
                        onChange={(e) => {
                            setClosureDate(e.target.value);
                            setErrors((prev) => ({ ...prev, closure_date: undefined }));
                        }}
                        className={`${styles.closureFormInput}${errors.closure_date ? ` ${styles.closureFormInputError}` : ""}`}
                    />
                    {errors.closure_date && (
                        <span className={styles.closureFormError}>{errors.closure_date}</span>
                    )}
                </div>

                {/* Label */}
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

                {/* is_closed toggle */}
                <div className={styles.closureFormToggleRow}>
                    <div className={styles.closureFormToggleText}>
                        <span className={styles.closureFormToggleLabel}>
                            {isClosed ? TOGGLE_LABELS.closed : TOGGLE_LABELS.special}
                        </span>
                        <span className={styles.closureFormToggleHint}>
                            {isClosed
                                ? "La sede sarà completamente chiusa in questa data."
                                : "La sede aprirà con orari diversi dal solito."}
                        </span>
                    </div>
                    <input
                        type="checkbox"
                        checked={isClosed}
                        onChange={(e) => {
                            setIsClosed(e.target.checked);
                            setErrors({});
                        }}
                        aria-label="Chiuso tutto il giorno"
                    />
                </div>

                {/* Special hours (shown only when not fully closed) */}
                {!isClosed && (
                    <div className={styles.closureFormField}>
                        <label className={styles.closureFormLabel}>Orari speciali</label>
                        <div className={styles.closureFormTimeRow}>
                            <input
                                type="time"
                                value={opensAt}
                                onChange={(e) => {
                                    setOpensAt(e.target.value);
                                    setErrors((prev) => ({ ...prev, opens_at: undefined }));
                                }}
                                className={`${styles.closureFormTimeInput}${errors.opens_at ? ` ${styles.closureFormInputError}` : ""}`}
                            />
                            <span className={styles.closureFormTimeSep}>–</span>
                            <input
                                type="time"
                                value={closesAt}
                                onChange={(e) => {
                                    setClosesAt(e.target.value);
                                    setErrors((prev) => ({ ...prev, closes_at: undefined }));
                                }}
                                className={`${styles.closureFormTimeInput}${errors.closes_at ? ` ${styles.closureFormInputError}` : ""}`}
                            />
                        </div>
                        {(errors.opens_at || errors.closes_at) && (
                            <span className={styles.closureFormError}>
                                {errors.closes_at ?? errors.opens_at}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </form>
    );
};
```

- [ ] **Step 4: Create `ActivityClosureCreateEditDrawer.tsx`**

```tsx
import React, { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { ActivityClosureForm } from "./ActivityClosureForm";
import type { V2ActivityClosure } from "@/types/activity-closures";

const FORM_ID = "activity-closure-form";

type Props = {
    open: boolean;
    onClose: () => void;
    mode: "create" | "edit";
    activityId: string;
    tenantId: string;
    selectedClosure?: V2ActivityClosure;
    onSuccess: () => void | Promise<void>;
};

export function ActivityClosureCreateEditDrawer({
    open,
    onClose,
    mode,
    activityId,
    tenantId,
    selectedClosure,
    onSuccess,
}: Props) {
    const [isSaving, setIsSaving] = useState(false);

    const handleSuccess = async () => {
        await onSuccess();
        onClose();
    };

    return (
        <SystemDrawer open={open} onClose={onClose} width={520}>
            <DrawerLayout
                header={
                    <div>
                        <Text variant="title-sm" weight={600}>
                            {mode === "create" ? "Nuova chiusura straordinaria" : "Modifica chiusura"}
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            {mode === "create"
                                ? "Aggiungi una data di chiusura o con orari speciali."
                                : "Modifica i dettagli di questa chiusura."}
                        </Text>
                    </div>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                            Annulla
                        </Button>
                        <Button
                            variant="primary"
                            type="submit"
                            form={FORM_ID}
                            loading={isSaving}
                        >
                            {mode === "create" ? "Aggiungi chiusura" : "Salva modifiche"}
                        </Button>
                    </>
                }
            >
                <ActivityClosureForm
                    formId={FORM_ID}
                    mode={mode}
                    activityId={activityId}
                    entityData={selectedClosure}
                    tenantId={tenantId}
                    onSuccess={handleSuccess}
                    onSavingChange={setIsSaving}
                />
            </DrawerLayout>
        </SystemDrawer>
    );
}
```

- [ ] **Step 5: Create `ActivityClosureDeleteDrawer.tsx`**

```tsx
import React, { useState } from "react";
import { IconAlertTriangle } from "@tabler/icons-react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { deleteActivityClosure } from "@/services/supabase/activityClosures";
import { useToast } from "@/context/Toast/ToastContext";
import type { V2ActivityClosure } from "@/types/activity-closures";
import styles from "./HoursServices.module.scss";

function formatDateIT(dateStr: string): string {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

type Props = {
    open: boolean;
    onClose: () => void;
    closure?: V2ActivityClosure;
    tenantId: string;
    onSuccess: () => void | Promise<void>;
};

export function ActivityClosureDeleteDrawer({
    open,
    onClose,
    closure,
    tenantId,
    onSuccess,
}: Props) {
    const { showToast } = useToast();
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
        if (!closure) return;
        setIsDeleting(true);
        try {
            await deleteActivityClosure(closure.id, tenantId);
            showToast({ message: "Chiusura eliminata.", type: "success" });
            await onSuccess();
            onClose();
        } catch (err: unknown) {
            const msg = (err as Error).message ?? "Errore durante l'eliminazione.";
            showToast({ message: msg, type: "error" });
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <SystemDrawer open={open} onClose={onClose} width={480}>
            <DrawerLayout
                header={
                    <div>
                        <Text variant="title-sm" weight={600}>
                            Elimina chiusura
                        </Text>
                        <Text variant="body-sm" colorVariant="muted">
                            Questa azione non può essere annullata.
                        </Text>
                    </div>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isDeleting}>
                            Annulla
                        </Button>
                        <Button
                            variant="danger"
                            onClick={handleDelete}
                            loading={isDeleting}
                        >
                            Elimina
                        </Button>
                    </>
                }
            >
                {closure && (
                    <div className={styles.closureDeleteBox}>
                        <IconAlertTriangle
                            size={20}
                            className={styles.closureDeleteIcon}
                        />
                        <div className={styles.closureDeleteText}>
                            <Text variant="body-sm" weight={600}>
                                {formatDateIT(closure.closure_date)}
                                {closure.label ? ` — ${closure.label}` : ""}
                            </Text>
                            <Text variant="body-sm" colorVariant="muted">
                                La chiusura verrà rimossa definitivamente.
                            </Text>
                        </div>
                    </div>
                )}
            </DrawerLayout>
        </SystemDrawer>
    );
}
```

- [ ] **Step 6: Update `ActivityHoursServicesTab.tsx`** to add closures state, loading, section, and drawers

Replace the entire file with:

```tsx
import React, { useState, useEffect, useCallback } from "react";
import { IconLoader2 } from "@tabler/icons-react";
import { listActivityHours } from "@/services/supabase/activityHours";
import { listActivityClosures } from "@/services/supabase/activityClosures";
import type { V2Activity } from "@/types/activity";
import type { V2ActivityHours } from "@/types/activity-hours";
import type { V2ActivityClosure } from "@/types/activity-closures";
import { useToast } from "@/context/Toast/ToastContext";
import { ActivityHoursSection } from "./hours-services/ActivityHoursSection";
import { ActivityHoursDrawer } from "./hours-services/ActivityHoursDrawer";
import { ActivityClosuresSection } from "./hours-services/ActivityClosuresSection";
import { ActivityClosureCreateEditDrawer } from "./hours-services/ActivityClosureCreateEditDrawer";
import { ActivityClosureDeleteDrawer } from "./hours-services/ActivityClosureDeleteDrawer";
import { PaymentMethodsSection } from "./hours-services/PaymentMethodsSection";
import { ServicesSection } from "./hours-services/ServicesSection";
import pageStyles from "../ActivityDetailPage.module.scss";
import styles from "./hours-services/HoursServices.module.scss";

interface ActivityHoursServicesTabProps {
    activity: V2Activity;
    tenantId: string;
    onReload: () => Promise<void>;
}

export const ActivityHoursServicesTab: React.FC<ActivityHoursServicesTabProps> = ({
    activity,
    tenantId,
    onReload,
}) => {
    const { showToast } = useToast();

    // Hours state
    const [hours, setHours] = useState<V2ActivityHours[]>([]);
    const [isHoursLoading, setIsHoursLoading] = useState(true);
    const [isHoursDrawerOpen, setIsHoursDrawerOpen] = useState(false);

    // Closures state
    const [closures, setClosures] = useState<V2ActivityClosure[]>([]);
    const [isClosuresLoading, setIsClosuresLoading] = useState(true);
    const [isClosureDrawerOpen, setIsClosureDrawerOpen] = useState(false);
    const [isClosureDeleteDrawerOpen, setIsClosureDeleteDrawerOpen] = useState(false);
    const [closureMode, setClosureMode] = useState<"create" | "edit">("create");
    const [selectedClosure, setSelectedClosure] = useState<V2ActivityClosure | undefined>();

    const loadHours = useCallback(async () => {
        try {
            setIsHoursLoading(true);
            setHours(await listActivityHours(activity.id, tenantId));
        } catch {
            showToast({ message: "Errore nel caricamento degli orari.", type: "error" });
        } finally {
            setIsHoursLoading(false);
        }
    }, [activity.id, tenantId, showToast]);

    const loadClosures = useCallback(async () => {
        try {
            setIsClosuresLoading(true);
            setClosures(await listActivityClosures(activity.id, tenantId));
        } catch {
            showToast({ message: "Errore nel caricamento delle chiusure.", type: "error" });
        } finally {
            setIsClosuresLoading(false);
        }
    }, [activity.id, tenantId, showToast]);

    useEffect(() => {
        loadHours();
        loadClosures();
    }, [loadHours, loadClosures]);

    const handleHoursSaved = useCallback(async () => {
        await Promise.all([loadHours(), onReload()]);
    }, [loadHours, onReload]);

    const handleActivitySaved = useCallback(async () => {
        await onReload();
    }, [onReload]);

    const handleClosureSaved = useCallback(async () => {
        await loadClosures();
    }, [loadClosures]);

    const openCreateClosure = () => {
        setClosureMode("create");
        setSelectedClosure(undefined);
        setIsClosureDrawerOpen(true);
    };

    const openEditClosure = (closure: V2ActivityClosure) => {
        setClosureMode("edit");
        setSelectedClosure(closure);
        setIsClosureDrawerOpen(true);
    };

    const openDeleteClosure = (closure: V2ActivityClosure) => {
        setSelectedClosure(closure);
        setIsClosureDeleteDrawerOpen(true);
    };

    const isLoading = isHoursLoading || isClosuresLoading;

    if (isLoading) {
        return (
            <div className={pageStyles.loadingState}>
                <IconLoader2 className="animate-spin" size={32} />
                <p>Caricamento orari e servizi...</p>
            </div>
        );
    }

    return (
        <div className={styles.tabLayout}>
            <ActivityHoursSection
                hours={hours}
                activity={activity}
                onEditRequest={() => setIsHoursDrawerOpen(true)}
            />
            <ActivityClosuresSection
                closures={closures}
                onCreateRequest={openCreateClosure}
                onEditRequest={openEditClosure}
                onDeleteRequest={openDeleteClosure}
            />
            <PaymentMethodsSection
                activity={activity}
                tenantId={tenantId}
                onSaved={handleActivitySaved}
            />
            <ServicesSection
                activity={activity}
                tenantId={tenantId}
                onSaved={handleActivitySaved}
            />

            <ActivityHoursDrawer
                open={isHoursDrawerOpen}
                onClose={() => setIsHoursDrawerOpen(false)}
                hours={hours}
                activity={activity}
                tenantId={tenantId}
                onSuccess={handleHoursSaved}
            />
            <ActivityClosureCreateEditDrawer
                open={isClosureDrawerOpen}
                onClose={() => setIsClosureDrawerOpen(false)}
                mode={closureMode}
                activityId={activity.id}
                tenantId={tenantId}
                selectedClosure={selectedClosure}
                onSuccess={handleClosureSaved}
            />
            <ActivityClosureDeleteDrawer
                open={isClosureDeleteDrawerOpen}
                onClose={() => setIsClosureDeleteDrawerOpen(false)}
                closure={selectedClosure}
                tenantId={tenantId}
                onSuccess={handleClosureSaved}
            />
        </div>
    );
};
```

- [ ] **Step 7: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors. If errors appear, fix them before continuing.

- [ ] **Step 8: ⚑ CHECKPOINT — Take a screenshot of the Activity detail page → "Orari e servizi" tab. There should be a "Chiusure straordinarie" card with a "Nuova chiusura" button. Add 3 sample closures (e.g. 24 apr, 1 mag, 15 ago) and take a second screenshot showing the list + the create/edit drawer open.**

- [ ] **Step 9: Commit**

```bash
git add \
  src/pages/Operativita/Attivita/tabs/hours-services/ActivityClosuresSection.tsx \
  src/pages/Operativita/Attivita/tabs/hours-services/ActivityClosureForm.tsx \
  src/pages/Operativita/Attivita/tabs/hours-services/ActivityClosureCreateEditDrawer.tsx \
  src/pages/Operativita/Attivita/tabs/hours-services/ActivityClosureDeleteDrawer.tsx \
  src/pages/Operativita/Attivita/tabs/ActivityHoursServicesTab.tsx \
  src/pages/Operativita/Attivita/tabs/hours-services/HoursServices.module.scss
git commit -m "feat(admin): add extraordinary closures section with create/edit/delete drawers"
```

---

## Task 5: Edge Function Extension

**Files:**
- Modify: `supabase/functions/resolve-public-catalog/index.ts`

- [ ] **Step 1: Add `upcoming_closures` fetch to `resolve-public-catalog`**

In the `Promise.all` block (around line 140), add a third parallel query after the existing `hoursResult`:

```typescript
// 3. Resolve catalogs + tenant info + hours + upcoming closures in parallel
const [resolved, tenantInfo, hoursResult, closuresResult] = await Promise.all([
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
    activity.hours_public
        ? (() => {
              // Today and +60 days in Rome timezone
              const now = new Date();
              const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(now);
              const future = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
              const futureStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(future);
              return supabase
                  .from("activity_closures")
                  .select("closure_date, label, is_closed, opens_at, closes_at")
                  .eq("activity_id", activity.id)
                  .gte("closure_date", todayStr)
                  .lte("closure_date", futureStr)
                  .order("closure_date", { ascending: true });
          })()
        : Promise.resolve({ data: null, error: null }),
]);

const opening_hours = hoursResult.data ?? undefined;
const upcoming_closures = closuresResult.data ?? undefined;
```

Then in the final `return new Response(JSON.stringify({...}))` at the bottom, spread `upcoming_closures`:

```typescript
return new Response(
    JSON.stringify({
        business,
        tenantLogoUrl,
        resolved,
        canonical_slug: isAliasMatch ? activity.slug : null,
        ...(opening_hours ? { opening_hours } : {}),
        ...(upcoming_closures ? { upcoming_closures } : {}),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/resolve-public-catalog/index.ts
git commit -m "feat(edge): return upcoming_closures in resolve-public-catalog when hours_public=true"
```

---

## Task 6: Public Rendering

**Files:**
- Modify: `src/components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours.tsx`
- Modify: `src/components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours.module.scss`
- Modify: `src/components/PublicCollectionView/CollectionView/CollectionView.tsx`
- Modify: `src/components/PublicCollectionView/PublicFooter/PublicFooter.tsx`
- Modify: `src/pages/PublicCollectionPage/PublicCollectionPage.tsx`
- Modify: `src/pages/Dashboard/Styles/Editor/StylePreview.tsx`

- [ ] **Step 1: Extend `PublicOpeningHours.tsx`** — add `UpcomingClosure` type and upcoming closures section

```tsx
import styles from "./PublicOpeningHours.module.scss";

export type OpeningHoursEntry = {
    day_of_week: number;
    slot_index: number;
    opens_at: string | null;
    closes_at: string | null;
    is_closed: boolean;
};

export type UpcomingClosure = {
    closure_date: string; // "YYYY-MM-DD"
    label: string | null;
    is_closed: boolean;
    opens_at: string | null;
    closes_at: string | null;
};

type Props = {
    openingHours: OpeningHoursEntry[];
    upcomingClosures?: UpcomingClosure[];
};

const DAY_NAMES = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const IT_DAY_SHORT = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
const IT_MONTH_SHORT = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

function formatDaySlots(slots: OpeningHoursEntry[]): string {
    if (slots.length === 0) return "—";
    if (slots[0].is_closed) return "Chiuso";
    const parts = slots
        .filter(s => !s.is_closed && s.opens_at && s.closes_at)
        .map(s => `${s.opens_at!.slice(0, 5)} – ${s.closes_at!.slice(0, 5)}`);
    return parts.length > 0 ? parts.join(" · ") : "—";
}

function formatClosureDate(dateStr: string): string {
    const d = new Date(dateStr + "T12:00:00");
    return `${IT_DAY_SHORT[d.getDay()]} ${d.getDate()} ${IT_MONTH_SHORT[d.getMonth()]}`;
}

function formatClosureStatus(c: UpcomingClosure): string {
    if (c.is_closed) return "Chiuso";
    return `${c.opens_at!.slice(0, 5)} – ${c.closes_at!.slice(0, 5)}`;
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

            {upcomingClosures && upcomingClosures.length > 0 && (
                <div className={styles.closuresSection}>
                    <h4 className={styles.closuresTitle}>Prossime chiusure</h4>
                    <dl className={styles.closuresList}>
                        {upcomingClosures.map((c) => (
                            <div key={c.closure_date} className={styles.closureRow}>
                                <dt className={styles.closureDate}>
                                    {formatClosureDate(c.closure_date)}
                                </dt>
                                <dd className={styles.closureInfo}>
                                    {c.label && (
                                        <span className={styles.closureLabel}>{c.label}</span>
                                    )}
                                    <span className={styles.closureStatus}>
                                        {formatClosureStatus(c)}
                                    </span>
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

- [ ] **Step 2: Extend `PublicOpeningHours.module.scss`** — append closure styles (do not remove existing styles)

```scss
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
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 0.2rem 0;
}

.closureDate {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--pub-text);
  font-family: var(--pub-font-family, sans-serif);
  flex-shrink: 0;
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

- [ ] **Step 3: Update `CollectionView.tsx`** — add `upcomingClosures` prop and pass it to `PublicFooter`

Find the `Props` type definition and add:
```typescript
upcomingClosures?: UpcomingClosure[];
```

Import `UpcomingClosure` from `PublicOpeningHours`:
```typescript
import type { UpcomingClosure } from "@components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours";
```
(Use whichever import alias is already used in the file for `PublicOpeningHours`.)

Find where `<PublicFooter` is rendered and pass the new prop:
```tsx
<PublicFooter
    openingHours={openingHours}
    upcomingClosures={upcomingClosures}
    {...otherExistingProps}
/>
```

- [ ] **Step 4: Update `PublicFooter.tsx`** — add `upcomingClosures` prop and pass it to `<PublicOpeningHours>`

Find the `Props` type and add:
```typescript
upcomingClosures?: UpcomingClosure[];
```

Import `UpcomingClosure` from `PublicOpeningHours`.

Find where `<PublicOpeningHours` is rendered and add the prop:
```tsx
<PublicOpeningHours
    openingHours={openingHours}
    upcomingClosures={upcomingClosures}
/>
```

- [ ] **Step 5: Update `PublicCollectionPage.tsx`** — extract `upcoming_closures` from edge function response

Find where `opening_hours` is extracted from the response and add alongside it:
```typescript
const upcoming_closures = data.upcoming_closures as UpcomingClosure[] | undefined;
```

Import `UpcomingClosure` from `PublicOpeningHours`.

Find where `openingHours` is stored in the page state "ready" variant and add:
```typescript
upcomingClosures: upcoming_closures,
```

Find where `<CollectionView` is rendered and pass:
```tsx
upcomingClosures={pageState.upcomingClosures}
```

- [ ] **Step 6: Update `StylePreview.tsx`** — add `MOCK_UPCOMING_CLOSURES` and pass to `CollectionView`

Find the existing mock data section and add:
```typescript
const MOCK_UPCOMING_CLOSURES: UpcomingClosure[] = [
    { closure_date: "2026-04-24", label: "Giovedì Santo", is_closed: true, opens_at: null, closes_at: null },
    { closure_date: "2026-05-01", label: "Festa del Lavoro", is_closed: true, opens_at: null, closes_at: null },
    { closure_date: "2026-06-02", label: "Festa della Repubblica", is_closed: false, opens_at: "10:00", closes_at: "15:00" },
];
```

Import `UpcomingClosure` from `PublicOpeningHours`.

Find where `<CollectionView` is rendered and add:
```tsx
upcomingClosures={MOCK_UPCOMING_CLOSURES}
```

- [ ] **Step 7: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors. Fix any type errors before continuing.

- [ ] **Step 8: ⚑ CHECKPOINT — Take a screenshot of the public page (or StylePreview in the style editor). The footer should show the weekly hours table AND a "Prossime chiusure" section below it with the mock dates.**

- [ ] **Step 9: Commit**

```bash
git add \
  src/components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours.tsx \
  src/components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours.module.scss \
  src/components/PublicCollectionView/CollectionView/CollectionView.tsx \
  src/components/PublicCollectionView/PublicFooter/PublicFooter.tsx \
  src/pages/PublicCollectionPage/PublicCollectionPage.tsx \
  src/pages/Dashboard/Styles/Editor/StylePreview.tsx
git commit -m "feat(public): render upcoming closures in public footer hours section"
```

---

## Task 7: Cleanup

**Files:** all modified files

- [ ] **Step 1: Run full TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Run production build**

```bash
npm run build
```

Expected: build succeeds with no errors. Warnings about bundle size are acceptable.

- [ ] **Step 3: Grep for any remaining references to removed patterns or typos**

```bash
grep -r "upcoming_closure" src/ --include="*.tsx" --include="*.ts" -l
grep -r "UpcomingClosure" src/ --include="*.tsx" --include="*.ts" -l
```

Expected: `PublicOpeningHours.tsx`, `CollectionView.tsx`, `PublicFooter.tsx`, `PublicCollectionPage.tsx`, `StylePreview.tsx` — exactly those 5 files.

- [ ] **Step 4: Commit cleanup**

```bash
git add -p  # stage only if there are any last-minute fixes
# Only commit if there are changes; otherwise skip
git commit -m "chore: tsc + build verification for extraordinary closures"
```

---

## Self-Review

**Spec coverage:**
- ✅ `activity_closures` table with RLS, constraints, index → Task 1
- ✅ `V2ActivityClosure` TypeScript type → Task 2
- ✅ CRUD service (list/get/create/update/delete) → Task 3
- ✅ Admin section card (list closures + edit/delete actions) → Task 4 Step 2
- ✅ Create/edit drawer with form validation → Task 4 Steps 3–4
- ✅ Delete drawer with warning box → Task 4 Step 5
- ✅ Tab integration → Task 4 Step 6
- ✅ Edge function returns `upcoming_closures` (next 60 days, Rome timezone) → Task 5
- ✅ Public footer renders "Prossime chiusure" section → Task 6 Steps 1–2
- ✅ Pipeline wiring (CollectionView → PublicFooter → PublicOpeningHours) → Task 6 Steps 3–5
- ✅ StylePreview mock data → Task 6 Step 6
- ✅ 3 checkpoints at correct positions → Task 1 Step 2, Task 4 Step 8, Task 6 Step 8

**Placeholder scan:** No TBD, no TODO, no "implement later", no "similar to above". All code blocks contain complete implementations.

**Type consistency:** `UpcomingClosure` defined once in `PublicOpeningHours.tsx` and imported everywhere. `V2ActivityClosure` defined once in `src/types/activity-closures.ts`. `ClosurePayload` / `ClosureUpdatePayload` local to service file.

---

**Deploy (manual by Lorenzo after plan completion):**
```bash
supabase db push
supabase functions deploy resolve-public-catalog
```
