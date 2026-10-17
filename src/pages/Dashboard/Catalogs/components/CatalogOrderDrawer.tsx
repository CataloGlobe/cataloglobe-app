import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { Loader } from "@/components/ui/Loader/Loader";
import { useToast } from "@/context/Toast/ToastContext";
import {
  listCatalogOrder,
  reorderCatalogs,
  type CatalogOrderItem,
} from "@/services/supabase/catalogOrder";
import { CatalogOrderRow } from "./CatalogOrderRow";
import styles from "./CatalogOrderDrawer.module.scss";

type CatalogOrderDrawerProps = {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  /** «menù», «listino»… dal verticale. */
  catalogLabel: string;
  onSaved?: () => void;
};

/**
 * L'ordine dei menù per i clienti (multi menù, passo 5): quello di «Scegli il
 * menu» quando in una sede ce n'è più di uno. Uno per azienda, in tutte le sedi.
 * Si trascina dalla maniglia (anche da tastiera) o si sposta con le frecce;
 * si salva con «Salva», tutto l'elenco insieme.
 */
export function CatalogOrderDrawer({
  open,
  onClose,
  tenantId,
  catalogLabel,
  onSaved,
}: CatalogOrderDrawerProps) {
  const { showToast } = useToast();
  const [items, setItems] = useState<CatalogOrderItem[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [changed, setChanged] = useState(false);
  // in un ref: un `onClose` scritto in linea dalla pagina non deve ricaricare
  // l'elenco (e perdere l'ordine trascinato) a ogni suo render
  const latest = useRef({ onClose, showToast });
  latest.current = { onClose, showToast };

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setItems(null);
    setChanged(false);
    listCatalogOrder(tenantId)
      .then((list) => alive && setItems(list))
      .catch((err) => {
        console.error(err);
        if (!alive) return;
        latest.current.showToast({
          type: "error",
          message: "Non riesco a leggere l'ordine dei menù.",
        });
        latest.current.onClose();
      });
    return () => {
      alive = false;
    };
  }, [open, tenantId]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // mentre salva non si chiude e non si sposta niente: l'esito si vede
  const close = () => {
    if (!saving) onClose();
  };

  const move = (from: number, to: number) => {
    if (!items || saving || to < 0 || to >= items.length || from === to) return;
    setItems(arrayMove(items, from, to));
    setChanged(true);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!items || !over || active.id === over.id) return;
    move(
      items.findIndex((item) => item.id === active.id),
      items.findIndex((item) => item.id === over.id),
    );
  };

  const handleSave = async () => {
    if (!items) return;
    setSaving(true);
    try {
      await reorderCatalogs(
        tenantId,
        items.map((item) => item.id),
      );
      showToast({ type: "success", message: "Ordine salvato." });
      onSaved?.();
      onClose();
    } catch (err) {
      console.error(err);
      // 22023: l'elenco non è più quello del database (un menù creato o
      // eliminato intanto): si rilegge.
      showToast({
        type: "error",
        message: "Ordine non salvato: riapri il pannello e riprova.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SystemDrawer open={open} onClose={close} size="sm">
      <DrawerLayout
        header={
          <Text variant="title-sm" weight={600}>
            Ordine per i clienti
          </Text>
        }
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={saving}>
              Annulla
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              loading={saving}
              disabled={!changed}
            >
              Salva
            </Button>
          </>
        }
      >
        <Text variant="body-sm" colorVariant="muted">
          Quando in una sede c'è più di un {catalogLabel} in onda, i clienti li
          trovano in quest'ordine. Vale per tutte le sedi.
        </Text>
        {!items ? (
          <Loader />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={items.map((item) => item.id)}
              strategy={verticalListSortingStrategy}
            >
              <ol
                className={styles.list}
                aria-label={`Ordine dei ${catalogLabel}`}
              >
                {items.map((item, index) => (
                  <CatalogOrderRow
                    key={item.id}
                    item={item}
                    index={index}
                    last={index === items.length - 1}
                    onMove={move}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}
      </DrawerLayout>
    </SystemDrawer>
  );
}
