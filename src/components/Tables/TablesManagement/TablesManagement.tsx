import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { TextInput } from "@/components/ui/Input/TextInput";
import { Switch } from "@/components/ui/Switch/Switch";

import { useToast } from "@/context/Toast/ToastContext";
import { usePermissions } from "@/context/PermissionsContext";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { canDoOnActivity } from "@/lib/permissions";

import {
    createTable,
    deleteTable,
    generateTableQrsPdf,
    listTablesWithState,
    regenerateTableQrToken,
    updateTable
} from "@/services/supabase/tables";
import type { V2Table, V2TableWithState } from "@/types/orders";

import { ZoneSelectField } from "@/components/Tables/ZoneSelectField/ZoneSelectField";
import { CombinationGroupSelectField } from "@/components/Tables/CombinationGroupSelectField/CombinationGroupSelectField";
import { TableZoneManagementDrawer } from "@/components/Tables/TableZoneManagementDrawer/TableZoneManagementDrawer";

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
}

export function TablesManagement({
    tenantId,
    activityId,
    orderingEnabled,
    reservationsEnabled
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
    const [formLabel, setFormLabel] = useState("");
    const [formZoneId, setFormZoneId] = useState<string | null>(null);
    const [formSeats, setFormSeats] = useState<string>("");
    // Campi prenotazione. Stringhe vuote = "non dichiarato" (NULL a DB).
    const [formMinSeats, setFormMinSeats] = useState<string>("");
    const [formMaxSeats, setFormMaxSeats] = useState<string>("");
    const [formGroupId, setFormGroupId] = useState<string | null>(null);
    const [formPriority, setFormPriority] = useState<string>("0");
    const [formBookableOnline, setFormBookableOnline] = useState(true);
    // Stesso guardrail di `isCreatingZone` per il mini-form gruppo.
    const [isCreatingGroup, setIsCreatingGroup] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    // Guardrail: true mentre il mini-form "Crea zona" e' aperto. Blocca
    // submit del form tavolo per evitare creazione tavolo con zone_id=null
    // quando l'utente sta ancora compilando la nuova zona.
    const [isCreatingZone, setIsCreatingZone] = useState(false);

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
        setFormLabel("");
        setFormZoneId(null);
        setFormSeats("");
        setFormMinSeats("");
        setFormMaxSeats("");
        setFormGroupId(null);
        setFormPriority("0");
        setFormBookableOnline(true);
        setIsCreatingZone(false);
        setIsCreatingGroup(false);
        setIsDrawerOpen(true);
    }

    function openEdit(item: V2Table) {
        setEditingItem(item);
        setFormLabel(item.label);
        setFormZoneId(item.zone_id);
        setFormSeats(item.seats?.toString() ?? "");
        setFormMinSeats(item.min_seats?.toString() ?? "");
        setFormMaxSeats(item.max_seats?.toString() ?? "");
        setFormGroupId(item.combination_group_id);
        setFormPriority(item.assignment_priority?.toString() ?? "0");
        setFormBookableOnline(item.bookable_online ?? true);
        setIsCreatingZone(false);
        setIsCreatingGroup(false);
        setIsDrawerOpen(true);
    }

    function openDelete(item: V2Table) {
        setItemToDelete(item);
        setIsDeleteOpen(true);
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        if (isCreatingZone) {
            showToast({
                message:
                    "Conferma o annulla la creazione zona prima di salvare il tavolo",
                type: "error"
            });
            return;
        }
        if (isCreatingGroup) {
            showToast({
                message:
                    "Conferma o annulla la creazione del gruppo prima di salvare il tavolo",
                type: "error"
            });
            return;
        }
        if (!tenantId || !activityId) return;
        if (!formLabel.trim()) {
            showToast({ message: "Il nome del tavolo è obbligatorio", type: "error" });
            return;
        }

        const trimmedSeats = formSeats.trim();
        let seatsParsed: number | undefined = undefined;
        if (trimmedSeats.length > 0) {
            const n = Number(trimmedSeats);
            if (!Number.isInteger(n) || n <= 0) {
                showToast({
                    message: "I posti devono essere un numero intero positivo",
                    type: "error"
                });
                return;
            }
            seatsParsed = n;
        }

        // Campi prenotazione: validati e inviati SOLO se la sede prenota. Con
        // le prenotazioni spente il form non li mostra, e non vanno scritti —
        // un update con i valori del form azzererebbe quanto configurato prima
        // di disattivarle.
        let reservationFields: {
            min_seats: number | null;
            max_seats: number | null;
            combination_group_id: string | null;
            assignment_priority: number;
            bookable_online: boolean;
        } | null = null;

        if (reservationsEnabled) {
            const parseOptionalCount = (raw: string): number | null | "invalid" => {
                const trimmed = raw.trim();
                if (trimmed.length === 0) return null;
                const n = Number(trimmed);
                return Number.isInteger(n) && n > 0 ? n : "invalid";
            };

            const minParsed = parseOptionalCount(formMinSeats);
            const maxParsed = parseOptionalCount(formMaxSeats);
            if (minParsed === "invalid" || maxParsed === "invalid") {
                showToast({
                    message:
                        "Capienza minima e massima devono essere numeri interi positivi",
                    type: "error"
                });
                return;
            }
            if (minParsed !== null && maxParsed !== null && minParsed > maxParsed) {
                showToast({
                    message: "La capienza minima non può superare la massima",
                    type: "error"
                });
                return;
            }
            if (seatsParsed !== undefined) {
                if (minParsed !== null && seatsParsed < minParsed) {
                    showToast({
                        message: "I posti non possono essere meno della capienza minima",
                        type: "error"
                    });
                    return;
                }
                if (maxParsed !== null && seatsParsed > maxParsed) {
                    showToast({
                        message: "I posti non possono superare la capienza massima",
                        type: "error"
                    });
                    return;
                }
            }

            const priorityParsed = Number(formPriority.trim() || "0");
            if (
                !Number.isInteger(priorityParsed) ||
                priorityParsed < 0 ||
                priorityParsed > 100
            ) {
                showToast({
                    message: "La priorità deve essere un numero intero fra 0 e 100",
                    type: "error"
                });
                return;
            }

            reservationFields = {
                min_seats: minParsed,
                max_seats: maxParsed,
                combination_group_id: formGroupId,
                assignment_priority: priorityParsed,
                bookable_online: formBookableOnline
            };
        }

        setIsSaving(true);
        try {
            if (editingItem) {
                await updateTable(editingItem.id, tenantId, {
                    label: formLabel.trim(),
                    zone_id: formZoneId,
                    seats: seatsParsed ?? null,
                    ...(reservationFields ?? {})
                });
                showToast({ message: "Tavolo aggiornato", type: "success" });
            } else {
                await createTable(tenantId, {
                    activity_id: activityId,
                    label: formLabel.trim(),
                    zone_id: formZoneId,
                    seats: seatsParsed,
                    ...(reservationFields ?? {})
                });
                showToast({ message: "Tavolo creato", type: "success" });
            }
            setIsDrawerOpen(false);
            await loadData();
        } catch (err) {
            if (err instanceof Error && err.message === "TABLE_LABEL_CONFLICT") {
                showToast({
                    message: "Esiste già un tavolo con questo nome in questa sede",
                    type: "error"
                });
            } else {
                showToast({ message: "Errore durante il salvataggio", type: "error" });
            }
        } finally {
            setIsSaving(false);
        }
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
                onClose={() => {
                    setIsDrawerOpen(false);
                    setIsCreatingZone(false);
                }}
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
                                onClick={() => {
                                    setIsDrawerOpen(false);
                                    setIsCreatingZone(false);
                                }}
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
                    <form id="table-form" onSubmit={handleSave} className={styles.form}>
                        <TextInput
                            label="Nome tavolo"
                            required
                            value={formLabel}
                            onChange={e => setFormLabel(e.target.value)}
                            placeholder="es. T1, Tavolo 5, Sala A-3"
                        />
                        <ZoneSelectField
                            // key remount per forzare refresh lista zone post-CRUD drawer.
                            key={`zone-select-${zoneReloadKey}`}
                            tenantId={tenantId}
                            activityId={activityId}
                            value={formZoneId}
                            onChange={setFormZoneId}
                            onModeChange={m => setIsCreatingZone(m === "create")}
                            label="Zona (opzionale)"
                        />
                        <TextInput
                            label="Posti (opzionale)"
                            type="number"
                            min={1}
                            value={formSeats}
                            onChange={e => setFormSeats(e.target.value)}
                            placeholder="2"
                            helperText={
                                reservationsEnabled
                                    ? "Posti apparecchiati di norma. Se lo lasci vuoto la capienza del tavolo resta sconosciuta e le prenotazioni non gli vengono assegnate in automatico."
                                    : "Posti apparecchiati di norma."
                            }
                        />

                        {/* Campi di assegnazione: solo se la sede prende prenotazioni.
                            A chi usa i soli QR non servono e non compaiono. */}
                        {reservationsEnabled && (
                            <>
                                <div className={styles.formSectionTitle}>
                                    <Text variant="body-sm" weight={600}>
                                        Assegnazione prenotazioni
                                    </Text>
                                </div>

                                <TextInput
                                    label="Capienza minima (opzionale)"
                                    type="number"
                                    min={1}
                                    value={formMinSeats}
                                    onChange={e => setFormMinSeats(e.target.value)}
                                    placeholder="2"
                                    helperText="Sotto questo numero il tavolo non viene proposto: evita la coppia al tavolo grande. Vuoto = nessun minimo, va bene qualsiasi gruppo che ci stia."
                                />

                                <TextInput
                                    label="Capienza massima (opzionale)"
                                    type="number"
                                    min={1}
                                    value={formMaxSeats}
                                    onChange={e => setFormMaxSeats(e.target.value)}
                                    placeholder="6"
                                    helperText="Massimo raggiungibile aggiungendo sedie. Vuoto = nessuna sedia in più, il tetto resta il numero di posti."
                                />

                                <CombinationGroupSelectField
                                    tenantId={tenantId}
                                    activityId={activityId}
                                    value={formGroupId}
                                    onChange={setFormGroupId}
                                    onModeChange={m => setIsCreatingGroup(m === "create")}
                                    label="Gruppo di accostamento (opzionale)"
                                />

                                <TextInput
                                    label="Priorità di assegnazione"
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={formPriority}
                                    onChange={e => setFormPriority(e.target.value)}
                                    placeholder="0"
                                    helperText="Da 0 a 100: a parità di condizioni viene scelto prima il tavolo con il numero più alto. Lascia 0 se non hai preferenze — tutti i tavoli restano pari."
                                />

                                <Switch
                                    label="Prenotabile online"
                                    checked={formBookableOnline}
                                    onChange={setFormBookableOnline}
                                    helperText="Attivo per impostazione predefinita. Disattivalo per tenere il tavolo ai clienti che arrivano senza prenotare: resta assegnabile a mano, ma il sistema non lo propone mai."
                                />
                            </>
                        )}
                    </form>
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
