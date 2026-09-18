import React, { useCallback, useEffect, useState } from "react";
import { CircleHelp, Plus, Printer as PrinterIcon, RefreshCw, Unlink } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { useToast } from "@/context/Toast/ToastContext";
import { usePermissions } from "@/context/PermissionsContext";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { canDoOnActivity } from "@/lib/permissions";
import { PRINTER_PURCHASE_URL } from "@/config/printers";
import {
  fetchPrintersStatus,
  listPrinters,
  unbindPrinter,
  PrinterServiceError,
} from "@/services/supabase/printers";
import type { Printer, PrinterStatusResult } from "@/types/printers";
import { PrinterBindDrawer } from "./PrinterBindDrawer";
import { PrinterUnbindDrawer } from "./PrinterUnbindDrawer";
import { PrinterGuideModal } from "./components/PrinterGuideModal";
import styles from "./PrintersSection.module.scss";

interface PrintersSectionProps {
  tenantId: string;
  activityId: string;
}

/**
 * Corpo della Card "Stampanti" (tab Ordinazioni della sede): lista stampanti Sunmi
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
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [statusResult, setStatusResult] = useState<PrinterStatusResult | null>(null);
  const [isStatusLoading, setIsStatusLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!canRead) return;
    try {
      setIsStatusLoading(true);
      const result = await fetchPrintersStatus(tenantId, activityId);
      setStatusResult(result);
    } catch (err) {
      setStatusResult(null);
      showToast({
        message:
          err instanceof PrinterServiceError
            ? err.message
            : "Impossibile verificare lo stato delle stampanti.",
        type: "error",
      });
    } finally {
      setIsStatusLoading(false);
    }
  }, [tenantId, activityId, canRead, showToast]);

  const loadData = useCallback(async () => {
    if (!canRead) {
      setItems([]);
      setStatusResult(null);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const data = await listPrinters(tenantId, activityId);
      setItems(data);
      // Il badge legge lo stato persistito (scritto dal callback Sunmi) di
      // default: nessuna chiamata a Sunmi automatica a ogni apertura. Un
      // eventuale esito di "Aggiorna stato" da una sessione precedente non è
      // più pertinente dopo un reload della lista.
      setStatusResult(null);
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

  const renderStatusBadge = (printer: Printer) => {
    // "Aggiorna stato" eseguito in questa sessione: mostra l'esito fresco
    // dell'on-demand invece del persistito, finché non si ricarica la lista.
    if (statusResult) {
      const isOnline = statusResult.available
        ? statusResult.statuses[printer.sn]
        : undefined;
      if (isOnline === undefined) {
        return <StatusBadge variant="neutral" label="Stato non disponibile" />;
      }
      return isOnline
        ? <StatusBadge variant="success" label="Online" />
        : <StatusBadge variant="warning" label="Offline" />;
    }
    // Default: stato persistito dal callback Sunmi. null = nessun evento
    // mai ricevuto per questo dispositivo, non "offline".
    if (printer.is_online === null) {
      return <StatusBadge variant="neutral" label="Stato non disponibile" />;
    }
    return printer.is_online
      ? <StatusBadge variant="success" label="Online" />
      : <StatusBadge variant="warning" label="Offline" />;
  };

  return (
    <div className={styles.body}>
      <div className={styles.toolbar}>
        <p className={styles.hint}>
          Le stampanti collegate ricevono le comande della sede. Puoi collegarne
          più di una, per esempio cucina e bar.
        </p>
        <div className={styles.toolbarActions}>
          {items.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<RefreshCw size={16} />}
              loading={isStatusLoading}
              onClick={() => loadStatus()}
            >
              Aggiorna stato
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<CircleHelp size={16} />}
            onClick={() => setIsGuideOpen(true)}
          >
            Come collegare una stampante
          </Button>
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
      </div>

      {canManage && items.length > 0 && (
        <p className={styles.purchaseNote}>
          Funzionano solo le stampanti acquistate dal nostro link: vengono
          abbinate al nostro sistema al momento della spedizione. Gli stessi
          modelli comprati altrove non possono essere collegati.{" "}
          <a href={PRINTER_PURCHASE_URL} target="_blank" rel="noopener noreferrer">
            Compra una stampante
          </a>
        </p>
      )}

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
          action={
            canManage && (
              <div className={styles.emptyActions}>
                <Button variant="secondary" size="sm" onClick={() => setIsGuideOpen(true)}>
                  Come collegare una stampante
                </Button>
                <Button
                  as="a"
                  href={PRINTER_PURCHASE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="ghost"
                  size="sm"
                >
                  Compra una stampante
                </Button>
              </div>
            )
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
              <div className={styles.rowStatus}>
                {renderStatusBadge(p)}
                {p.out_of_paper && (
                  <StatusBadge variant="warning" label="Carta esaurita" />
                )}
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

      <PrinterGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
    </div>
  );
};
