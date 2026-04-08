# Featured Contents UX Refactor — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rimuovere stato/tipo dall'UI, convertire il tab Informazioni al pattern read-only + drawer, e rendere il tab Prodotti a salvataggio immediato.

**Architecture:** Refactor puramente frontend: 7 nuovi file in `components/`, 5 file modificati, 0 nuove migration. Il pattern adottato è identico ad `ActivityInfoTab`: card read-only + `SystemDrawer → DrawerLayout → Form`.

**Tech Stack:** React 19, TypeScript 5.9 strict, SCSS Modules, Supabase client, Lucide React, DnD Kit.

**Spec:** `docs/superpowers/specs/2026-04-08-featured-contents-ux-refactor-design.md`

---

## Chunk 1: Cleanup lista e drawer creazione

### Task 1: Pulisci Highlights.tsx e Highlights.module.scss

**Files:**
- Modify: `src/pages/Dashboard/Highlights/Highlights.tsx`
- Modify: `src/pages/Dashboard/Highlights/Highlights.module.scss`

- [ ] **Step 1: Rimuovi typeFilter state e logica di filtering**

In `Highlights.tsx`, elimina queste righe:

```typescript
// RIMUOVI
const [typeFilter, setTypeFilter] = useState<string>("all");
```

Cambia `filteredContents` da:
```typescript
const filteredContents = useMemo(() => {
    return contents.filter(item => {
        const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType =
            typeFilter === "all" ||
            (typeFilter === "editorial" && item.pricing_mode === "none") ||
            (typeFilter === "products" && item.pricing_mode !== "none");
        return matchesSearch && matchesType;
    });
}, [contents, searchQuery, typeFilter]);
```

a:
```typescript
const filteredContents = useMemo(() => {
    return contents.filter(item =>
        item.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
}, [contents, searchQuery]);
```

- [ ] **Step 2: Rimuovi colonne `type` e `status` dalla DataTable**

Sostituisci l'intero array `columns` con:
```typescript
const columns: ColumnDefinition<FeaturedContentWithProducts>[] = [
    {
        id: "title",
        header: "Titolo",
        width: "2fr",
        cell: (_value, item) => (
            <div className={styles.titleCell}>
                <Text variant="body-sm" weight={600}>
                    {item.title}
                </Text>
                {item.subtitle ? (
                    <Text variant="caption" colorVariant="muted" className={styles.subtitle}>
                        {item.subtitle}
                    </Text>
                ) : (
                    <Text variant="caption" colorVariant="muted" className={styles.subtitle}>
                        Nessun sottotitolo
                    </Text>
                )}
            </div>
        )
    },
    {
        id: "products",
        header: "Prodotti",
        width: "0.8fr",
        accessor: item => item.products_count || 0,
        cell: (value, item) =>
            item.pricing_mode === "none" ? (
                <Text variant="body-sm" colorVariant="muted">
                    -
                </Text>
            ) : (
                <Text variant="body-sm">{(value as number) || 0}</Text>
            )
    },
    {
        id: "actions",
        header: "Azioni",
        width: "96px",
        align: "right",
        cell: (_value, item) => (
            <TableRowActions
                actions={[
                    { label: "Modifica", icon: Pencil, onClick: () => handleEdit(item) },
                    {
                        label: "Elimina",
                        icon: Trash2,
                        onClick: () => setDeleteTarget(item),
                        variant: "destructive",
                        separator: true
                    }
                ]}
            />
        )
    }
];
```

- [ ] **Step 3: Rimuovi il filtro tipo dal FilterBar**

Sostituisci `activeFilters` e la sua prop `advancedFilters` da `FilterBar`:

```typescript
// RIMUOVI l'intera variabile activeFilters
// const activeFilters = ( ... )
```

Cambia `FilterBar` da:
```tsx
<FilterBar
    search={{ value: searchQuery, onChange: setSearchQuery, placeholder: "Cerca per titolo..." }}
    view={{ value: densityView, onChange: setDensityView }}
    advancedFilters={activeFilters}
/>
```

a:
```tsx
<FilterBar
    search={{ value: searchQuery, onChange: setSearchQuery, placeholder: "Cerca per titolo..." }}
    view={{ value: densityView, onChange: setDensityView }}
/>
```

- [ ] **Step 4: Rimuovi import `Select` non più usato**

In cima al file, rimuovi:
```typescript
import { Select } from "@/components/ui/Select/Select";
```

Controlla che tutti gli import rimanenti siano ancora usati.

- [ ] **Step 5: Aggiorna empty state — rimosso il riferimento a typeFilter**

Cambia le condizioni che usavano `typeFilter`:
```tsx
// DA
title={
    searchQuery || typeFilter !== "all"
        ? "Nessun contenuto trovato"
        : "Non hai ancora creato contenuti in evidenza"
}
description={
    searchQuery || typeFilter !== "all"
        ? "Nessun contenuto corrisponde ai filtri."
        : "I contenuti in evidenza compaiono nella homepage del tuo catalogo."
}
action={
    !searchQuery && typeFilter === "all" ? (
        <Button variant="primary" onClick={handleCreate}>
            + Crea il primo contenuto
        </Button>
    ) : undefined
}

// A
title={
    searchQuery
        ? "Nessun contenuto trovato"
        : "Non hai ancora creato contenuti in evidenza"
}
description={
    searchQuery
        ? "Nessun contenuto corrisponde alla ricerca."
        : "I contenuti in evidenza compaiono nella homepage del tuo catalogo."
}
action={
    !searchQuery ? (
        <Button variant="primary" onClick={handleCreate}>
            + Crea il primo contenuto
        </Button>
    ) : undefined
}
```

- [ ] **Step 6: Rimuovi classi CSS inutilizzate da Highlights.module.scss**

Elimina i seguenti blocchi da `src/pages/Dashboard/Highlights/Highlights.module.scss`:

```scss
/* RIMUOVI */
.typeBadge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0.2rem 0.55rem;
  background: #1d4ed8;
  color: #fff;
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1;
}

.statusPublished,
.statusDraft {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0.2rem 0.55rem;
  color: #fff;
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1;
}

.statusPublished {
  background: #15803d;
}

.statusDraft {
  background: #b45309;
}
```

- [ ] **Step 7: Verifica TypeScript**

```bash
cd /Users/lorenzo_calzi/Lavoro/Progetti/Personali/CataloGlobe
npx tsc --noEmit 2>&1 | head -40
```

Expected: nessun errore nei file Highlights.

- [ ] **Step 8: Commit**

```bash
git add src/pages/Dashboard/Highlights/Highlights.tsx src/pages/Dashboard/Highlights/Highlights.module.scss
git commit -m "refactor(highlights): rimuovi colonne tipo/stato e filtro tipo dalla lista"
```

---

### Task 2: Semplifica FeaturedContentDrawer.tsx

**Files:**
- Modify: `src/pages/Dashboard/Highlights/FeaturedContentDrawer.tsx`

- [ ] **Step 1: Riscrivi il file**

Sostituisci l'intero contenuto di `src/pages/Dashboard/Highlights/FeaturedContentDrawer.tsx` con:

```typescript
import React, { useState, useEffect } from "react";
import Text from "@/components/ui/Text/Text";
import { TextInput } from "@/components/ui/Input/TextInput";
import { useToast } from "@/context/Toast/ToastContext";
import { useNavigate } from "react-router-dom";
import {
    createFeaturedContent,
    FeaturedContentPricingMode
} from "@/services/supabase/featuredContents";
import { useTenantId } from "@/context/useTenantId";

interface DrawerProps {
    onClose: () => void;
    onSuccess: () => void;
}

export default function FeaturedContentDrawer({ onClose, onSuccess }: DrawerProps) {
    const tenantId = useTenantId();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [submitting, setSubmitting] = useState(false);

    const [internalName, setInternalName] = useState("");
    const [title, setTitle] = useState("");

    useEffect(() => {
        setInternalName("");
        setTitle("");
    }, []);

    const handleSave = async () => {
        if (!title.trim()) {
            showToast({ type: "error", message: "Il titolo è obbligatorio", duration: 3000 });
            return;
        }
        if (!tenantId) {
            showToast({ type: "error", message: "Utente non identificato (tenantId mancante)" });
            return;
        }
        try {
            setSubmitting(true);
            const created = await createFeaturedContent(tenantId, {
                internal_name: internalName.trim() || title.trim(),
                title: title.trim(),
                pricing_mode: "none" as FeaturedContentPricingMode,
                bundle_price: null,
                status: "published",
                show_original_total: false
            });
            showToast({ type: "success", message: "Contenuto creato" });
            onSuccess();
            if (created && created.id) {
                navigate(`/business/${tenantId}/featured/${created.id}`);
            }
        } catch (error) {
            console.error(error);
            showToast({ type: "error", message: "Errore durante il salvataggio" });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form
            id="featured-content-form"
            onSubmit={e => { e.preventDefault(); handleSave(); }}
            style={{
                display: "flex",
                flexDirection: "column",
                gap: "24px",
                opacity: submitting ? 0.7 : 1,
                pointerEvents: submitting ? "none" : "auto"
            }}
        >
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <Text variant="title-sm" weight={600}>
                    Informazioni base
                </Text>
                <TextInput
                    label="Nome interno *"
                    value={internalName}
                    onChange={e => setInternalName(e.target.value)}
                    placeholder="Es: RistoPromo - Sede Roma"
                />
                <TextInput
                    label="Titolo pubblico *"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Es: Promozione speciale"
                />
            </div>
            <input type="submit" id="featured-content-submit" style={{ display: "none" }} />
        </form>
    );
}
```

- [ ] **Step 2: Verifica TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/Dashboard/Highlights/FeaturedContentDrawer.tsx
git commit -m "refactor(highlights): rimuovi checkbox stato dal drawer di creazione, status sempre published"
```

---

## Chunk 2: Nuovi componenti drawer

### Task 3: FeaturedIdentityForm + FeaturedIdentityDrawer

**Files:**
- Create: `src/pages/Dashboard/Highlights/components/FeaturedIdentityForm.tsx`
- Create: `src/pages/Dashboard/Highlights/components/FeaturedIdentityDrawer.tsx`

- [ ] **Step 1: Crea la directory components**

```bash
mkdir -p /Users/lorenzo_calzi/Lavoro/Progetti/Personali/CataloGlobe/src/pages/Dashboard/Highlights/components
```

- [ ] **Step 2: Crea FeaturedIdentityForm.tsx**

```typescript
// src/pages/Dashboard/Highlights/components/FeaturedIdentityForm.tsx
import React, { useState, useEffect } from "react";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import {
    updateFeaturedContent,
    type FeaturedContent
} from "@/services/supabase/featuredContents";
import { useToast } from "@/context/Toast/ToastContext";

type Props = {
    formId: string;
    entityData: FeaturedContent;
    tenantId: string;
    onSuccess: () => void;
    onSavingChange: (saving: boolean) => void;
};

export function FeaturedIdentityForm({
    formId,
    entityData,
    tenantId,
    onSuccess,
    onSavingChange
}: Props) {
    const { showToast } = useToast();
    const [title, setTitle] = useState(entityData.title);
    const [internalName, setInternalName] = useState(entityData.internal_name);
    const [subtitle, setSubtitle] = useState(entityData.subtitle ?? "");
    const [description, setDescription] = useState(entityData.description ?? "");

    useEffect(() => {
        setTitle(entityData.title);
        setInternalName(entityData.internal_name);
        setSubtitle(entityData.subtitle ?? "");
        setDescription(entityData.description ?? "");
    }, [entityData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedTitle = title.trim();
        if (!trimmedTitle) {
            showToast({ message: "Il titolo è obbligatorio.", type: "error" });
            return;
        }
        onSavingChange(true);
        try {
            await updateFeaturedContent(entityData.id, tenantId, {
                title: trimmedTitle,
                internal_name: internalName.trim() || trimmedTitle,
                subtitle: subtitle.trim() || null,
                description: description.trim() || null
            });
            showToast({ message: "Identità aggiornata.", type: "success" });
            onSuccess();
        } catch (err) {
            console.error(err);
            showToast({ message: "Errore durante il salvataggio.", type: "error" });
        } finally {
            onSavingChange(false);
        }
    };

    return (
        <form id={formId} onSubmit={handleSubmit}>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <TextInput
                    label="Titolo pubblico *"
                    required
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Es: Promozione speciale"
                />
                <TextInput
                    label="Nome interno *"
                    value={internalName}
                    onChange={e => setInternalName(e.target.value)}
                    placeholder="Es: Promo Roma - Aprile"
                />
                <TextInput
                    label="Sottotitolo"
                    value={subtitle}
                    onChange={e => setSubtitle(e.target.value)}
                    placeholder="Sottotitolo opzionale"
                />
                <Textarea
                    label="Descrizione"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Testo descrittivo del contenuto"
                    rows={3}
                />
            </div>
        </form>
    );
}
```

- [ ] **Step 3: Crea FeaturedIdentityDrawer.tsx**

```typescript
// src/pages/Dashboard/Highlights/components/FeaturedIdentityDrawer.tsx
import React, { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { FeaturedIdentityForm } from "./FeaturedIdentityForm";
import type { FeaturedContent } from "@/services/supabase/featuredContents";

const FORM_ID = "featured-identity-form";

type Props = {
    open: boolean;
    onClose: () => void;
    content: FeaturedContent;
    tenantId: string;
    onSuccess: () => void;
};

export function FeaturedIdentityDrawer({
    open,
    onClose,
    content,
    tenantId,
    onSuccess
}: Props) {
    const [isSaving, setIsSaving] = useState(false);

    const handleSuccess = () => {
        onSuccess();
        onClose();
    };

    return (
        <SystemDrawer open={open} onClose={onClose} width={520}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Modifica identità
                    </Text>
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
                            Salva
                        </Button>
                    </>
                }
            >
                <FeaturedIdentityForm
                    formId={FORM_ID}
                    entityData={content}
                    tenantId={tenantId}
                    onSuccess={handleSuccess}
                    onSavingChange={setIsSaving}
                />
            </DrawerLayout>
        </SystemDrawer>
    );
}
```

- [ ] **Step 4: Verifica TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/Dashboard/Highlights/components/
git commit -m "feat(highlights): aggiungi FeaturedIdentityForm e FeaturedIdentityDrawer"
```

---

### Task 4: FeaturedCtaForm + FeaturedCtaDrawer

**Files:**
- Create: `src/pages/Dashboard/Highlights/components/FeaturedCtaForm.tsx`
- Create: `src/pages/Dashboard/Highlights/components/FeaturedCtaDrawer.tsx`

- [ ] **Step 1: Crea FeaturedCtaForm.tsx**

```typescript
// src/pages/Dashboard/Highlights/components/FeaturedCtaForm.tsx
import React, { useState, useEffect, useMemo } from "react";
import { TextInput } from "@/components/ui/Input/TextInput";
import {
    updateFeaturedContent,
    type FeaturedContent
} from "@/services/supabase/featuredContents";
import { useToast } from "@/context/Toast/ToastContext";

type Props = {
    formId: string;
    entityData: FeaturedContent;
    tenantId: string;
    onSuccess: () => void;
    onSavingChange: (saving: boolean) => void;
};

export function FeaturedCtaForm({
    formId,
    entityData,
    tenantId,
    onSuccess,
    onSavingChange
}: Props) {
    const { showToast } = useToast();
    const [ctaText, setCtaText] = useState(entityData.cta_text ?? "");
    const [ctaUrl, setCtaUrl] = useState(entityData.cta_url ?? "");

    useEffect(() => {
        setCtaText(entityData.cta_text ?? "");
        setCtaUrl(entityData.cta_url ?? "");
    }, [entityData]);

    const urlError = useMemo(() => {
        const trimmed = ctaUrl.trim();
        if (trimmed && !trimmed.startsWith("https://")) {
            return "Il link deve iniziare con https://";
        }
        return undefined;
    }, [ctaUrl]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (urlError) {
            showToast({ message: urlError, type: "error" });
            return;
        }
        onSavingChange(true);
        try {
            await updateFeaturedContent(entityData.id, tenantId, {
                cta_text: ctaText.trim() || null,
                cta_url: ctaUrl.trim() || null
            });
            showToast({ message: "Call to Action aggiornata.", type: "success" });
            onSuccess();
        } catch (err) {
            console.error(err);
            showToast({ message: "Errore durante il salvataggio.", type: "error" });
        } finally {
            onSavingChange(false);
        }
    };

    return (
        <form id={formId} onSubmit={handleSubmit}>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <TextInput
                    label="Testo pulsante"
                    value={ctaText}
                    onChange={e => setCtaText(e.target.value)}
                    placeholder="Es: Scopri di più"
                />
                <TextInput
                    label="Link pulsante"
                    value={ctaUrl}
                    onChange={e => setCtaUrl(e.target.value)}
                    placeholder="https://..."
                    error={urlError}
                />
            </div>
        </form>
    );
}
```

- [ ] **Step 2: Crea FeaturedCtaDrawer.tsx**

```typescript
// src/pages/Dashboard/Highlights/components/FeaturedCtaDrawer.tsx
import React, { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { FeaturedCtaForm } from "./FeaturedCtaForm";
import type { FeaturedContent } from "@/services/supabase/featuredContents";

const FORM_ID = "featured-cta-form";

type Props = {
    open: boolean;
    onClose: () => void;
    content: FeaturedContent;
    tenantId: string;
    onSuccess: () => void;
};

export function FeaturedCtaDrawer({ open, onClose, content, tenantId, onSuccess }: Props) {
    const [isSaving, setIsSaving] = useState(false);

    const handleSuccess = () => {
        onSuccess();
        onClose();
    };

    return (
        <SystemDrawer open={open} onClose={onClose} width={480}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Modifica call to action
                    </Text>
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
                            Salva
                        </Button>
                    </>
                }
            >
                <FeaturedCtaForm
                    formId={FORM_ID}
                    entityData={content}
                    tenantId={tenantId}
                    onSuccess={handleSuccess}
                    onSavingChange={setIsSaving}
                />
            </DrawerLayout>
        </SystemDrawer>
    );
}
```

- [ ] **Step 3: Verifica TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/Dashboard/Highlights/components/FeaturedCtaForm.tsx src/pages/Dashboard/Highlights/components/FeaturedCtaDrawer.tsx
git commit -m "feat(highlights): aggiungi FeaturedCtaForm e FeaturedCtaDrawer"
```

---

### Task 5: FeaturedPricingModeForm + FeaturedPricingModeDrawer

**Files:**
- Create: `src/pages/Dashboard/Highlights/components/FeaturedPricingModeForm.tsx`
- Create: `src/pages/Dashboard/Highlights/components/FeaturedPricingModeForm.module.scss`
- Create: `src/pages/Dashboard/Highlights/components/FeaturedPricingModeDrawer.tsx`

- [ ] **Step 1: Crea FeaturedPricingModeForm.module.scss**

```scss
/* src/pages/Dashboard/Highlights/components/FeaturedPricingModeForm.module.scss */
.pricingOptions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.pricingCard {
  border: 2px solid var(--border-subtle, #e5e7eb);
  border-radius: 10px;
  padding: 16px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
  display: flex;
  flex-direction: column;
  gap: 6px;
  user-select: none;

  &:hover {
    border-color: var(--color-primary, #6366f1);
    background: var(--surface-hover, #f8f8ff);
  }
}

.pricingCardSelected {
  border-color: var(--color-primary, #6366f1);
  background: var(--surface-selected, #f0f0ff);
}

.pricingCardIcon {
  font-size: 1.25rem;
  margin-bottom: 4px;
}

.pricingCardLabel {
  font-weight: 600;
  font-size: 0.9375rem;
}

.pricingCardDescription {
  font-size: 0.8125rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.pricingExtra {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: var(--surface-secondary, #f9fafb);
  border-radius: 8px;
  border: 1px solid var(--border-subtle, #e5e7eb);
  margin-top: 4px;
}
```

- [ ] **Step 2: Crea FeaturedPricingModeForm.tsx**

```typescript
// src/pages/Dashboard/Highlights/components/FeaturedPricingModeForm.tsx
import React, { useState, useEffect } from "react";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Switch } from "@/components/ui/Switch/Switch";
import {
    updateFeaturedContent,
    type FeaturedContent,
    type FeaturedContentPricingMode
} from "@/services/supabase/featuredContents";
import { useToast } from "@/context/Toast/ToastContext";
import styles from "./FeaturedPricingModeForm.module.scss";

const PRICING_OPTIONS: {
    value: FeaturedContentPricingMode;
    label: string;
    description: string;
    icon: string;
}[] = [
    {
        value: "none",
        label: "Solo informativo",
        description: "Banner editoriale senza listino prezzi. Titolo, testo e CTA.",
        icon: "📄"
    },
    {
        value: "per_item",
        label: "Con prodotti",
        description: "Mostra una lista di prodotti con il loro prezzo singolo.",
        icon: "🛒"
    },
    {
        value: "bundle",
        label: "Prezzo fisso",
        description: "Aggrega prodotti con un unico prezzo bundle definito da te.",
        icon: "🎁"
    }
];

type Props = {
    formId: string;
    entityData: FeaturedContent;
    tenantId: string;
    onSuccess: () => void;
    onSavingChange: (saving: boolean) => void;
};

export function FeaturedPricingModeForm({
    formId,
    entityData,
    tenantId,
    onSuccess,
    onSavingChange
}: Props) {
    const { showToast } = useToast();
    const [pricingMode, setPricingMode] = useState<FeaturedContentPricingMode>(
        entityData.pricing_mode
    );
    const [bundlePrice, setBundlePrice] = useState(
        entityData.bundle_price != null ? String(entityData.bundle_price) : ""
    );
    const [showOriginalTotal, setShowOriginalTotal] = useState(entityData.show_original_total);

    useEffect(() => {
        setPricingMode(entityData.pricing_mode);
        setBundlePrice(entityData.bundle_price != null ? String(entityData.bundle_price) : "");
        setShowOriginalTotal(entityData.show_original_total);
    }, [entityData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (pricingMode === "bundle") {
            const price = parseFloat(bundlePrice);
            if (!Number.isFinite(price) || price <= 0) {
                showToast({ message: "Inserisci un prezzo fisso valido (> 0).", type: "error" });
                return;
            }
        }
        onSavingChange(true);
        try {
            const bundlePriceNum =
                pricingMode === "bundle" ? parseFloat(bundlePrice) : null;
            await updateFeaturedContent(entityData.id, tenantId, {
                pricing_mode: pricingMode,
                bundle_price: bundlePriceNum,
                show_original_total: pricingMode === "bundle" ? showOriginalTotal : false
            });
            showToast({ message: "Modalità aggiornata.", type: "success" });
            onSuccess();
        } catch (err) {
            console.error(err);
            showToast({ message: "Errore durante il salvataggio.", type: "error" });
        } finally {
            onSavingChange(false);
        }
    };

    return (
        <form id={formId} onSubmit={handleSubmit}>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                <div className={styles.pricingOptions}>
                    {PRICING_OPTIONS.map(opt => (
                        <div
                            key={opt.value}
                            className={`${styles.pricingCard} ${
                                pricingMode === opt.value ? styles.pricingCardSelected : ""
                            }`}
                            onClick={() => setPricingMode(opt.value)}
                        >
                            <span className={styles.pricingCardIcon}>{opt.icon}</span>
                            <span className={styles.pricingCardLabel}>{opt.label}</span>
                            <span className={styles.pricingCardDescription}>{opt.description}</span>
                        </div>
                    ))}
                </div>

                {pricingMode === "bundle" && (
                    <div className={styles.pricingExtra}>
                        <TextInput
                            label="Prezzo fisso (€) *"
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={bundlePrice}
                            onChange={e => setBundlePrice(e.target.value)}
                            placeholder="Es: 25.00"
                        />
                        <Switch
                            label="Mostra totale originale barrato"
                            description="Mostra la somma dei prezzi singoli barrata accanto al prezzo bundle"
                            checked={showOriginalTotal}
                            onChange={setShowOriginalTotal}
                        />
                    </div>
                )}
            </div>
        </form>
    );
}
```

- [ ] **Step 3: Crea FeaturedPricingModeDrawer.tsx**

```typescript
// src/pages/Dashboard/Highlights/components/FeaturedPricingModeDrawer.tsx
import React, { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { FeaturedPricingModeForm } from "./FeaturedPricingModeForm";
import type { FeaturedContent } from "@/services/supabase/featuredContents";

const FORM_ID = "featured-pricing-mode-form";

type Props = {
    open: boolean;
    onClose: () => void;
    content: FeaturedContent;
    tenantId: string;
    onSuccess: () => void;
};

export function FeaturedPricingModeDrawer({
    open,
    onClose,
    content,
    tenantId,
    onSuccess
}: Props) {
    const [isSaving, setIsSaving] = useState(false);

    const handleSuccess = () => {
        onSuccess();
        onClose();
    };

    return (
        <SystemDrawer open={open} onClose={onClose} width={560}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Modifica modalità contenuto
                    </Text>
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
                            Salva
                        </Button>
                    </>
                }
            >
                <FeaturedPricingModeForm
                    formId={FORM_ID}
                    entityData={content}
                    tenantId={tenantId}
                    onSuccess={handleSuccess}
                    onSavingChange={setIsSaving}
                />
            </DrawerLayout>
        </SystemDrawer>
    );
}
```

- [ ] **Step 4: Verifica TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/Dashboard/Highlights/components/FeaturedPricingModeForm.tsx \
        src/pages/Dashboard/Highlights/components/FeaturedPricingModeForm.module.scss \
        src/pages/Dashboard/Highlights/components/FeaturedPricingModeDrawer.tsx
git commit -m "feat(highlights): aggiungi FeaturedPricingModeForm e FeaturedPricingModeDrawer"
```

---

### Task 6: FeaturedMediaDrawer

**Files:**
- Create: `src/pages/Dashboard/Highlights/components/FeaturedMediaDrawer.tsx`
- Create: `src/pages/Dashboard/Highlights/components/FeaturedMediaDrawer.module.scss`

- [ ] **Step 1: Crea FeaturedMediaDrawer.module.scss**

```scss
/* src/pages/Dashboard/Highlights/components/FeaturedMediaDrawer.module.scss */
.uploadArea {
  border: 2px dashed var(--border-subtle, #e0e0e0);
  border-radius: 10px;
  padding: 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
  text-align: center;

  &:hover {
    border-color: var(--color-primary, #6366f1);
    background: var(--surface-hover, #f8f8ff);
  }
}

.uploadAreaDragging {
  border-color: var(--color-primary, #6366f1);
  background: var(--surface-selected, #f0f0ff);
}

.preview {
  position: relative;
  width: 100%;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--border-subtle, #e5e7eb);
  background: var(--surface-secondary, #f9fafb);
}

.previewImg {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  display: block;
}

.previewOverlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s ease;

  .preview:hover & {
    background: rgba(0, 0, 0, 0.35);
  }
}

.previewRemoveBtn {
  opacity: 0;
  transition: opacity 0.2s ease;
  background: #fff;
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-error, #ef4444);

  .preview:hover & {
    opacity: 1;
  }
}

.fileInputHidden {
  display: none;
}
```

- [ ] **Step 2: Crea FeaturedMediaDrawer.tsx**

```typescript
// src/pages/Dashboard/Highlights/components/FeaturedMediaDrawer.tsx
import React, { useState, useRef } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { Image } from "lucide-react";
import {
    updateFeaturedContent,
    type FeaturedContent
} from "@/services/supabase/featuredContents";
import { uploadFeaturedContentImage } from "@/services/supabase/upload";
import { compressImage } from "@/utils/compressImage";
import { useToast } from "@/context/Toast/ToastContext";
import styles from "./FeaturedMediaDrawer.module.scss";

type Props = {
    open: boolean;
    onClose: () => void;
    content: FeaturedContent;
    tenantId: string;
    onSuccess: () => void;
};

export function FeaturedMediaDrawer({ open, onClose, content, tenantId, onSuccess }: Props) {
    const { showToast } = useToast();
    const [isUploading, setIsUploading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFile = async (file: File) => {
        if (!file.type.startsWith("image/")) {
            showToast({ type: "error", message: "Seleziona un'immagine (PNG, JPG, WEBP)" });
            return;
        }
        try {
            setIsUploading(true);
            const compressed = await compressImage(file, 1200, 0.85);
            const url = await uploadFeaturedContentImage(tenantId, content.id, compressed);
            await updateFeaturedContent(content.id, tenantId, { media_id: url });
            showToast({ type: "success", message: "Immagine caricata" });
            onSuccess();
            onClose();
        } catch (err) {
            console.error(err);
            showToast({ type: "error", message: "Errore durante il caricamento dell'immagine" });
        } finally {
            setIsUploading(false);
        }
    };

    const handleRemove = async () => {
        try {
            setIsUploading(true);
            await updateFeaturedContent(content.id, tenantId, { media_id: null });
            showToast({ type: "success", message: "Immagine rimossa" });
            onSuccess();
            onClose();
        } catch (err) {
            console.error(err);
            showToast({ type: "error", message: "Errore nella rimozione dell'immagine" });
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <SystemDrawer open={open} onClose={onClose} width={480}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Modifica immagine
                    </Text>
                }
                footer={
                    <Button variant="secondary" onClick={onClose} disabled={isUploading}>
                        Chiudi
                    </Button>
                }
            >
                {content.media_id ? (
                    <div className={styles.preview}>
                        <img
                            src={content.media_id}
                            alt="Anteprima"
                            className={styles.previewImg}
                        />
                        <div className={styles.previewOverlay}>
                            <button
                                type="button"
                                className={styles.previewRemoveBtn}
                                onClick={handleRemove}
                                disabled={isUploading}
                            >
                                Rimuovi
                            </button>
                        </div>
                    </div>
                ) : (
                    <div
                        className={`${styles.uploadArea} ${
                            isDragging ? styles.uploadAreaDragging : ""
                        }`}
                        onClick={() => !isUploading && fileInputRef.current?.click()}
                        onDragOver={e => {
                            e.preventDefault();
                            setIsDragging(true);
                        }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={e => {
                            e.preventDefault();
                            setIsDragging(false);
                            const file = e.dataTransfer.files[0];
                            if (file) handleFile(file);
                        }}
                    >
                        {isUploading ? (
                            <Text colorVariant="muted">Caricamento in corso...</Text>
                        ) : (
                            <>
                                <Image size={28} strokeWidth={1.5} />
                                <Text variant="body" weight={500}>
                                    Trascina qui o clicca per caricare
                                </Text>
                                <Text variant="caption" colorVariant="muted">
                                    PNG, JPG, WEBP — max 5 MB
                                </Text>
                            </>
                        )}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className={styles.fileInputHidden}
                            onChange={e => {
                                const f = e.target.files?.[0];
                                if (f) {
                                    handleFile(f);
                                    e.target.value = "";
                                }
                            }}
                        />
                    </div>
                )}
            </DrawerLayout>
        </SystemDrawer>
    );
}
```

- [ ] **Step 3: Verifica TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/Dashboard/Highlights/components/FeaturedMediaDrawer.tsx \
        src/pages/Dashboard/Highlights/components/FeaturedMediaDrawer.module.scss
git commit -m "feat(highlights): aggiungi FeaturedMediaDrawer con upload drag-and-drop"
```

---

## Chunk 3: Riscrittura FeaturedContentDetailPage

### Task 7: Aggiorna FeaturedContentDetailPage.module.scss

**Files:**
- Modify: `src/pages/Dashboard/Highlights/FeaturedContentDetailPage.module.scss`

- [ ] **Step 1: Rimuovi classi non più usate**

Dal file `.module.scss` della pagina dettaglio, rimuovi i seguenti blocchi (usati solo nell'editing inline che verrà rimosso):

```scss
/* RIMUOVI questi blocchi: */
.blockSaveBar { ... }
.pricingOptions { ... }
.pricingCard { ... }
.pricingCardSelected { ... }
.pricingCardLabel { ... }
.pricingCardDescription { ... }
.pricingCardIcon { ... }
.pricingExtra { ... }
.mediaUploadArea { ... }
.mediaUploadAreaDragging { ... }
.mediaPreviewOverlay { ... }    /* si sposta in FeaturedMediaDrawer.module.scss */
.mediaPreviewRemoveBtn { ... }  /* si sposta in FeaturedMediaDrawer.module.scss */
.modeWarning { ... }
.headerBadges { ... }
.fileInputHidden { ... }
```

Mantieni: `.wrapper`, `.block`, `.blockTitle`, `.row2col`, `.mediaPreview`, `.mediaPreviewImg`, `.productsEmptyState`.

- [ ] **Step 2: Aggiungi le nuove classi per il layout read-only**

Aggiungi in fondo al file:

```scss
/* ── Read-only info layout ───────────────────────────── */
.blockHeaderRow {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle, #e5e7eb);
  margin-bottom: 16px;
}

.blockHeaderTitle {
  font-size: 0.8125rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin: 0;
}

.readOnlyGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.roField {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.roFieldFull {
  grid-column: 1 / -1;
}

.roLabel {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.roValue {
  font-size: 0.9375rem;
  color: var(--text-primary, #111827);
  line-height: 1.5;
}

.roValueEmpty {
  font-size: 0.9375rem;
  color: var(--text-muted);
  font-style: italic;
}

.mediaPlaceholder {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
  background: var(--surface-secondary, #f9fafb);
  border: 1px dashed var(--border-subtle, #e5e7eb);
  border-radius: 8px;
  color: var(--text-muted);
  font-size: 0.875rem;
}

.pricingModeRow {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pricingModeLabel {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.pricingModeDetail {
  font-size: 0.875rem;
  color: var(--text-muted);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/Dashboard/Highlights/FeaturedContentDetailPage.module.scss
git commit -m "style(highlights): aggiorna module.scss per layout read-only della pagina dettaglio"
```

---

### Task 8: Riscrivi FeaturedContentDetailPage.tsx

**Files:**
- Modify: `src/pages/Dashboard/Highlights/FeaturedContentDetailPage.tsx`

- [ ] **Step 1: Riscrivi il file completo**

Sostituisci l'intero contenuto di `src/pages/Dashboard/Highlights/FeaturedContentDetailPage.tsx` con:

```typescript
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Text from "@/components/ui/Text/Text";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/Button/Button";
import { useToast } from "@/context/Toast/ToastContext";
import Breadcrumb from "@/components/ui/Breadcrumb/Breadcrumb";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { Pencil, Image } from "lucide-react";
import ProductPickerList from "./ProductPickerList";
import ProductsManagerCard from "./ProductsManagerCard";
import {
    type FeaturedContentWithProducts,
    type FeaturedContentPricingMode,
    getFeaturedContentById
} from "@/services/supabase/featuredContents";
import { useTenantId } from "@/context/useTenantId";
import { FeaturedIdentityDrawer } from "./components/FeaturedIdentityDrawer";
import { FeaturedMediaDrawer } from "./components/FeaturedMediaDrawer";
import { FeaturedPricingModeDrawer } from "./components/FeaturedPricingModeDrawer";
import { FeaturedCtaDrawer } from "./components/FeaturedCtaDrawer";
import styles from "./FeaturedContentDetailPage.module.scss";

const PRICING_MODE_LABELS: Record<FeaturedContentPricingMode, string> = {
    none: "Solo informativo",
    per_item: "Con prodotti",
    bundle: "Prezzo fisso"
};

export default function FeaturedContentDetailPage() {
    const { featuredId } = useParams<{ featuredId: string }>();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const tenantId = useTenantId();

    const [content, setContent] = useState<FeaturedContentWithProducts | null>(null);
    const [loading, setLoading] = useState(true);
    const [pageError, setPageError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"info" | "products">("info");

    // Drawer open states
    const [isIdentityDrawerOpen, setIsIdentityDrawerOpen] = useState(false);
    const [isMediaDrawerOpen, setIsMediaDrawerOpen] = useState(false);
    const [isPricingDrawerOpen, setIsPricingDrawerOpen] = useState(false);
    const [isCtaDrawerOpen, setIsCtaDrawerOpen] = useState(false);

    // Product picker state
    const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
    const [linkedProductIds, setLinkedProductIds] = useState<string[]>([]);
    const [pendingSelectedProductIds, setPendingSelectedProductIds] = useState<string[]>([]);
    const onApplyProductsRef = useRef<((ids: string[]) => Promise<void>) | null>(null);

    const loadContent = useCallback(async () => {
        if (!featuredId || !tenantId) return;
        try {
            setLoading(true);
            setPageError(null);
            const data = await getFeaturedContentById(featuredId, tenantId);
            setContent(data);
        } catch (err) {
            console.error(err);
            setPageError("Impossibile caricare il contenuto.");
            showToast({ type: "error", message: "Errore nel caricamento del contenuto." });
        } finally {
            setLoading(false);
        }
    }, [featuredId, tenantId, showToast]);

    useEffect(() => {
        loadContent();
    }, [loadContent]);

    const closeProductPicker = () => {
        setIsProductPickerOpen(false);
        setPendingSelectedProductIds([]);
    };

    const hasPendingProductChanges = useCallback(() => {
        const orig = new Set(linkedProductIds);
        const pend = new Set(pendingSelectedProductIds);
        if (orig.size !== pend.size) return true;
        for (const id of orig) {
            if (!pend.has(id)) return true;
        }
        return false;
    }, [linkedProductIds, pendingSelectedProductIds]);

    const applyProductSelection = async () => {
        if (!onApplyProductsRef.current) return;
        try {
            await onApplyProductsRef.current(pendingSelectedProductIds);
            closeProductPicker();
        } catch (err) {
            console.error(err);
            showToast({ type: "error", message: "Errore nel salvataggio selezione prodotti." });
        }
    };

    const breadcrumbItems = [
        { label: "Contenuti in evidenza", to: `/business/${tenantId}/featured` },
        { label: loading ? "Caricamento..." : content?.title || "Dettaglio" }
    ];

    if (pageError) {
        return (
            <div className={styles.wrapper}>
                <Breadcrumb items={breadcrumbItems} />
                <Text variant="title-sm" colorVariant="error">
                    {pageError}
                </Text>
                <Button
                    variant="secondary"
                    onClick={() => navigate(`/business/${tenantId}/featured`)}
                >
                    Torna alla lista
                </Button>
            </div>
        );
    }

    const renderInfoCard = () => (
        <Card>
            {/* ── Identità ────────────────────────────────── */}
            <div className={styles.block}>
                <div className={styles.blockHeaderRow}>
                    <p className={styles.blockHeaderTitle}>Identità</p>
                    <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Pencil size={14} />}
                        onClick={() => setIsIdentityDrawerOpen(true)}
                        disabled={loading}
                    >
                        Modifica
                    </Button>
                </div>
                <div className={styles.readOnlyGrid}>
                    <div className={styles.roField}>
                        <span className={styles.roLabel}>Titolo</span>
                        <span className={styles.roValue}>{content?.title || "—"}</span>
                    </div>
                    <div className={styles.roField}>
                        <span className={styles.roLabel}>Nome interno</span>
                        <span className={styles.roValue}>{content?.internal_name || "—"}</span>
                    </div>
                    <div className={styles.roField}>
                        <span className={styles.roLabel}>Sottotitolo</span>
                        {content?.subtitle ? (
                            <span className={styles.roValue}>{content.subtitle}</span>
                        ) : (
                            <span className={styles.roValueEmpty}>Non impostato</span>
                        )}
                    </div>
                    <div className={`${styles.roField} ${styles.roFieldFull}`}>
                        <span className={styles.roLabel}>Descrizione</span>
                        {content?.description ? (
                            <span className={styles.roValue}>{content.description}</span>
                        ) : (
                            <span className={styles.roValueEmpty}>Nessuna descrizione</span>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Immagine ─────────────────────────────────── */}
            <div className={styles.block}>
                <div className={styles.blockHeaderRow}>
                    <p className={styles.blockHeaderTitle}>Immagine</p>
                    <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Pencil size={14} />}
                        onClick={() => setIsMediaDrawerOpen(true)}
                        disabled={loading}
                    >
                        Modifica
                    </Button>
                </div>
                {content?.media_id ? (
                    <div className={styles.mediaPreview}>
                        <img
                            src={content.media_id}
                            alt="Anteprima"
                            className={styles.mediaPreviewImg}
                        />
                    </div>
                ) : (
                    <div className={styles.mediaPlaceholder}>
                        <Image size={20} strokeWidth={1.5} />
                        <span>Nessuna immagine caricata</span>
                    </div>
                )}
            </div>

            {/* ── Modalità contenuto ───────────────────────── */}
            <div className={styles.block}>
                <div className={styles.blockHeaderRow}>
                    <p className={styles.blockHeaderTitle}>Modalità contenuto</p>
                    <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Pencil size={14} />}
                        onClick={() => setIsPricingDrawerOpen(true)}
                        disabled={loading}
                    >
                        Modifica
                    </Button>
                </div>
                <div className={styles.pricingModeRow}>
                    <span className={styles.pricingModeLabel}>
                        {content ? PRICING_MODE_LABELS[content.pricing_mode] : "—"}
                    </span>
                    {content?.pricing_mode === "bundle" &&
                        content.bundle_price != null && (
                            <span className={styles.pricingModeDetail}>
                                Prezzo:{" "}
                                {new Intl.NumberFormat("it-IT", {
                                    style: "currency",
                                    currency: "EUR"
                                }).format(content.bundle_price)}
                            </span>
                        )}
                    {content?.pricing_mode === "bundle" && content.show_original_total && (
                        <span className={styles.pricingModeDetail}>
                            Mostra totale originale: Sì
                        </span>
                    )}
                </div>
            </div>

            {/* ── Call to Action ───────────────────────────── */}
            <div className={styles.block}>
                <div className={styles.blockHeaderRow}>
                    <p className={styles.blockHeaderTitle}>Call to Action</p>
                    <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Pencil size={14} />}
                        onClick={() => setIsCtaDrawerOpen(true)}
                        disabled={loading}
                    >
                        Modifica
                    </Button>
                </div>
                {content?.cta_text || content?.cta_url ? (
                    <div className={styles.readOnlyGrid}>
                        {content?.cta_text && (
                            <div className={styles.roField}>
                                <span className={styles.roLabel}>Testo pulsante</span>
                                <span className={styles.roValue}>{content.cta_text}</span>
                            </div>
                        )}
                        {content?.cta_url && (
                            <div className={styles.roField}>
                                <span className={styles.roLabel}>Link pulsante</span>
                                <span className={styles.roValue}>{content.cta_url}</span>
                            </div>
                        )}
                    </div>
                ) : (
                    <span className={styles.roValueEmpty}>Nessuna CTA configurata</span>
                )}
            </div>
        </Card>
    );

    return (
        <div className={styles.wrapper}>
            <Breadcrumb items={breadcrumbItems} />

            <PageHeader
                title={loading ? "Caricamento..." : content?.title || "Senza titolo"}
                subtitle={loading ? "" : content?.internal_name || ""}
            />

            <Tabs
                value={activeTab}
                onChange={(v: "info" | "products") => setActiveTab(v)}
            >
                <Tabs.List>
                    <Tabs.Tab value="info">Informazioni</Tabs.Tab>
                    <Tabs.Tab value="products">Prodotti inclusi</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="info">{renderInfoCard()}</Tabs.Panel>

                <Tabs.Panel value="products">
                    {content?.pricing_mode === "none" ? (
                        <Card>
                            <div className={styles.productsEmptyState}>
                                <Text colorVariant="muted">
                                    Seleziona la modalità &quot;Con prodotti&quot; o
                                    &quot;Prezzo fisso&quot; per associare prodotti a questo
                                    contenuto.
                                </Text>
                            </div>
                        </Card>
                    ) : (
                        <ProductsManagerCard
                            featuredId={featuredId as string}
                            pricingMode={content?.pricing_mode ?? "none"}
                            showOriginalTotal={content?.show_original_total ?? false}
                            onOpenProductPicker={(linkedIds, onApply) => {
                                setLinkedProductIds(linkedIds);
                                setPendingSelectedProductIds(linkedIds);
                                onApplyProductsRef.current = onApply;
                                setIsProductPickerOpen(true);
                            }}
                        />
                    )}
                </Tabs.Panel>
            </Tabs>

            {/* ── Section drawers ──────────────────────────── */}
            {content && tenantId && (
                <>
                    <FeaturedIdentityDrawer
                        open={isIdentityDrawerOpen}
                        onClose={() => setIsIdentityDrawerOpen(false)}
                        content={content}
                        tenantId={tenantId}
                        onSuccess={loadContent}
                    />
                    <FeaturedMediaDrawer
                        open={isMediaDrawerOpen}
                        onClose={() => setIsMediaDrawerOpen(false)}
                        content={content}
                        tenantId={tenantId}
                        onSuccess={loadContent}
                    />
                    <FeaturedPricingModeDrawer
                        open={isPricingDrawerOpen}
                        onClose={() => setIsPricingDrawerOpen(false)}
                        content={content}
                        tenantId={tenantId}
                        onSuccess={loadContent}
                    />
                    <FeaturedCtaDrawer
                        open={isCtaDrawerOpen}
                        onClose={() => setIsCtaDrawerOpen(false)}
                        content={content}
                        tenantId={tenantId}
                        onSuccess={loadContent}
                    />
                </>
            )}

            {/* ── Product picker drawer ────────────────────── */}
            <SystemDrawer open={isProductPickerOpen} onClose={closeProductPicker} width={640}>
                <DrawerLayout
                    header={
                        <Text variant="title-sm" weight={700}>
                            Aggiungi prodotto
                        </Text>
                    }
                    footer={
                        <>
                            <Button variant="secondary" onClick={closeProductPicker}>
                                Annulla
                            </Button>
                            <Button
                                variant="primary"
                                onClick={applyProductSelection}
                                disabled={!hasPendingProductChanges()}
                            >
                                Applica
                            </Button>
                        </>
                    }
                >
                    <ProductPickerList
                        selectedProductIds={pendingSelectedProductIds}
                        onSelectionChange={setPendingSelectedProductIds}
                    />
                </DrawerLayout>
            </SystemDrawer>
        </div>
    );
}
```

- [ ] **Step 2: Verifica TypeScript — nessun errore**

```bash
npx tsc --noEmit 2>&1 | head -60
```

Expected: 0 errori. Se Button non supporta `leftIcon`, controlla `src/components/ui/Button/Button.tsx` e adatta (usa children con icona inline se necessario).

- [ ] **Step 3: Commit**

```bash
git add src/pages/Dashboard/Highlights/FeaturedContentDetailPage.tsx \
        src/pages/Dashboard/Highlights/FeaturedContentDetailPage.module.scss
git commit -m "refactor(highlights): converti tab Informazioni al pattern read-only + drawer"
```

---

## Chunk 4: Refactor ProductsManagerCard

### Task 9: Converti ProductsManagerCard a salvataggio immediato

**Files:**
- Modify: `src/pages/Dashboard/Highlights/ProductsManagerCard.tsx`

- [ ] **Step 1: Riscrivi il file completo**

Sostituisci l'intero contenuto di `src/pages/Dashboard/Highlights/ProductsManagerCard.tsx` con:

```typescript
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Card } from "@/components/ui/Card/Card";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { TextInput } from "@/components/ui/Input/TextInput";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { useToast } from "@/context/Toast/ToastContext";
import { useTenantId } from "@/context/useTenantId";
import { supabase } from "@/services/supabase/client";
import { GripVertical, Trash2 } from "lucide-react";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface ProductsManagerCardProps {
    featuredId: string;
    pricingMode: "none" | "per_item" | "bundle";
    showOriginalTotal: boolean;
    onOpenProductPicker?: (
        linkedIds: string[],
        onApply: (productIds: string[]) => Promise<void>
    ) => void;
}

interface FeaturedContentProductRow {
    id: string;
    featured_content_id: string;
    product_id: string;
    sort_order: number;
    note: string | null;
    products: {
        id: string;
        name: string;
        base_price: number | null;
        option_groups: Array<{
            group_kind: string;
            values: Array<{ absolute_price: number | null }>;
        }> | null;
    } | null;
}

type SortableDataTableRowProps = {
    children: React.ReactNode;
    id: string;
};

const SortableDataTableRow = ({ children, id }: SortableDataTableRowProps) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id
    });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 1 : 0,
        position: "relative",
        opacity: isDragging ? 0.55 : 1
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes}>
            {React.Children.map(children, child => {
                if (React.isValidElement(child)) {
                    return React.cloneElement(child as React.ReactElement<{ dragHandleProps?: unknown }>, {
                        dragHandleProps: listeners
                    });
                }
                return child;
            })}
        </div>
    );
};

function normalizeNote(note: string | null): string | null {
    if (note === "") return null;
    return note;
}

function reindexRows(rows: FeaturedContentProductRow[]): FeaturedContentProductRow[] {
    return rows.map((row, index) => ({ ...row, sort_order: index + 1 }));
}

export default function ProductsManagerCard({
    featuredId,
    pricingMode,
    showOriginalTotal,
    onOpenProductPicker
}: ProductsManagerCardProps) {
    const { showToast } = useToast();
    const tenantId = useTenantId();

    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [products, setProducts] = useState<FeaturedContentProductRow[]>([]);

    const loadProducts = useCallback(async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from("featured_content_products")
                .select(
                    `
                    id,
                    featured_content_id,
                    product_id,
                    sort_order,
                    note,
                    products (id, name, base_price, option_groups:product_option_groups(group_kind, values:product_option_values(absolute_price)))
                `
                )
                .eq("featured_content_id", featuredId)
                .order("sort_order", { ascending: true });

            if (error) throw error;
            setProducts(reindexRows((data as unknown as FeaturedContentProductRow[]) ?? []));
        } catch (err) {
            console.error(err);
            showToast({ type: "error", message: "Errore nel caricamento dei prodotti associati." });
        } finally {
            setLoading(false);
        }
    }, [featuredId, showToast]);

    useEffect(() => {
        loadProducts();
    }, [loadProducts]);

    const handleDelete = async (dbId: string) => {
        try {
            setIsSaving(true);
            const { error } = await supabase
                .from("featured_content_products")
                .delete()
                .eq("id", dbId);
            if (error) throw error;
            showToast({ type: "success", message: "Prodotto rimosso." });
            await loadProducts();
        } catch (err) {
            console.error(err);
            showToast({ type: "error", message: "Errore nella rimozione del prodotto." });
        } finally {
            setIsSaving(false);
        }
    };

    const handleNoteChange = (dbId: string, newNote: string) => {
        setProducts(prev =>
            prev.map(row => (row.id === dbId ? { ...row, note: newNote } : row))
        );
    };

    const handleNoteBlur = async (dbId: string, note: string) => {
        const { error } = await supabase
            .from("featured_content_products")
            .update({ note: normalizeNote(note) })
            .eq("id", dbId);
        if (error) {
            console.error(error);
            showToast({ type: "error", message: "Errore nel salvataggio della nota." });
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = products.findIndex(row => row.id === active.id);
        const newIndex = products.findIndex(row => row.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return;

        const reindexed = reindexRows(arrayMove(products, oldIndex, newIndex));
        setProducts(reindexed); // ottimistico

        try {
            const results = await Promise.all(
                reindexed.map(row =>
                    supabase
                        .from("featured_content_products")
                        .update({ sort_order: row.sort_order })
                        .eq("id", row.id)
                )
            );
            const failed = results.find(r => r.error);
            if (failed?.error) throw failed.error;
        } catch (err) {
            console.error(err);
            showToast({ type: "error", message: "Errore nel salvataggio dell'ordine." });
            await loadProducts(); // rollback
        }
    };

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates
        })
    );

    const handleOpenAddModal = () => {
        if (!onOpenProductPicker) return;

        onOpenProductPicker(
            products.map(row => row.product_id),
            async (selectedProductIds: string[]) => {
                if (!tenantId) {
                    showToast({ type: "error", message: "Tenant non selezionato. Riprova." });
                    return;
                }

                const dedupedSelection = Array.from(new Set(selectedProductIds));
                const existingByProductId = new Map(products.map(row => [row.product_id, row]));

                const toRemoveIds = products
                    .filter(row => !dedupedSelection.includes(row.product_id))
                    .map(row => row.id);

                const toAddProductIds = dedupedSelection.filter(
                    id => !existingByProductId.has(id)
                );

                try {
                    setIsSaving(true);
                    const ops: Promise<void>[] = [];

                    if (toRemoveIds.length > 0) {
                        ops.push(
                            supabase
                                .from("featured_content_products")
                                .delete()
                                .in("id", toRemoveIds)
                                .then(({ error }) => {
                                    if (error) throw error;
                                })
                        );
                    }

                    if (toAddProductIds.length > 0) {
                        const payload = toAddProductIds.map((productId, idx) => ({
                            tenant_id: tenantId,
                            featured_content_id: featuredId,
                            product_id: productId,
                            sort_order: products.length + idx + 1,
                            note: null
                        }));
                        ops.push(
                            supabase
                                .from("featured_content_products")
                                .insert(payload)
                                .then(({ error }) => {
                                    if (error) throw error;
                                })
                        );
                    }

                    await Promise.all(ops);
                    showToast({ type: "success", message: "Prodotti aggiornati." });
                    await loadProducts();
                } catch (err) {
                    console.error(err);
                    showToast({
                        type: "error",
                        message: "Errore durante il salvataggio dei prodotti."
                    });
                } finally {
                    setIsSaving(false);
                }
            }
        );
    };

    const showPriceColumn =
        pricingMode === "per_item" || (pricingMode === "bundle" && showOriginalTotal);

    const columns = useMemo<ColumnDefinition<FeaturedContentProductRow>[]>(
        () => [
            {
                id: "drag",
                header: "",
                width: "52px",
                align: "center",
                cell: (_value, _row, _rowIndex, dragHandleProps?: unknown) => (
                    <button
                        type="button"
                        aria-label="Trascina per riordinare"
                        {...(dragHandleProps as React.HTMLAttributes<HTMLButtonElement>)}
                        style={{
                            cursor: "grab",
                            border: "none",
                            background: "transparent",
                            color: "var(--text-muted)",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "4px",
                            borderRadius: "4px"
                        }}
                    >
                        <GripVertical size={16} />
                    </button>
                )
            },
            {
                id: "name",
                header: "Nome prodotto",
                accessor: row => row.products?.name ?? "Sconosciuto",
                width: "2fr",
                cell: value => (
                    <Text variant="body-sm" weight={600}>
                        {String(value)}
                    </Text>
                )
            },
            {
                id: "note",
                header: "Nota",
                width: "2fr",
                cell: (_value, row) => (
                    <TextInput
                        value={row.note ?? ""}
                        placeholder="Aggiungi una nota..."
                        onChange={event => handleNoteChange(row.id, event.target.value)}
                        onBlur={event => handleNoteBlur(row.id, event.target.value)}
                    />
                )
            },
            ...(showPriceColumn
                ? [
                      {
                          id: "price" as const,
                          header: "Prezzo",
                          width: "100px",
                          align: "right" as const,
                          accessor: (row: FeaturedContentProductRow) =>
                              row.products?.base_price ?? null,
                          cell: (value: unknown) => {
                              const price = value as number | null | undefined;
                              if (price == null) {
                                  return (
                                      <Text variant="body-sm" colorVariant="muted">
                                          —
                                      </Text>
                                  );
                              }
                              return (
                                  <Text variant="body-sm" weight={500}>
                                      {new Intl.NumberFormat("it-IT", {
                                          style: "currency",
                                          currency: "EUR",
                                          minimumFractionDigits: 2
                                      }).format(price)}
                                  </Text>
                              );
                          }
                      }
                  ]
                : []),
            {
                id: "actions",
                header: "",
                align: "right",
                width: "72px",
                cell: (_value, row) => (
                    <TableRowActions
                        actions={[
                            {
                                label: "Rimuovi prodotto",
                                icon: Trash2,
                                variant: "destructive",
                                onClick: () => handleDelete(row.id)
                            }
                        ]}
                    />
                )
            }
        ],
        [showPriceColumn]
    );

    return (
        <Card>
            <div style={{ display: "flex", flexDirection: "column" }}>
                <div
                    style={{
                        padding: "24px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "12px"
                    }}
                >
                    <Text variant="title-sm" weight={600}>
                        Prodotti inclusi
                    </Text>
                    <Button
                        variant="primary"
                        onClick={handleOpenAddModal}
                        disabled={isSaving}
                    >
                        + Aggiungi prodotto
                    </Button>
                </div>

                {loading ? (
                    <div style={{ padding: "24px", textAlign: "center" }}>
                        <Text colorVariant="muted">Caricamento prodotti inclusi...</Text>
                    </div>
                ) : (
                    <div style={{ padding: "0 24px 24px 24px" }}>
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={products.map(product => product.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                <DataTable<FeaturedContentProductRow>
                                    data={products}
                                    columns={columns}
                                    emptyState={
                                        <div style={{ padding: "24px", textAlign: "center" }}>
                                            <Text
                                                colorVariant="muted"
                                                style={{ marginBottom: "12px" }}
                                            >
                                                Nessun prodotto associato a questo contenuto.
                                            </Text>
                                            <Button
                                                variant="primary"
                                                onClick={handleOpenAddModal}
                                            >
                                                Aggiungi il primo prodotto
                                            </Button>
                                        </div>
                                    }
                                    rowWrapper={(row, rowData) => (
                                        <SortableDataTableRow key={rowData.id} id={rowData.id}>
                                            {row}
                                        </SortableDataTableRow>
                                    )}
                                />
                            </SortableContext>
                        </DndContext>
                    </div>
                )}
            </div>
        </Card>
    );
}
```

- [ ] **Step 2: Verifica TypeScript — nessun errore**

```bash
npx tsc --noEmit 2>&1 | head -60
```

**Nota**: Se `TextInput` non espone `onBlur`, controllare `src/components/ui/Input/TextInput.tsx`. Se non passa attraverso props HTML, aggiungere `onBlur?: React.FocusEventHandler<HTMLInputElement>` alla sua interfaccia Props e passarlo all'`<input>` interno.

- [ ] **Step 3: Verifica comportamento**

Aprire il browser, navigare a un contenuto in evidenza con prodotti:
1. Hover su una nota → clicca fuori → verificare che la nota venga salvata senza bottoni
2. Clicca "Rimuovi prodotto" → il prodotto sparisce immediatamente senza bottone Salva
3. Drag-and-drop riordina → l'ordine persiste dopo reload della pagina
4. Clicca "+ Aggiungi prodotto" → seleziona → Applica → i prodotti si aggiornano subito

- [ ] **Step 4: Commit**

```bash
git add src/pages/Dashboard/Highlights/ProductsManagerCard.tsx
git commit -m "refactor(highlights): converti ProductsManagerCard a salvataggio immediato, rimuovi Annulla/Salva"
```

---

## Verifica finale

- [ ] **TypeScript pulito**

```bash
npx tsc --noEmit 2>&1 | grep -E "error TS" | head -20
```

Expected: 0 errori.

- [ ] **Build di produzione**

```bash
npm run build 2>&1 | tail -20
```

Expected: build completata senza errori.

- [ ] **Test manuale end-to-end**

1. **Lista**: Aprire `/business/:id/featured` → verificare che le colonne siano TITOLO, PRODOTTI, AZIONI (no Tipo, no Stato)
2. **Creazione**: Crea contenuto → verifica che non ci sia checkbox status → il contenuto viene creato e apre la pagina dettaglio
3. **Pagina dettaglio**: Verifica che l'header mostri solo titolo e nome interno, nessun badge
4. **Identità**: Clicca matita → drawer si apre → modifica titolo → Salva → dati aggiornati in read-only, drawer chiuso
5. **Immagine**: Clicca matita → carica immagine → preview appare in read-only
6. **Modalità**: Clicca matita → cambia da "none" a "per_item" → Salva → tab Prodotti ora mostra ProductsManagerCard
7. **CTA**: Clicca matita → inserisci URL senza https:// → errore inline; inserisci URL valido → Salva
8. **Prodotti**: Aggiungi prodotto → rimuovi prodotto → riordina → tutti senza pulsante Salva esplicito
