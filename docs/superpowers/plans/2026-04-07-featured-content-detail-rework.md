# Featured Content Detail Rework — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ristrutturare FeaturedContentDetailPage con 5 blocchi logici, selettore pricing esplicito, upload media, tab prodotti condizionale; correggere 4 bug architetturali; estendere FeaturedBlock con media e show_original_total.

**Architecture:** Admin UI completamente riscritta nella detail page con blocchi separati e SCSS dedicato. Service layer esteso con upload function. Tre nuove migrazioni per bucket storage, trigger updated_at e RLS schedule_featured_contents. FeaturedBlock esteso per rendering pubblico completo.

**Tech Stack:** React 19 + TypeScript strict, SCSS Modules, Supabase Storage, RadioGroup + Switch da ui/components, @dnd-kit per drag prodotti.

---

## Chunk 1: DB e Backend

### Task 1: Storage bucket `featured-contents`

**Files:**
- Create: `supabase/migrations/20260407100000_featured_contents_bucket.sql`

- [ ] **Step 1: Crea la migrazione**

```sql
-- supabase/migrations/20260407100000_featured_contents_bucket.sql
BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('featured-contents', 'featured-contents', true)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload to their own tenant folder
CREATE POLICY "Tenant upload featured content images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'featured-contents');

CREATE POLICY "Tenant update featured content images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'featured-contents');

CREATE POLICY "Tenant delete featured content images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'featured-contents');

-- Public read for the public catalog page
CREATE POLICY "Public read featured content images"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'featured-contents');

COMMIT;
```

- [ ] **Step 2: Verifica sintassi** — `cat supabase/migrations/20260407100000_featured_contents_bucket.sql`

---

### Task 2: Trigger `updated_at` su `featured_contents`

**Files:**
- Create: `supabase/migrations/20260407110000_featured_contents_updated_at_trigger.sql`

- [ ] **Step 1: Crea la migrazione**

```sql
-- supabase/migrations/20260407110000_featured_contents_updated_at_trigger.sql
BEGIN;

-- Crea la funzione (CREATE OR REPLACE — potrebbe già esistere)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Trigger su featured_contents
DROP TRIGGER IF EXISTS trg_featured_contents_updated_at ON public.featured_contents;
CREATE TRIGGER trg_featured_contents_updated_at
  BEFORE UPDATE ON public.featured_contents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
```

- [ ] **Step 2: Verifica** — `cat supabase/migrations/20260407110000_featured_contents_updated_at_trigger.sql`

---

### Task 3: RLS su `schedule_featured_contents`

**Files:**
- Create: `supabase/migrations/20260407120000_schedule_featured_contents_rls.sql`

**Contesto:** La tabella ha RLS abilitato ma le policy sono state droppate in 20260227203000 senza aggiungere policy tenant-auth. La pagina pubblica usa query diretta (non RPC), quindi serve anche una policy anon SELECT. Il commento della Phase 2 ("public goes through RPC") indica un'intenzione futura, non ancora implementata nel resolver.

- [ ] **Step 1: Verifica se RLS è abilitato sulla tabella**

Aprire `supabase/migrations/20260224144431_v2_schedule_featured_contents.sql` — non contiene `ENABLE ROW LEVEL SECURITY`. Verificare anche `20260309000000_v2_phase1_multi_tenant.sql` (che fa ALTER TABLE per spostare FK). Se RLS non è abilitato, la tabella è open-read per tutti senza policy — comunque aggiungere le policy è corretto.

- [ ] **Step 2: Crea la migrazione**

```sql
-- supabase/migrations/20260407120000_schedule_featured_contents_rls.sql
BEGIN;

ALTER TABLE public.schedule_featured_contents ENABLE ROW LEVEL SECURITY;

-- Tenant: gestione piena (authenticated)
DROP POLICY IF EXISTS "Tenant select own rows" ON public.schedule_featured_contents;
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.schedule_featured_contents;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.schedule_featured_contents;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.schedule_featured_contents;

CREATE POLICY "Tenant select own rows"
  ON public.schedule_featured_contents FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenant insert own rows"
  ON public.schedule_featured_contents FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenant update own rows"
  ON public.schedule_featured_contents FOR UPDATE TO authenticated
  USING  (tenant_id IN (SELECT public.get_my_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenant delete own rows"
  ON public.schedule_featured_contents FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

-- Accesso pubblico per la pagina catalogo (resolver usa query diretta, non RPC)
-- TODO: in futuro refactoring del resolver per usare SECURITY DEFINER RPC
DROP POLICY IF EXISTS "Public read schedule featured contents" ON public.schedule_featured_contents;
CREATE POLICY "Public read schedule featured contents"
  ON public.schedule_featured_contents FOR SELECT TO anon
  USING (true);

COMMIT;
```

- [ ] **Step 3: Verifica** — `cat supabase/migrations/20260407120000_schedule_featured_contents_rls.sql`

---

## Chunk 2: Service Layer

### Task 4: Upload function per featured content

**Files:**
- Modify: `src/services/supabase/upload.ts`

- [ ] **Step 1: Aggiungi `uploadFeaturedContentImage` in fondo al file**

```typescript
export async function uploadFeaturedContentImage(
    tenantId: string,
    contentId: string,
    file: File
): Promise<string> {
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const filePath = `${tenantId}/${contentId}.${ext}`;

    const { error } = await supabase.storage
        .from("featured-contents")
        .upload(filePath, file, { upsert: true, contentType: file.type });

    if (error) throw new Error("Upload immagine fallito");

    const { data } = supabase.storage.from("featured-contents").getPublicUrl(filePath);
    return data.publicUrl;
}

export async function deleteFeaturedContentImage(
    tenantId: string,
    contentId: string,
    ext: string
): Promise<void> {
    const filePath = `${tenantId}/${contentId}.${ext}`;
    const { error } = await supabase.storage.from("featured-contents").remove([filePath]);
    if (error) throw error;
}
```

- [ ] **Step 2: Verifica TypeScript** — `npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`

---

### Task 5: Minor update `featuredContents.ts`

**Files:**
- Modify: `src/services/supabase/featuredContents.ts`

`updateFeaturedContent` già accetta `Partial<FeaturedContent>` che include `show_original_total`. Nessuna modifica necessaria al service stesso. Verificare che `getFeaturedContentById` ritorni anche `show_original_total` (usa `select('*')` → OK).

- [ ] **Step 1: Conferma** — leggere `getFeaturedContentById` — già usa `select('*')` → nessuna modifica necessaria.

---

## Chunk 3: Admin UI — Detail Page

### Task 6: `FeaturedContentDetailPage.module.scss` (nuovo file)

**Files:**
- Create: `src/pages/Dashboard/Highlights/FeaturedContentDetailPage.module.scss`

- [ ] **Step 1: Crea il file SCSS**

```scss
// src/pages/Dashboard/Highlights/FeaturedContentDetailPage.module.scss

.wrapper {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding-bottom: 40px;
}

/* ── Blocchi info ─────────────────────────────── */
.block {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 24px;
}

.blockTitle {
  font-size: 0.8125rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin: 0;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle, #e5e7eb);
}

.row2col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
}

.blockSaveBar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border-top: 1px solid var(--border-subtle, #e5e7eb);
}

/* ── Pricing mode selector ────────────────────── */
.pricingOptions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
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

.pricingCardLabel {
  font-weight: 600;
  font-size: 0.9375rem;
}

.pricingCardDescription {
  font-size: 0.8125rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.pricingCardIcon {
  font-size: 1.25rem;
  margin-bottom: 4px;
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

/* ── Media upload ─────────────────────────────── */
.mediaUploadArea {
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

.mediaUploadAreaDragging {
  border-color: var(--color-primary, #6366f1);
  background: var(--surface-selected, #f0f0ff);
}

.mediaPreview {
  position: relative;
  width: 100%;
  max-width: 360px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--border-subtle, #e5e7eb);
  background: var(--surface-secondary, #f9fafb);
}

.mediaPreviewImg {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  display: block;
}

.mediaPreviewOverlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s ease;

  .mediaPreview:hover & {
    background: rgba(0, 0, 0, 0.35);
  }
}

.mediaPreviewRemoveBtn {
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

  .mediaPreview:hover & {
    opacity: 1;
  }
}

/* ── Tab prodotti condizionale ────────────────── */
.modeWarning {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 16px;
  background: var(--color-warning-subtle, #fffbeb);
  border: 1px solid var(--color-warning, #f59e0b);
  border-radius: 8px;
  font-size: 0.875rem;
  color: var(--color-warning-text, #92400e);
}

.pageHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.headerBadges {
  display: flex;
  gap: 8px;
}
```

---

### Task 7: `FeaturedContentDetailPage.tsx` — riscrittura completa

**Files:**
- Modify: `src/pages/Dashboard/Highlights/FeaturedContentDetailPage.tsx`

**Note importanti prima di implementare:**
- Il caricamento dati deve usare `getFeaturedContentById` dal service (fix 3a)
- Il salvataggio NON deve includere `show_original_total: false` hardcoded — leggere dal form
- Quando `pricing_mode` cambia da 'per_item'/'bundle' a 'none' e ci sono prodotti caricati in ProductsManagerCard: mostrare avviso (solo UI, i prodotti rimangono in DB)
- Tab "Prodotti inclusi" visibile se `editPricingMode !== 'none'`
- `media_id` viene aggiornato via upload separato (non parte del save info normale)
- `show_original_total` deve essere incluso nel `updateData`

```tsx
// src/pages/Dashboard/Highlights/FeaturedContentDetailPage.tsx
import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import Text from "@/components/ui/Text/Text";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/Button/Button";
import { useToast } from "@/context/Toast/ToastContext";
import Breadcrumb from "@/components/ui/Breadcrumb/Breadcrumb";
import { Badge } from "@/components/ui/Badge/Badge";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { Switch } from "@/components/ui/Switch/Switch";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { AlertTriangle, Image, Upload, X } from "lucide-react";
import ProductPickerList from "./ProductPickerList";
import ProductsManagerCard from "./ProductsManagerCard";
import {
    FeaturedContentWithProducts,
    getFeaturedContentById,
    updateFeaturedContent,
    FeaturedContentPricingMode,
    FeaturedContentStatus
} from "@/services/supabase/featuredContents";
import { uploadFeaturedContentImage } from "@/services/supabase/upload";
import { compressImage } from "@/utils/compressImage";
import { useTenantId } from "@/context/useTenantId";
import styles from "./FeaturedContentDetailPage.module.scss";

// ── Pricing mode options ──────────────────────────────────────────────────────
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

// ── Helper ────────────────────────────────────────────────────────────────────
function trimOrNull(v: string): string | null {
    const t = v.trim();
    return t.length > 0 ? t : null;
}

export default function FeaturedContentDetailPage() {
    const { featuredId } = useParams<{ featuredId: string }>();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const tenantId = useTenantId();

    const [content, setContent] = useState<FeaturedContentWithProducts | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"info" | "products">("info");
    const [isSavingInfo, setIsSavingInfo] = useState(false);

    // ── Info form fields ──────────────────────────────────────────────────────
    const [editTitle, setEditTitle] = useState("");
    const [editInternalName, setEditInternalName] = useState("");
    const [editSubtitle, setEditSubtitle] = useState("");
    const [editDescription, setEditDescription] = useState("");
    const [editPricingMode, setEditPricingMode] = useState<FeaturedContentPricingMode>("none");
    const [editBundlePrice, setEditBundlePrice] = useState("");
    const [editShowOriginalTotal, setEditShowOriginalTotal] = useState(false);
    const [editCtaText, setEditCtaText] = useState("");
    const [editCtaUrl, setEditCtaUrl] = useState("");
    const [editStatus, setEditStatus] = useState<FeaturedContentStatus>("published");

    // ── Media upload ──────────────────────────────────────────────────────────
    const [mediaUrl, setMediaUrl] = useState<string | null>(null);
    const [isUploadingMedia, setIsUploadingMedia] = useState(false);
    const [isDraggingMedia, setIsDraggingMedia] = useState(false);
    const mediaInputRef = useRef<HTMLInputElement>(null);

    // ── Product picker ────────────────────────────────────────────────────────
    const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
    const [linkedProductIds, setLinkedProductIds] = useState<string[]>([]);
    const [pendingSelectedProductIds, setPendingSelectedProductIds] = useState<string[]>([]);
    const onApplyProductsRef = useRef<((ids: string[]) => Promise<void>) | null>(null);

    // ── Products count for mode-change warning ────────────────────────────────
    const [linkedProductsCount, setLinkedProductsCount] = useState(0);

    // ── Sync form from loaded content ─────────────────────────────────────────
    const syncForm = useCallback((source: FeaturedContentWithProducts) => {
        setEditTitle(source.title ?? "");
        setEditInternalName(source.internal_name ?? "");
        setEditSubtitle(source.subtitle ?? "");
        setEditDescription(source.description ?? "");
        setEditPricingMode(source.pricing_mode ?? "none");
        setEditBundlePrice(source.bundle_price != null ? String(source.bundle_price) : "");
        setEditShowOriginalTotal(source.show_original_total ?? false);
        setEditCtaText(source.cta_text ?? "");
        setEditCtaUrl(source.cta_url ?? "");
        setEditStatus(source.status ?? "published");
        setMediaUrl(source.media_id ?? null);
    }, []);

    // ── Load ──────────────────────────────────────────────────────────────────
    const loadContent = useCallback(async () => {
        if (!featuredId || !tenantId) return;
        try {
            setLoading(true);
            setError(null);
            const data = await getFeaturedContentById(featuredId, tenantId);
            setContent(data);
            syncForm(data);
        } catch (err) {
            console.error(err);
            setError("Impossibile caricare il contenuto.");
            showToast({ type: "error", message: "Errore nel caricamento del contenuto." });
        } finally {
            setLoading(false);
        }
    }, [featuredId, tenantId, showToast, syncForm]);

    useEffect(() => { loadContent(); }, [loadContent]);

    // ── Draft resolution ──────────────────────────────────────────────────────
    const resolvedDraft = useMemo(() => {
        const pricingMode = editPricingMode;
        const bundlePrice =
            pricingMode === "bundle"
                ? (Number.isFinite(parseFloat(editBundlePrice)) ? parseFloat(editBundlePrice) : null)
                : null;
        return {
            title: editTitle.trim(),
            internal_name: (editInternalName.trim() || editTitle.trim()),
            subtitle: trimOrNull(editSubtitle),
            description: trimOrNull(editDescription),
            pricing_mode: pricingMode,
            bundle_price: bundlePrice,
            show_original_total: pricingMode === "bundle" ? editShowOriginalTotal : false,
            cta_text: trimOrNull(editCtaText),
            cta_url: trimOrNull(editCtaUrl),
            status: editStatus
        };
    }, [
        editTitle, editInternalName, editSubtitle, editDescription,
        editPricingMode, editBundlePrice, editShowOriginalTotal,
        editCtaText, editCtaUrl, editStatus
    ]);

    const hasInfoChanges = useMemo(() => {
        if (!content) return false;
        const c = content;
        const d = resolvedDraft;
        return (
            c.title !== d.title ||
            c.internal_name !== d.internal_name ||
            (c.subtitle ?? null) !== d.subtitle ||
            (c.description ?? null) !== d.description ||
            c.pricing_mode !== d.pricing_mode ||
            (c.bundle_price ?? null) !== d.bundle_price ||
            c.show_original_total !== d.show_original_total ||
            (c.cta_text ?? null) !== d.cta_text ||
            (c.cta_url ?? null) !== d.cta_url ||
            c.status !== d.status
        );
    }, [content, resolvedDraft]);

    // ── Save info ─────────────────────────────────────────────────────────────
    const handleSaveInfo = async () => {
        if (!content || !tenantId) return;
        if (!resolvedDraft.title) {
            showToast({ type: "error", message: "Il titolo è obbligatorio" });
            return;
        }
        if (resolvedDraft.pricing_mode === "bundle") {
            const p = resolvedDraft.bundle_price;
            if (p === null || p <= 0) {
                showToast({ type: "error", message: "Inserisci un prezzo fisso valido (> 0)" });
                return;
            }
        }
        try {
            setIsSavingInfo(true);
            await updateFeaturedContent(content.id, tenantId, resolvedDraft);
            const nextContent = { ...content, ...resolvedDraft } as FeaturedContentWithProducts;
            setContent(nextContent);
            syncForm(nextContent);
            showToast({ type: "success", message: "Informazioni aggiornate" });
        } catch (err) {
            console.error(err);
            showToast({ type: "error", message: "Errore durante il salvataggio" });
        } finally {
            setIsSavingInfo(false);
        }
    };

    // ── Media upload ──────────────────────────────────────────────────────────
    const handleMediaFile = useCallback(async (file: File) => {
        if (!content || !tenantId) return;
        if (!file.type.startsWith("image/")) {
            showToast({ type: "error", message: "Seleziona un'immagine (PNG, JPG, WEBP)" });
            return;
        }
        try {
            setIsUploadingMedia(true);
            const compressed = await compressImage(file, 1200, 0.85);
            const url = await uploadFeaturedContentImage(tenantId, content.id, compressed);
            await updateFeaturedContent(content.id, tenantId, { media_id: url });
            setMediaUrl(url);
            setContent(prev => prev ? { ...prev, media_id: url } : prev);
            showToast({ type: "success", message: "Immagine caricata" });
        } catch (err) {
            console.error(err);
            showToast({ type: "error", message: "Errore durante il caricamento dell'immagine" });
        } finally {
            setIsUploadingMedia(false);
        }
    }, [content, tenantId, showToast]);

    const handleMediaRemove = async () => {
        if (!content || !tenantId) return;
        try {
            await updateFeaturedContent(content.id, tenantId, { media_id: null });
            setMediaUrl(null);
            setContent(prev => prev ? { ...prev, media_id: null } : prev);
            showToast({ type: "success", message: "Immagine rimossa" });
        } catch (err) {
            console.error(err);
            showToast({ type: "error", message: "Errore nella rimozione dell'immagine" });
        }
    };

    const handleMediaDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDraggingMedia(false);
        const file = e.dataTransfer.files[0];
        if (file) handleMediaFile(file);
    };

    // ── Product picker ────────────────────────────────────────────────────────
    const closeProductPicker = () => {
        setIsProductPickerOpen(false);
        setPendingSelectedProductIds([]);
    };

    const hasPendingProductChanges = useCallback(() => {
        const orig = new Set(linkedProductIds);
        const pend = new Set(pendingSelectedProductIds);
        if (orig.size !== pend.size) return true;
        for (const id of orig) { if (!pend.has(id)) return true; }
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

    // ── Derived ───────────────────────────────────────────────────────────────
    const showProductsTab = editPricingMode !== "none";

    const showModeChangeWarning =
        content !== null &&
        content.pricing_mode !== "none" &&
        editPricingMode === "none" &&
        linkedProductsCount > 0 &&
        hasInfoChanges;

    const breadcrumbItems = [
        { label: "Contenuti in evidenza", to: `/business/${tenantId}/featured` },
        { label: loading ? "Caricamento..." : content?.title || "Dettaglio" }
    ];

    // ── Error state ───────────────────────────────────────────────────────────
    if (error) {
        return (
            <div className={styles.wrapper}>
                <Breadcrumb items={breadcrumbItems} />
                <Text variant="title-sm" colorVariant="error">{error}</Text>
                <Button variant="secondary" onClick={() => navigate(`/business/${tenantId}/featured`)}>
                    Torna alla lista
                </Button>
            </div>
        );
    }

    // ── Tab switcher ──────────────────────────────────────────────────────────
    const renderInfoCard = () => (
        <Card>
            {/* Blocco 1 — Identità */}
            <div className={styles.block}>
                <p className={styles.blockTitle}>Identità</p>
                <div className={styles.row2col}>
                    <TextInput
                        label="Titolo *"
                        value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        placeholder="Es: Promozione speciale"
                        disabled={loading}
                    />
                    <TextInput
                        label="Nome interno *"
                        value={editInternalName}
                        onChange={e => setEditInternalName(e.target.value)}
                        placeholder="Es: Promo Roma - Aprile"
                        disabled={loading}
                    />
                </div>
                <TextInput
                    label="Sottotitolo"
                    value={editSubtitle}
                    onChange={e => setEditSubtitle(e.target.value)}
                    placeholder="Sottotitolo opzionale"
                    disabled={loading}
                />
                <Textarea
                    label="Descrizione"
                    value={editDescription}
                    onChange={e => setEditDescription(e.target.value)}
                    placeholder="Testo descrittivo del contenuto"
                    rows={3}
                    disabled={loading}
                />
            </div>

            {/* Blocco 2 — Media */}
            <div className={styles.block}>
                <p className={styles.blockTitle}>Immagine</p>
                {mediaUrl ? (
                    <div className={styles.mediaPreview}>
                        <img src={mediaUrl} alt="Anteprima" className={styles.mediaPreviewImg} />
                        <div className={styles.mediaPreviewOverlay}>
                            <button
                                type="button"
                                className={styles.mediaPreviewRemoveBtn}
                                onClick={handleMediaRemove}
                            >
                                Rimuovi
                            </button>
                        </div>
                    </div>
                ) : (
                    <div
                        className={`${styles.mediaUploadArea} ${isDraggingMedia ? styles.mediaUploadAreaDragging : ""}`}
                        onClick={() => !isUploadingMedia && mediaInputRef.current?.click()}
                        onDragOver={e => { e.preventDefault(); setIsDraggingMedia(true); }}
                        onDragLeave={() => setIsDraggingMedia(false)}
                        onDrop={handleMediaDrop}
                    >
                        {isUploadingMedia ? (
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
                            ref={mediaInputRef}
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={e => {
                                const f = e.target.files?.[0];
                                if (f) { handleMediaFile(f); e.target.value = ""; }
                            }}
                        />
                    </div>
                )}
            </div>

            {/* Blocco 3 — Modalità contenuto */}
            <div className={styles.block}>
                <p className={styles.blockTitle}>Modalità contenuto</p>
                <div className={styles.pricingOptions}>
                    {PRICING_OPTIONS.map(opt => (
                        <div
                            key={opt.value}
                            className={`${styles.pricingCard} ${editPricingMode === opt.value ? styles.pricingCardSelected : ""}`}
                            onClick={() => setEditPricingMode(opt.value)}
                        >
                            <span className={styles.pricingCardIcon}>{opt.icon}</span>
                            <span className={styles.pricingCardLabel}>{opt.label}</span>
                            <span className={styles.pricingCardDescription}>{opt.description}</span>
                        </div>
                    ))}
                </div>

                {showModeChangeWarning && (
                    <div className={styles.modeWarning}>
                        <AlertTriangle size={16} />
                        <span>
                            Hai {linkedProductsCount} prodott{linkedProductsCount === 1 ? "o" : "i"} associat{linkedProductsCount === 1 ? "o" : "i"}.
                            Se salvi in modalità "Solo informativo", il tab prodotti scomparirà ma i prodotti rimarranno in archivio.
                        </span>
                    </div>
                )}

                {editPricingMode === "bundle" && (
                    <div className={styles.pricingExtra}>
                        <TextInput
                            label="Prezzo fisso (€) *"
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={editBundlePrice}
                            onChange={e => setEditBundlePrice(e.target.value)}
                            placeholder="Es: 25.00"
                        />
                        <Switch
                            label="Mostra totale originale barrato"
                            description="Mostra la somma dei prezzi singoli barrata accanto al prezzo bundle"
                            checked={editShowOriginalTotal}
                            onChange={setEditShowOriginalTotal}
                        />
                    </div>
                )}
            </div>

            {/* Blocco 4 — CTA */}
            <div className={styles.block}>
                <p className={styles.blockTitle}>Call to Action</p>
                <div className={styles.row2col}>
                    <TextInput
                        label="Testo pulsante"
                        value={editCtaText}
                        onChange={e => setEditCtaText(e.target.value)}
                        placeholder="Es: Scopri di più"
                        disabled={loading}
                    />
                    <TextInput
                        label="Link pulsante"
                        value={editCtaUrl}
                        onChange={e => setEditCtaUrl(e.target.value)}
                        placeholder="https://..."
                        disabled={loading}
                    />
                </div>
            </div>

            {/* Blocco 5 — Stato */}
            <div className={styles.block}>
                <p className={styles.blockTitle}>Stato</p>
                <Switch
                    label="Pubblicato"
                    description={
                        editStatus === "published"
                            ? "Contenuto attivo e visibile nella pagina pubblica"
                            : "Bozza — non sarà mostrato nella pagina pubblica"
                    }
                    checked={editStatus === "published"}
                    onChange={checked => setEditStatus(checked ? "published" : "draft")}
                    disabled={loading}
                />
            </div>

            {/* Save bar */}
            <div className={styles.blockSaveBar}>
                <Button
                    variant="secondary"
                    onClick={() => content && syncForm(content)}
                    disabled={!hasInfoChanges || isSavingInfo}
                >
                    Annulla
                </Button>
                <Button
                    variant="primary"
                    onClick={handleSaveInfo}
                    disabled={!hasInfoChanges}
                    loading={isSavingInfo}
                >
                    Salva informazioni
                </Button>
            </div>
        </Card>
    );

    return (
        <div className={styles.wrapper}>
            <Breadcrumb items={breadcrumbItems} />

            <PageHeader
                title={loading ? "Caricamento..." : content?.title || "Senza titolo"}
                subtitle={loading ? "" : content?.internal_name || ""}
                actions={
                    !loading && content && (
                        <div className={styles.headerBadges}>
                            {content.status === "published" ? (
                                <Badge variant="success">Pubblicato</Badge>
                            ) : (
                                <Badge variant="secondary">Bozza</Badge>
                            )}
                            {content.pricing_mode === "none" && <Badge variant="secondary">Editoriale</Badge>}
                            {content.pricing_mode === "per_item" && <Badge variant="secondary">Con prodotti</Badge>}
                            {content.pricing_mode === "bundle" && <Badge variant="secondary">Prezzo fisso</Badge>}
                        </div>
                    )
                }
            />

            {showProductsTab ? (
                <Tabs
                    value={activeTab}
                    onChange={v => setActiveTab(v as "info" | "products")}
                >
                    <Tabs.List>
                        <Tabs.Tab value="info">Informazioni</Tabs.Tab>
                        <Tabs.Tab value="products">Prodotti inclusi</Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="info">
                        {renderInfoCard()}
                    </Tabs.Panel>

                    <Tabs.Panel value="products">
                        <ProductsManagerCard
                            featuredId={featuredId as string}
                            pricingMode={content?.pricing_mode ?? "none"}
                            showOriginalTotal={content?.show_original_total ?? false}
                            onLinkedProductsCountChange={setLinkedProductsCount}
                            onOpenProductPicker={(linkedIds, onApply) => {
                                setLinkedProductIds(linkedIds);
                                setPendingSelectedProductIds(linkedIds);
                                onApplyProductsRef.current = onApply;
                                setIsProductPickerOpen(true);
                            }}
                        />
                    </Tabs.Panel>
                </Tabs>
            ) : (
                renderInfoCard()
            )}

            <SystemDrawer open={isProductPickerOpen} onClose={closeProductPicker} width={640}>
                <DrawerLayout
                    header={
                        <Text variant="title-sm" weight={700}>Aggiungi prodotto</Text>
                    }
                    footer={
                        <>
                            <Button variant="secondary" onClick={closeProductPicker}>Annulla</Button>
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

**Verifiche dopo implementazione:**
- Leggere `src/components/ui/Textarea/Textarea.tsx` per accertarsi dell'interfaccia props (label, value, onChange, rows, disabled)
- Verificare che `Tabs.Panel` accetti `value` come nel componente esistente
- Verificare che `SystemDrawer` accetti prop `width` come numero

---

## Chunk 4: Fix Highlights.tsx — Delete Drawer

### Task 8: Sostituire ModalLayout con DrawerLayout nel delete

**Files:**
- Modify: `src/pages/Dashboard/Highlights/Highlights.tsx`

La logica del delete rimane uguale — cambia solo il contenitore UI.

- [ ] **Step 1: Aggiungi import SystemDrawer e DrawerLayout, rimuovi ModalLayout**

Sostituire i 4 import `ModalLayout*` con:
```typescript
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
```

- [ ] **Step 2: Sostituire il blocco JSX del delete**

**Prima (da rimuovere):**
```tsx
<ModalLayout
    isOpen={Boolean(deleteTarget)}
    onClose={() => !isDeleting && setDeleteTarget(null)}
    width="xs"
    height="fit"
>
    <ModalLayoutHeader>...</ModalLayoutHeader>
    <ModalLayoutContent>...</ModalLayoutContent>
    <ModalLayoutFooter>...</ModalLayoutFooter>
</ModalLayout>
```

**Dopo:**
```tsx
<SystemDrawer
    open={Boolean(deleteTarget)}
    onClose={() => !isDeleting && setDeleteTarget(null)}
    width={400}
>
    <DrawerLayout
        header={
            <Text as="h2" variant="title-sm" weight={700}>
                Elimina contenuto
            </Text>
        }
        footer={
            <>
                <Button
                    variant="secondary"
                    onClick={() => setDeleteTarget(null)}
                    disabled={isDeleting}
                >
                    Annulla
                </Button>
                <Button variant="primary" onClick={handleDelete} loading={isDeleting}>
                    Elimina
                </Button>
            </>
        }
    >
        <Text variant="body">
            Sei sicuro di voler eliminare <b>{deleteTarget?.title}</b>?
            Questa azione non può essere annullata.
        </Text>
    </DrawerLayout>
</SystemDrawer>
```

- [ ] **Step 3: Verifica TypeScript** — `npx tsc --noEmit 2>&1 | grep Highlights`

---

## Chunk 5: ProductsManagerCard — Colonna prezzo condizionale

### Task 9: Aggiungere `pricingMode`, `showOriginalTotal`, `onLinkedProductsCountChange` props

**Files:**
- Modify: `src/pages/Dashboard/Highlights/ProductsManagerCard.tsx`

- [ ] **Step 1: Aggiornare l'interfaccia props**

```typescript
// Aggiungere ai props esistenti:
interface ProductsManagerCardProps {
    featuredId: string;
    pricingMode: "none" | "per_item" | "bundle";
    showOriginalTotal: boolean;
    onLinkedProductsCountChange?: (count: number) => void;
    onOpenProductPicker?: (
        linkedIds: string[],
        onApply: (productIds: string[]) => Promise<void>
    ) => void;
}
```

- [ ] **Step 2: Esporre il conteggio prodotti**

Dopo `setDraftProducts(cloneRows(loadedRows))` in `loadProducts`, aggiungere:
```typescript
onLinkedProductsCountChange?.(loadedRows.length);
```

- [ ] **Step 3: Aggiungere colonna prezzo alle columns (useMemo)**

La colonna prezzo deve apparire come penultima (prima di "actions"):
```typescript
// Mostra prezzo se:
// - pricing_mode === 'per_item' SEMPRE
// - pricing_mode === 'bundle' E show_original_total === true
const showPriceColumn =
    pricingMode === "per_item" ||
    (pricingMode === "bundle" && showOriginalTotal);
```

Aggiungere alla definizione `columns` (condizionalmente):
```typescript
...(showPriceColumn
    ? [{
        id: "price",
        header: "Prezzo",
        width: "100px",
        align: "right" as const,
        accessor: (row: FeaturedContentProductRow) => row.products?.base_price,
        cell: (value: unknown) => {
            const price = value as number | null | undefined;
            if (price == null) return <Text variant="body-sm" colorVariant="muted">—</Text>;
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
      }]
    : []),
```

- [ ] **Step 4: Aggiornare la firma del componente**

```typescript
export default function ProductsManagerCard({
    featuredId,
    pricingMode,
    showOriginalTotal,
    onLinkedProductsCountChange,
    onOpenProductPicker
}: ProductsManagerCardProps) {
```

- [ ] **Step 5: Verifica TypeScript** — `npx tsc --noEmit 2>&1 | grep ProductsManager`

---

## Chunk 6: FeaturedBlock — Media e show_original_total

### Task 10: Estendere `FeaturedBlock.tsx`

**Files:**
- Modify: `src/components/PublicCollectionView/FeaturedBlock/FeaturedBlock.tsx`
- Modify: `src/components/PublicCollectionView/FeaturedBlock/FeaturedBlock.module.scss`

**Comportamento da implementare:**
1. Se `media_id` presente → renderizza `<img>` prima del contenuto testuale
2. Se `pricing_mode === 'bundle'` E `show_original_total === true` → calcola somma `product.base_price` dei prodotti non-null, mostra barrata accanto a `bundle_price`

- [ ] **Step 1: Aggiornare FeaturedBlock.tsx**

```tsx
// Aggiungere prima del return nel map dei blocks:

// Calcolo totale originale per show_original_total
const originalTotal =
    block.pricing_mode === "bundle" && block.show_original_total
        ? (block.products ?? [])
              .filter(item => item.product?.base_price != null)
              .reduce((sum, item) => sum + (item.product!.base_price ?? 0), 0)
        : null;
```

Nel JSX del card, aggiungere PRIMA dell'header:
```tsx
{/* ── Immagine ────────────────────────────────── */}
{block.media_id && (
    <img
        src={block.media_id}
        alt={block.title}
        className={styles.mediaImage}
        loading="lazy"
    />
)}
```

Modificare la sezione bundle price nell'header:
```tsx
{block.pricing_mode === "bundle" && block.bundle_price != null && (
    <span className={styles.priceGroup}>
        {originalTotal != null && originalTotal > 0 && (
            <span className={styles.originalPrice}>
                {formatPrice(originalTotal)}
            </span>
        )}
        <span className={styles.bundlePrice}>
            {formatPrice(block.bundle_price)}
        </span>
    </span>
)}
```

- [ ] **Step 2: Aggiornare FeaturedBlock.module.scss**

```scss
// Aggiungere in fondo al file:

.mediaImage {
  width: 100%;
  border-radius: calc(var(--pub-card-radius, 12px) - 2px);
  aspect-ratio: 16 / 9;
  object-fit: cover;
  display: block;
  margin-bottom: 4px;
}

.priceGroup {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.originalPrice {
  font-size: 1rem;
  font-weight: 500;
  color: var(--pub-text-muted, #999);
  text-decoration: line-through;
  white-space: nowrap;
}
```

- [ ] **Step 3: Verifica TypeScript** — `npx tsc --noEmit 2>&1 | grep FeaturedBlock`

---

## Chunk 7: Verifica finale

- [ ] **Step 1: Full TypeScript check** — `npx tsc --noEmit 2>&1 | head -30`
- [ ] **Step 2: Lint check** — `npm run lint 2>&1 | head -30` (se disponibile)
- [ ] **Step 3: Verifica che tutte le migrazioni abbiano timestamp crescente**

```bash
ls supabase/migrations/ | sort | tail -8
```

Atteso: `20260407100000_*`, `20260407110000_*`, `20260407120000_*` in ordine dopo le migration esistenti.

- [ ] **Step 4: Commit**

```bash
git add \
  supabase/migrations/20260407100000_featured_contents_bucket.sql \
  supabase/migrations/20260407110000_featured_contents_updated_at_trigger.sql \
  supabase/migrations/20260407120000_schedule_featured_contents_rls.sql \
  src/services/supabase/upload.ts \
  src/pages/Dashboard/Highlights/FeaturedContentDetailPage.tsx \
  src/pages/Dashboard/Highlights/FeaturedContentDetailPage.module.scss \
  src/pages/Dashboard/Highlights/Highlights.tsx \
  src/pages/Dashboard/Highlights/ProductsManagerCard.tsx \
  src/components/PublicCollectionView/FeaturedBlock/FeaturedBlock.tsx \
  src/components/PublicCollectionView/FeaturedBlock/FeaturedBlock.module.scss

git commit -m "feat(featured): rework detail page, media upload, pricing selector, RLS fixes"
```

---

## Note Implementative

### Textarea component
Prima di usare `<Textarea>` verificare l'interfaccia in `src/components/ui/Textarea/Textarea.tsx`. Se il componente ha prop diverse, adattare (es. `onChange` potrebbe essere `(value: string) => void` invece di `React.ChangeEventHandler`).

### SystemDrawer width prop
Verificare che `SystemDrawer` accetti `width` come `number`. Se accetta solo string, usare `"400px"`. Verificare in `src/components/layout/SystemDrawer/SystemDrawer.tsx`.

### Colonne ProductsManagerCard
La logica `showPriceColumn` dipende dai prop `pricingMode` e `showOriginalTotal`. Questi vengono passati dai valori SALVATI in `content` (non dal draft) per riflettere lo stato reale del contenuto.

### Bucket `featured-contents`
Il bucket deve essere creato in Supabase prima di testare l'upload. Se si lavora in locale con `supabase start`, applicare la migrazione con `supabase db push` o `supabase migration up`.

### `V2FeaturedContent` type in resolveActivityCatalogs
Il tipo usato dal resolver per i featured content deve già includere `media_id` e `show_original_total` (sono già selezionati nella query). Verificare `src/services/supabase/resolveActivityCatalogs.ts` per il type `V2FeaturedContent` e assicurarsi che includa questi campi.
