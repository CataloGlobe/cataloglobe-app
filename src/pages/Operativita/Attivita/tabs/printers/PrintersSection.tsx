import React, { useCallback, useEffect, useState } from "react";
import { Printer as PrinterIcon, Unlink } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import Text from "@/components/ui/Text/Text";
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
 * Card «Stampanti» della pagina Canali: le stampanti Sunmi collegate con
 * lo stato per stampante (registro Sedi #71), «Collega» e «Scollega».
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

  const actions = (
    <>
      {items.length > 0 && (
        <Button variant="ghost" size="sm" loading={isStatusLoading} onClick={() => loadStatus()}>
          Aggiorna stato
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={() => setIsGuideOpen(true)}>
        Come si collega
      </Button>
      {canManage && (
        <Button variant="primary" size="sm" onClick={() => setIsBindOpen(true)}>
          Collega
        </Button>
      )}
    </>
  );

  return (
    <Card
      title="Stampanti"
      subtitle="Lo stato è hardware, non configurazione"
      actions={actions}
      flush={!isLoading && items.length > 0}
    >
      {isLoading ? (
        <>
          <ListRow loading />
          <ListRow loading />
        </>
      ) : items.length === 0 ? (
        <EmptyState
          variant="inline"
          icon={<PrinterIcon />}
          title="Nessuna stampante collegata"
          description={
            canManage
              ? "Si collega col numero di serie della stampante più un nome. Funzionano solo le stampanti acquistate dal nostro link: vengono abbinate al nostro sistema alla spedizione."
              : "Non ci sono stampanti collegate a questa sede."
          }
          action={
            canManage ? (
              <Button
                as="a"
                href={PRINTER_PURCHASE_URL}
                target="_blank"
                rel="noopener noreferrer"
                variant="secondary"
                size="sm"
              >
                Compra una stampante
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {items.map((p) => (
            <ListRow
              key={p.id}
              leading={<PrinterIcon size={20} strokeWidth={1.75} />}
              title={p.label}
              subtitle={`SN ${p.sn}`}
              meta={
                <span className={styles.status}>
                  {renderStatusBadge(p)}
                  {p.out_of_paper && <StatusBadge variant="warning" label="Carta esaurita" />}
                </span>
              }
              trailing={
                canManage ? (
                  <TableRowActions
                    ariaLabel={`Azioni stampante ${p.label}`}
                    actions={[
                      {
                        label: "Scollega",
                        icon: Unlink,
                        variant: "destructive",
                        onClick: () => setPrinterToUnbind(p),
                      },
                    ]}
                  />
                ) : undefined
              }
            />
          ))}
          <div className={styles.note}>
            <Text variant="caption" colorVariant="muted">
              Una stampante offline non blocca gli ordini: il cliente ordina e la comanda arriva a schermo,
              ma in cucina nessuno la vede su carta.
            </Text>
          </div>
        </>
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
    </Card>
  );
};
