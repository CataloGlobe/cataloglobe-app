import React, { useCallback, useEffect, useState } from "react";
import { Plus, Printer as PrinterIcon, Unlink } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { useToast } from "@/context/Toast/ToastContext";
import { usePermissions } from "@/context/PermissionsContext";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { canDoOnActivity } from "@/lib/permissions";
import {
  listPrinters,
  unbindPrinter,
  PrinterServiceError,
} from "@/services/supabase/printers";
import type { Printer } from "@/types/printers";
import { PrinterBindDrawer } from "./PrinterBindDrawer";
import { PrinterUnbindDrawer } from "./PrinterUnbindDrawer";
import styles from "./PrintersSection.module.scss";

interface PrintersSectionProps {
  tenantId: string;
  activityId: string;
}

/**
 * Corpo della Card "Stampanti" (tab Impostazioni sede): lista stampanti Sunmi
 * collegate + CTA "Collega stampante" + azione "Scollega" per riga.
 *
 * Gating come TablesManagement: `tables.manage` (permesso) + `canEdit`
 * (abbonamento). Lettura: `tables.read` → se assente non si fetcha (evita
 * un round-trip vuoto) e si mostra l'empty state.
 */
export const PrintersSection: React.FC<PrintersSectionProps> = ({
  tenantId,
  activityId,
}) => {
  const { showToast } = useToast();
  const { permissions } = usePermissions();
  const { canEdit } = useSubscriptionGuard();
  const canRead =
    !!permissions && canDoOnActivity(permissions, "tables.read", activityId);
  const canManage =
    canEdit &&
    !!permissions &&
    canDoOnActivity(permissions, "tables.manage", activityId);

  const [items, setItems] = useState<Printer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBindOpen, setIsBindOpen] = useState(false);
  const [printerToUnbind, setPrinterToUnbind] = useState<Printer | null>(null);

  const loadData = useCallback(async () => {
    if (!canRead) {
      setItems([]);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const data = await listPrinters(tenantId, activityId);
      setItems(data);
    } catch {
      showToast({
        message: "Impossibile caricare le stampanti.",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, activityId, canRead, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleBindSuccess = useCallback(
    async (alreadyBound: boolean) => {
      await loadData();
      setIsBindOpen(false);
      // `alreadyBound` = la riga esisteva gia' per questa sede (lista locale
      // stale): niente toast di successo, e' un'informazione.
      showToast(
        alreadyBound
          ? {
              message: "Questa stampante è già collegata a questa sede.",
              type: "info",
            }
          : { message: "Stampante collegata.", type: "success" },
      );
    },
    [loadData, showToast],
  );

  const handleUnbindConfirm = useCallback(async () => {
    if (!printerToUnbind) return;
    try {
      await unbindPrinter(printerToUnbind.id, tenantId);
      await loadData();
      setPrinterToUnbind(null);
      showToast({ message: "Stampante scollegata.", type: "success" });
    } catch (err) {
      showToast({
        message:
          err instanceof PrinterServiceError
            ? err.message
            : "Impossibile scollegare la stampante. Riprova.",
        type: "error",
      });
    }
  }, [printerToUnbind, tenantId, loadData, showToast]);

  return (
    <div className={styles.body}>
      <div className={styles.toolbar}>
        <p className={styles.hint}>
          Le stampanti collegate ricevono le comande della sede. Puoi collegarne
          più di una, per esempio cucina e bar.
        </p>
        {canManage && (
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus size={16} />}
            onClick={() => setIsBindOpen(true)}
          >
            Collega stampante
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className={styles.skeleton} aria-hidden="true" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<PrinterIcon size={40} strokeWidth={1.5} />}
          title="Nessuna stampante collegata"
          description={
            canManage
              ? "Collega una stampante Sunmi per ricevere le comande in cucina."
              : "Non ci sono stampanti collegate a questa sede."
          }
          compact
        />
      ) : (
        <ul className={styles.list}>
          {items.map((p) => (
            <li key={p.id} className={styles.row}>
              <PrinterIcon
                size={18}
                strokeWidth={1.5}
                className={styles.rowIcon}
              />
              <div className={styles.rowText}>
                <span className={styles.rowLabel}>{p.label}</span>
                <span className={styles.rowSn}>SN {p.sn}</span>
              </div>
              {canManage && (
                <div className={styles.rowActions}>
                  <TableRowActions
                    actions={[
                      {
                        label: "Scollega",
                        icon: Unlink,
                        variant: "destructive",
                        onClick: () => setPrinterToUnbind(p),
                      },
                    ]}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <PrinterBindDrawer
        open={isBindOpen}
        tenantId={tenantId}
        activityId={activityId}
        existingSns={items.map((p) => p.sn.toUpperCase())}
        onClose={() => setIsBindOpen(false)}
        onSuccess={handleBindSuccess}
      />

      <PrinterUnbindDrawer
        open={printerToUnbind !== null}
        printer={printerToUnbind}
        onClose={() => setPrinterToUnbind(null)}
        onConfirm={handleUnbindConfirm}
      />
    </div>
  );
};
