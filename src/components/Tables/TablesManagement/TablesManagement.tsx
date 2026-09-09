import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Grid2X2, Layers, MoreHorizontal, Plus, QrCode, RotateCw } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import Text from "@/components/ui/Text/Text";
import { NumberInput } from "@/components/ui/Input/NumberInput";
import { UnsavedChangesBar } from "@/components/ui/UnsavedChangesBar/UnsavedChangesBar";
import { Card } from "@/components/ui/Card/Card";
import { updateActivity } from "@/services/supabase/activities";

import { useToast } from "@/context/Toast/ToastContext";
import { usePermissions } from "@/context/PermissionsContext";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { canDoOnActivity } from "@/lib/permissions";

import {
    deleteTable,
    generateTableQrsPdf,
    listTablesWithState,
    regenerateTableQrToken
} from "@/services/supabase/tables";
import type { V2Table, V2TableWithState } from "@/types/orders";

import { TableZoneManagementDrawer } from "@/components/Tables/TableZoneManagementDrawer/TableZoneManagementDrawer";
import { TableForm } from "@/components/Tables/TableForm/TableForm";

import TableDeleteDrawer from "@/pages/Dashboard/Tables/TableDeleteDrawer";
import TableRegenerateTokenDrawer from "@/pages/Dashboard/Tables/TableRegenerateTokenDrawer";
import TableQrPreviewDrawer from "@/pages/Dashboard/Tables/TableQrPreviewDrawer";

import styles from "./TablesManagement.module.scss";

export interface TablesManagementProps {
    tenantId: string;
    activityId: string;
    /** Ordinazioni QR attive sulla sede. Gate delle SOLE azioni QR (anteprima,
     *  genera PDF, rigenera token) e della colonna QR: senza ordinazioni il QR
     *  non porta da nessuna parte. NON gatare la creazione tavoli — i tavoli
     *  servono anche alle prenotazioni. */
    orderingEnabled: boolean;
    /** Prenotazioni attive sulla sede. Gate dei campi di assegnazione
     *  (capienza min/max, gruppo di accostamento, priorita', prenotabile
     *  online): a chi non prenota non servono e non vengono mostrati. */
    reservationsEnabled: boolean;
    /** Capienza operativa (coperti) e durata media tavolo: colonne della riga
     *  sede caricata dalla pagina. Sala le scrive, Prenotazioni le legge. */
    reservationCapacity?: number | null;
    reservationDurationMinutes?: number | null;
    /** Modalità di conferma corrente: con "auto" la capienza non si può
     *  togliere (CHECK `activities_auto_requires_capacity`), e va detto qui
     *  prima del round-trip, non scoperto da un errore DB. */
    reservationConfirmationMode?: "manuale" | "auto";
    /** Ricarica la riga sede dopo il salvataggio di capienza/durata, così
     *  Prenotazioni vede il valore nuovo senza reload. */
    onActivityChanged?: () => Promise<void>;
    /** `activity.manage`: senza, capienza e durata si leggono ma non si salvano. */
    canManageActivity?: boolean;
}

export function TablesManagement({
    tenantId,
    activityId,
    orderingEnabled,
    reservationsEnabled,
    reservationCapacity = null,
    reservationDurationMinutes = null,
    reservationConfirmationMode = "manuale",
    onActivityChanged,
    canManageActivity = true
}: TablesManagementProps) {
    const { showToast } = useToast();
    const { permissions } = usePermissions();
    const { canEdit } = useSubscriptionGuard();
    const canManage = !!permissions && canDoOnActivity(permissions, "tables.manage", activityId);

    // Data
    const [items, setItems] = useState<V2TableWithState[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Filters
    const [searchQuery, setSearchQuery] = useState("");

    // Drawer Create/Edit
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<V2Table | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Delete drawer
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<V2Table | null>(null);

    // Regenerate token drawer
    const [isRegenOpen, setIsRegenOpen] = useState(false);
    const [itemToRegen, setItemToRegen] = useState<V2Table | null>(null);

    // Zone management drawer
    const [isZoneDrawerOpen, setIsZoneDrawerOpen] = useState(false);
    // Bumped quando zone cambiano fuori dal dropdown → forza reload del select via key remount.
    const [zoneReloadKey, setZoneReloadKey] = useState(0);

    // QR generation flags
    const [isGeneratingQrAll, setIsGeneratingQrAll] = useState(false);
    const [generatingQrTableId, setGeneratingQrTableId] = useState<string | null>(null);

    // QR preview drawer (anteprima interna del QR + link tavolo)
    const [qrPreviewTableId, setQrPreviewTableId] = useState<string | null>(null);
    const [isQrPreviewDownloadingPdf, setIsQrPreviewDownloadingPdf] = useState(false);

    // Bulk selection
    const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);

    const loadData = useCallback(async () => {
        if (!tenantId || !activityId) {
            setItems([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const data = await listTablesWithState(tenantId, activityId);
            setItems(data);
        } catch {
            showToast({ message: "Impossibile caricare i tavoli", type: "error" });
        } finally {
            setIsLoading(false);
        }
    }, [tenantId, activityId, showToast]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    // ── Capienza della sala (draft + UnsavedChangesBar) ─────────────────────
    // Capienza OPERATIVA: la digita il ristoratore, può essere più bassa dei
    // posti fisici (la cucina non regge la sala piena). Non viene derivata
    // dai tavoli né corretta d'ufficio: la somma dei posti mappati è un
    // controllo di realtà, informativo, mai bloccante.
    // Scrive SOLO `reservation_capacity` + `reservation_duration_minutes`:
    // le altre regole di prenotazione hanno il loro draft in Prenotazioni.
    type CapacityDraft = { capacity: string; durationMinutes: string };
    const savedCapacity: CapacityDraft = useMemo(() => ({
        capacity: reservationCapacity == null ? "" : String(reservationCapacity),
        durationMinutes: String(reservationDurationMinutes ?? 120)
    }), [reservationCapacity, reservationDurationMinutes]);
    const [capacityDraft, setCapacityDraft] = useState<CapacityDraft>(savedCapacity);
    const [isSavingCapacity, setIsSavingCapacity] = useState(false);
    const lastSavedCapacityRef = useRef<CapacityDraft>(savedCapacity);

    // Re-sync sul reload della riga sede preservando il draft sporco.
    useEffect(() => {
        const prevSaved = lastSavedCapacityRef.current;
        if (
            savedCapacity.capacity === prevSaved.capacity &&
            savedCapacity.durationMinutes === prevSaved.durationMinutes
        ) {
            return;
        }
        setCapacityDraft(prev =>
            prev.capacity === prevSaved.capacity &&
            prev.durationMinutes === prevSaved.durationMinutes
                ? savedCapacity
                : prev
        );
        lastSavedCapacityRef.current = savedCapacity;
    }, [savedCapacity]);

    const isCapacityDirty =
        capacityDraft.capacity !== savedCapacity.capacity ||
        capacityDraft.durationMinutes !== savedCapacity.durationMinutes;

    // Somma dei posti mappati, dai tavoli già in memoria (stessa lista della
    // tabella qui sotto): nessuna lettura in più.
    const seatsSummary = useMemo(() => ({
        totalSeats: items.reduce((sum, t) => sum + (t.seats ?? 0), 0),
        tablesCount: items.length,
        tablesWithoutSeats: items.filter(t => t.seats == null).length
    }), [items]);

    // Divergenza rilevante: oltre il 20% della capienza dichiarata e almeno 4
    // coperti di scarto. Sotto quella soglia il rumore supererebbe il segnale.
    const capacityMismatch = useMemo(() => {
        if (seatsSummary.tablesCount === 0) return null;
        const declared = Number(capacityDraft.capacity.trim());
        if (!Number.isFinite(declared) || declared <= 0) return null;
        const delta = seatsSummary.totalSeats - declared;
        const isRelevant = Math.abs(delta) >= 4 && Math.abs(delta) >= declared * 0.2;
        return isRelevant ? { delta, declared } : null;
    }, [seatsSummary, capacityDraft.capacity]);

    const saveCapacity = useCallback(async () => {
        // Validazione locale (i CHECK a schema la rispecchiano). Capienza
        // vuota → NULL (nessun limite). Durata in 15..600.
        const trimmedCapacity = capacityDraft.capacity.trim();
        let capacityValue: number | null = null;
        if (trimmedCapacity.length > 0) {
            const parsed = parseInt(trimmedCapacity, 10);
            if (!Number.isFinite(parsed) || parsed <= 0) {
                showToast({
                    message: "La capienza deve essere un numero maggiore di zero.",
                    type: "error"
                });
                return;
            }
            capacityValue = parsed;
        }
        const durationParsed = parseInt(capacityDraft.durationMinutes.trim(), 10);
        if (!Number.isFinite(durationParsed) || durationParsed < 15 || durationParsed > 600) {
            showToast({
                message: "La durata deve essere compresa tra 15 e 600 minuti.",
                type: "error"
            });
            return;
        }
        // Speculare alla regola in Prenotazioni ("auto richiede capienza"):
        // la capienza non si toglie finché la conferma automatica è attiva.
        if (capacityValue === null && reservationConfirmationMode === "auto") {
            showToast({
                message:
                    "Le prenotazioni sono in conferma automatica, che richiede una capienza. Passa a conferma manuale in Prenotazioni prima di toglierla.",
                type: "error"
            });
            return;
        }
        setIsSavingCapacity(true);
        try {
            await updateActivity(activityId, tenantId, {
                reservation_capacity: capacityValue,
                reservation_duration_minutes: durationParsed
            });
            await onActivityChanged?.();
            showToast({ message: "Capienza salvata.", type: "success" });
        } catch {
            showToast({
                message: "Impossibile salvare la capienza della sala.",
                type: "error"
            });
        } finally {
            setIsSavingCapacity(false);
        }
    }, [activityId, tenantId, capacityDraft, reservationConfirmationMode, onActivityChanged, showToast]);

    const cancelCapacity = useCallback(() => {
        setCapacityDraft(savedCapacity);
    }, [savedCapacity]);

    const handleBulkDelete = useCallback(
        async (ids: string[]) => {
            if (!tenantId || ids.length === 0) return;
            const results = await Promise.allSettled(
                ids.map(id => deleteTable(id, tenantId))
            );
            const failed = results.filter(r => r.status === "rejected").length;
            const ok = results.length - failed;
            if (ok > 0) {
                showToast({
                    message: ok === 1 ? "1 tavolo eliminato" : `${ok} tavoli eliminati`,
                    type: "success"
                });
            }
            if (failed > 0) {
                showToast({
                    message:
                        failed === 1
                            ? "1 tavolo non eliminato"
                            : `${failed} tavoli non eliminati`,
                    type: "error"
                });
            }
            setSelectedTableIds([]);
            await loadData();
        },
        [tenantId, showToast, loadData]
    );

    // ── Filtering ──
    const filteredItems = useMemo(() => {
        let result = items;
        const q = searchQuery.trim().toLowerCase();
        if (q.length > 0) {
            result = result.filter(
                t =>
                    t.label.toLowerCase().includes(q) ||
                    (t.zone_name?.toLowerCase() ?? "").includes(q)
            );
        }
        return result;
    }, [items, searchQuery]);
    const allItemIds = useMemo(() => items.map(t => t.id), [items]);

    // ── Handlers ──
    function openCreate() {
        setEditingItem(null);
        setIsDrawerOpen(true);
    }

    function openEdit(item: V2Table) {
        setEditingItem(item);
        setIsDrawerOpen(true);
    }

    function openDelete(item: V2Table) {
        setItemToDelete(item);
        setIsDeleteOpen(true);
    }

    async function handleFormSuccess() {
        setIsDrawerOpen(false);
        await loadData();
    }

    async function handleDelete() {
        if (!itemToDelete || !tenantId) return;
        try {
            await deleteTable(itemToDelete.id, tenantId);
            showToast({ message: "Tavolo eliminato", type: "success" });
            setIsDeleteOpen(false);
            setItemToDelete(null);
            await loadData();
        } catch {
            showToast({ message: "Errore durante l'eliminazione", type: "error" });
        }
    }

    function downloadPdfBlob(blob: Blob, filename: string) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async function handleGenerateQrAll() {
        if (!activityId || isGeneratingQrAll) return;
        setIsGeneratingQrAll(true);
        try {
            const blob = await generateTableQrsPdf(activityId);
            downloadPdfBlob(blob, `qr-codes-${activityId}.pdf`);
            showToast({ message: "PDF QR generato", type: "success" });
        } catch (err) {
            const msg =
                err instanceof Error ? err.message : "Errore nella generazione del PDF";
            showToast({ message: msg, type: "error" });
        } finally {
            setIsGeneratingQrAll(false);
        }
    }

    async function handleGenerateQrSingle(table: V2Table) {
        if (!activityId || generatingQrTableId !== null) return;
        setGeneratingQrTableId(table.id);
        try {
            const blob = await generateTableQrsPdf(activityId, [table.id]);
            downloadPdfBlob(blob, `qr-${table.label}.pdf`);
            showToast({ message: "PDF QR generato", type: "success" });
        } catch (err) {
            const msg =
                err instanceof Error ? err.message : "Errore nella generazione del PDF";
            showToast({ message: msg, type: "error" });
        } finally {
            setGeneratingQrTableId(null);
        }
    }

    function openRegen(item: V2Table) {
        setItemToRegen(item);
        setIsRegenOpen(true);
    }

    function openQrPreview(item: V2TableWithState) {
        setQrPreviewTableId(item.id);
    }

    // Selected table re-derivata da items[] per essere resiliente a refetch
    // post-regenerate-token: se il qr_token della riga cambia mentre il drawer
    // e' aperto, il QR mostrato si aggiorna automaticamente.
    const qrPreviewTable = useMemo(
        () =>
            qrPreviewTableId ? items.find(t => t.id === qrPreviewTableId) ?? null : null,
        [items, qrPreviewTableId]
    );

    // URL pubblico tavolo: route client `/t/:qrToken` (vedi App.tsx).
    // Pattern protocol/host coerente con ActivitySettingsTab (VITE_PUBLIC_DOMAIN
    // override per env, fallback su window.location.host).
    const qrPreviewUrl = useMemo(() => {
        if (!qrPreviewTable) return null;
        const domain = import.meta.env.VITE_PUBLIC_DOMAIN || window.location.host;
        const protocol = window.location.protocol;
        return `${protocol}//${domain}/t/${qrPreviewTable.qr_token}`;
    }, [qrPreviewTable]);

    async function handleQrPreviewDownloadPdf(): Promise<void> {
        if (!qrPreviewTable || !activityId || isQrPreviewDownloadingPdf) return;
        setIsQrPreviewDownloadingPdf(true);
        try {
            const blob = await generateTableQrsPdf(activityId, [qrPreviewTable.id]);
            downloadPdfBlob(blob, `qr-${qrPreviewTable.label}.pdf`);
            showToast({ message: "PDF QR generato", type: "success" });
        } catch (err) {
            const msg =
                err instanceof Error ? err.message : "Errore nella generazione del PDF";
            showToast({ message: msg, type: "error" });
        } finally {
            setIsQrPreviewDownloadingPdf(false);
        }
    }

    async function handleRegenerate(terminateSessions: boolean) {
        if (!itemToRegen || !tenantId) return;
        try {
            await regenerateTableQrToken(itemToRegen.id, tenantId, terminateSessions);
            showToast({
                message: "Token rigenerato. Stampa il nuovo QR.",
                type: "success"
            });
            setIsRegenOpen(false);
            setItemToRegen(null);
            await loadData();
        } catch {
            showToast({
                message: "Errore durante la rigenerazione del token",
                type: "error"
            });
        }
    }

    // ── Columns ──
    // `undefined` e `null` NON sono la stessa cosa in queste colonne:
    //   null      = il ristoratore non ha dichiarato il valore → "—" / default;
    //   undefined = il campo non e' arrivato dalla view → dato mancante.
    // Il secondo caso e' successo davvero: la view `v_tables_with_state` elenca
    // le colonne una per una e finche' non e' stata ricreata restituiva
    // `bookable_online` assente, che come falsy stampava "Solo walk-in" su
    // tavoli tutti prenotabili. Una cella che dice il contrario del vero non fa
    // rumore; una che dice "non lo so" si nota. Da qui il ramo esplicito.
    // I tipi dicono che il campo c'e' sempre; il payload della view puo'
    // smentirli. Il cast a Partial e' il punto in cui questa distanza fra
    // tipo e realta' viene ammessa, invece di essere ignorata.
    const isFieldMissing = (row: V2TableWithState, key: keyof V2TableWithState) =>
        (row as Partial<V2TableWithState>)[key] === undefined;

    const missingCell = (
        <Tooltip content="Dato non disponibile: ricaricare la pagina o verificare le migration della vista tavoli">
            <span>
                <Text variant="body-sm" colorVariant="muted">
                    n/d
                </Text>
            </span>
        </Tooltip>
    );

    const columns: ColumnDefinition<V2TableWithState>[] = [
        {
            id: "label",
            header: "Tavolo",
            width: "2fr",
            accessor: row => row.label,
            cell: (_v, row) => (
                <div className={styles.labelCell}>
                    <Text variant="body-sm" weight={600}>
                        {row.label}
                    </Text>
                </div>
            )
        },
        {
            id: "zone",
            header: "Zona",
            width: "1fr",
            accessor: row => row.zone_name,
            cell: (_v, row) =>
                row.zone_name ? (
                    <Text variant="body-sm">{row.zone_name}</Text>
                ) : (
                    <Text variant="body-sm" colorVariant="muted">
                        —
                    </Text>
                )
        },
        {
            id: "seats",
            header: "Posti",
            width: "80px",
            accessor: row => row.seats,
            cell: (_v, row) => (
                <Text variant="body-sm" colorVariant="muted">
                    {row.seats ?? "—"}
                </Text>
            )
        },
        // Colonne di assegnazione: solo con prenotazioni attive.
        ...(reservationsEnabled
            ? ([
                  {
                      id: "capacity_range",
                      header: "Min–Max",
                      width: "100px",
                      accessor: row => row.max_seats ?? row.seats,
                      cell: (_v, row) => {
                          // Il tetto e' `max_seats`, con fallback su `seats`: ma il
                          // fallback vale solo se `max_seats` e' davvero NULL a DB.
                          if (
                              isFieldMissing(row, "min_seats") ||
                              isFieldMissing(row, "max_seats")
                          ) {
                              return missingCell;
                          }
                          const floor = row.min_seats ?? "—";
                          const ceiling = row.max_seats ?? row.seats ?? "—";
                          return (
                              <Text variant="body-sm" colorVariant="muted">
                                  {`${floor} – ${ceiling}`}
                              </Text>
                          );
                      }
                  },
                  {
                      id: "combination_group",
                      header: "Accostamento",
                      width: "1fr",
                      accessor: row => row.combination_group_name,
                      cell: (_v, row) => {
                          if (isFieldMissing(row, "combination_group_name")) {
                              return missingCell;
                          }
                          return row.combination_group_name === null ? (
                              <Text variant="body-sm" colorVariant="muted">
                                  Da solo
                              </Text>
                          ) : (
                              <Text variant="body-sm">{row.combination_group_name}</Text>
                          );
                      }
                  },
                  {
                      id: "bookable_online",
                      header: "Prenotabile",
                      width: "110px",
                      accessor: row => row.bookable_online,
                      cell: (_v, row) => {
                          if (isFieldMissing(row, "bookable_online")) return missingCell;
                          return (
                              <Text
                                  variant="body-sm"
                                  colorVariant={row.bookable_online ? undefined : "muted"}
                              >
                                  {row.bookable_online ? "Sì" : "Solo walk-in"}
                              </Text>
                          );
                      }
                  }
              ] as ColumnDefinition<V2TableWithState>[])
            : []),
        {
            id: "actions",
            header: "",
            width: "104px",
            align: "right",
            cell: (_v, row) => (
                <div className={styles.actionsCell}>
                    {/* Azioni QR: senza ordinazioni attive il QR non porta da
                        nessuna parte, quindi non si mostra affatto. */}
                    {orderingEnabled && (
                        <Tooltip content="Anteprima QR">
                            <IconButton
                                icon={<QrCode size={16} />}
                                aria-label="Anteprima QR"
                                variant="ghost"
                                onClick={() => openQrPreview(row)}
                            />
                        </Tooltip>
                    )}
                    {canManage && (
                        <TableRowActions
                            actions={[
                                { label: "Modifica", onClick: () => openEdit(row) },
                                ...(orderingEnabled
                                    ? [
                                          {
                                              label:
                                                  generatingQrTableId === row.id
                                                      ? "Generazione..."
                                                      : "Genera QR",
                                              icon: QrCode,
                                              onClick: () => handleGenerateQrSingle(row)
                                          },
                                          {
                                              label: "Rigenera token QR",
                                              icon: RotateCw,
                                              onClick: () => openRegen(row)
                                          }
                                      ]
                                    : []),
                                {
                                    label: "Elimina",
                                    variant: "destructive" as const,
                                    onClick: () => openDelete(row),
                                    separator: true
                                }
                            ]}
                        />
                    )}
                </div>
            )
        }
    ];

    const hasFiltersActive = searchQuery.trim().length > 0;

    return (
        <section className={styles.container}>
            {/* Capienza accanto ai tavoli: il confronto con i posti mappati si
                legge invece di doverlo raccontare. Solo con prenotazioni:
                alle ordinazioni QR la capienza non serve. */}
            {reservationsEnabled && (
                <Card className={styles.capacityCard}>
                    <div className={styles.capacityHeader}>
                        <h3 className={styles.capacityTitle}>Capienza della sala</h3>
                        <p className={styles.capacitySubtitle}>
                            Coperti accettabili dalle prenotazioni online e durata media di un tavolo.
                        </p>
                    </div>
                    <div className={styles.capacityBody}>
                        <div className={styles.capacityRow}>
                            <div className={styles.capacityField}>
                                <NumberInput
                                    label="Capienza (coperti)"
                                    placeholder="Es. 40"
                                    min={1}
                                    value={capacityDraft.capacity}
                                    onChange={e =>
                                        setCapacityDraft(d => ({ ...d, capacity: e.target.value }))
                                    }
                                    disabled={isSavingCapacity || !canManageActivity}
                                />
                                {capacityDraft.capacity.trim() === "" && (
                                    <p className={styles.capacityHint}>
                                        Senza capienza impostata, le prenotazioni online non hanno limiti
                                        e la conferma automatica non è disponibile.
                                    </p>
                                )}
                                {seatsSummary.tablesCount > 0 && (
                                    <p className={styles.capacityHint}>
                                        {`Posti mappati sui tavoli: ${seatsSummary.totalSeats} su ${seatsSummary.tablesCount} ${seatsSummary.tablesCount === 1 ? "tavolo" : "tavoli"}.`}
                                        {seatsSummary.tablesWithoutSeats > 0 &&
                                            ` ${seatsSummary.tablesWithoutSeats} ${seatsSummary.tablesWithoutSeats === 1 ? "tavolo non dichiara" : "tavoli non dichiarano"} i posti, quindi la somma è parziale.`}
                                    </p>
                                )}
                                {capacityMismatch && (
                                    <p className={styles.capacityWarning}>
                                        {capacityMismatch.delta < 0
                                            ? `I tavoli reggono ${seatsSummary.totalSeats} posti, meno della capienza impostata: alcune prenotazioni accettate potrebbero restare senza tavolo.`
                                            : `Il modulo online si ferma a ${capacityMismatch.declared} coperti anche se i tavoli ne reggono ${seatsSummary.totalSeats}. Se è voluto — per esempio la cucina non regge la sala piena — va bene così.`}
                                    </p>
                                )}
                            </div>
                            <div className={styles.capacityField}>
                                <NumberInput
                                    label="Durata media tavolo (minuti)"
                                    placeholder="120"
                                    min={15}
                                    max={600}
                                    value={capacityDraft.durationMinutes}
                                    onChange={e =>
                                        setCapacityDraft(d => ({ ...d, durationMinutes: e.target.value }))
                                    }
                                    disabled={isSavingCapacity || !canManageActivity}
                                />
                                <p className={styles.capacityHint}>
                                    Durata occupazione tipica di un tavolo. Default 120.
                                </p>
                            </div>
                        </div>
                        {isCapacityDirty && (
                            <UnsavedChangesBar
                                isSaving={isSavingCapacity}
                                onCancel={cancelCapacity}
                                onSave={() => {
                                    void saveCapacity();
                                }}
                            />
                        )}
                    </div>
                </Card>
            )}
            <div className={styles.content}>
                {/* Toolbar di sezione: cluster DX (search + altro + CTA). */}
                <div className={styles.toolbar}>
                    <div className={styles.actionsCluster}>
                        <ToolbarSearch
                            value={searchQuery}
                            onChange={setSearchQuery}
                            placeholder="Cerca per nome o zona..."
                        />
                        {canManage && (
                            <DropdownMenu.Root>
                                <DropdownMenu.Trigger asChild>
                                    <Button
                                        variant="outline"
                                        leftIcon={<MoreHorizontal size={16} />}
                                        disabled={!activityId || !canEdit}
                                        className={styles.toolbarCta}
                                        aria-label="Altre azioni"
                                    >
                                        Altro
                                    </Button>
                                </DropdownMenu.Trigger>
                                <DropdownMenu.Portal>
                                    <DropdownMenu.Content
                                        className={styles.dropdownContent}
                                        align="end"
                                        sideOffset={6}
                                    >
                                        <DropdownMenu.Item
                                            className={styles.dropdownItem}
                                            onSelect={() => setIsZoneDrawerOpen(true)}
                                            disabled={!activityId || !canEdit}
                                        >
                                            <Layers size={14} />
                                            <span>Gestisci zone</span>
                                        </DropdownMenu.Item>
                                        {orderingEnabled && (
                                            <DropdownMenu.Item
                                                className={styles.dropdownItem}
                                                onSelect={() => void handleGenerateQrAll()}
                                                disabled={!activityId || items.length === 0 || isGeneratingQrAll || !canEdit}
                                            >
                                                <QrCode size={14} />
                                                <span>{isGeneratingQrAll ? "Generazione..." : "Genera QR"}</span>
                                            </DropdownMenu.Item>
                                        )}
                                    </DropdownMenu.Content>
                                </DropdownMenu.Portal>
                            </DropdownMenu.Root>
                        )}
                        {canManage && (
                            <Button
                                variant="primary"
                                leftIcon={<Plus size={16} />}
                                onClick={openCreate}
                                disabled={!activityId || !canEdit}
                                className={styles.toolbarCta}
                            >
                                Nuovo tavolo
                            </Button>
                        )}
                    </div>
                </div>

                {!isLoading && filteredItems.length === 0 ? (
                    <EmptyState
                        icon={<Grid2X2 size={40} strokeWidth={1.5} />}
                        title={items.length === 0 ? "Nessun tavolo" : "Nessun risultato"}
                        description={
                            items.length === 0
                                ? orderingEnabled && reservationsEnabled
                                    ? "Crea il primo tavolo: serve sia alle ordinazioni al QR sia all'assegnazione delle prenotazioni."
                                    : orderingEnabled
                                      ? "Crea il primo tavolo per iniziare a ricevere ordinazioni."
                                      : "Mappa i tavoli per poterli assegnare alle prenotazioni."
                                : hasFiltersActive
                                  ? "Modifica i filtri per vedere altri risultati."
                                  : "Nessun tavolo da mostrare."
                        }
                        action={
                            items.length === 0 && activityId && canManage ? (
                                <Button variant="primary" onClick={openCreate} disabled={!canEdit}>
                                    Nuovo tavolo
                                </Button>
                            ) : undefined
                        }
                    />
                ) : (
                    <DataTable<V2TableWithState>
                        data={filteredItems}
                        allRowIds={allItemIds}
                        columns={columns}
                        isLoading={isLoading}
                        selectable={canManage}
                        selectedRowIds={selectedTableIds}
                        onSelectedRowsChange={setSelectedTableIds}
                        onBulkDelete={canManage ? handleBulkDelete : undefined}
                    />
                )}
            </div>

            {/* Drawer Create/Edit */}
            <SystemDrawer
                open={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                width={480}
            >
                <DrawerLayout
                    header={
                        <Text variant="title-sm" weight={600}>
                            {editingItem ? "Modifica tavolo" : "Nuovo tavolo"}
                        </Text>
                    }
                    footer={
                        <>
                            <Button
                                variant="secondary"
                                onClick={() => setIsDrawerOpen(false)}
                                disabled={isSaving}
                            >
                                Annulla
                            </Button>
                            <Button
                                variant="primary"
                                type="submit"
                                form="table-form"
                                loading={isSaving}
                            >
                                {editingItem ? "Salva" : "Crea"}
                            </Button>
                        </>
                    }
                >
                    <TableForm
                        // Key forza remount ad ogni apertura: senza, riaprire lo stesso
                        // tavolo (o "Nuovo tavolo" due volte) dopo un Annulla riusa
                        // l'istanza e trascina i campi non salvati della volta prima.
                        key={editingItem ? `edit-${editingItem.id}` : "create"}
                        formId="table-form"
                        mode={editingItem ? "edit" : "create"}
                        entityData={editingItem}
                        tenantId={tenantId}
                        activityId={activityId}
                        reservationsEnabled={reservationsEnabled}
                        zoneReloadKey={zoneReloadKey}
                        onSuccess={handleFormSuccess}
                        onSavingChange={setIsSaving}
                    />
                </DrawerLayout>
            </SystemDrawer>

            <TableDeleteDrawer
                open={isDeleteOpen}
                table={itemToDelete}
                onClose={() => {
                    setIsDeleteOpen(false);
                    setItemToDelete(null);
                }}
                onConfirm={handleDelete}
            />

            <TableRegenerateTokenDrawer
                open={isRegenOpen}
                table={itemToRegen}
                onClose={() => {
                    setIsRegenOpen(false);
                    setItemToRegen(null);
                }}
                onConfirm={handleRegenerate}
            />

            <TableQrPreviewDrawer
                open={qrPreviewTableId !== null}
                table={qrPreviewTable}
                qrUrl={qrPreviewUrl}
                onClose={() => setQrPreviewTableId(null)}
                onDownloadPdf={handleQrPreviewDownloadPdf}
                isDownloadingPdf={isQrPreviewDownloadingPdf}
            />

            <TableZoneManagementDrawer
                isOpen={isZoneDrawerOpen}
                onClose={() => setIsZoneDrawerOpen(false)}
                onZonesChanged={() => {
                    setZoneReloadKey(k => k + 1);
                    void loadData();
                }}
                tenantId={tenantId}
                activityId={activityId}
            />
        </section>
    );
}
