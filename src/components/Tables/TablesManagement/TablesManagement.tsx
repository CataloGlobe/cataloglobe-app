import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Grid2X2, Layers, Lock, Plus, QrCode, RefreshCw, RotateCw } from "lucide-react";

import FilterBar from "@/components/ui/FilterBar/FilterBar";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { TextInput } from "@/components/ui/Input/TextInput";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";

import { usePageHeader } from "@/context/usePageHeader";
import { useToast } from "@/context/Toast/ToastContext";

import {
    createTable,
    deleteTable,
    generateTableQrsPdf,
    listTablesWithState,
    regenerateTableQrToken,
    updateTable
} from "@/services/supabase/tables";
import { closeTable } from "@/services/supabase/customerSessions";
import type { V2Table, V2TableWithState } from "@/types/orders";

import { ZoneSelectField } from "@/components/Tables/ZoneSelectField/ZoneSelectField";
import { TableZoneManagementDrawer } from "@/components/Tables/TableZoneManagementDrawer/TableZoneManagementDrawer";

import BillRequestsDrawer from "@/pages/Dashboard/Tables/BillRequestsDrawer";
import TableDeleteDrawer from "@/pages/Dashboard/Tables/TableDeleteDrawer";
import TableRegenerateTokenDrawer from "@/pages/Dashboard/Tables/TableRegenerateTokenDrawer";
import TableCloseDrawer from "@/pages/Dashboard/Tables/TableCloseDrawer";

import styles from "./TablesManagement.module.scss";

type StatusFilter = "all" | "free" | "occupied" | "maintenance";

const CURRENCY_FORMATTER = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR"
});

export interface TablesManagementProps {
    tenantId: string;
    activityId: string;
    /** Se false: bottoni create/edit disabilitati con tooltip prerequisito. */
    orderingEnabled: boolean;
    /** "page" = include header `usePageHeader` con titolo "Tavoli".
     *  "embedded" = no header, il parent (tab) fornisce il titolo. */
    mode: "page" | "embedded";
}

export function TablesManagement({
    tenantId,
    activityId,
    orderingEnabled,
    mode
}: TablesManagementProps) {
    const { showToast } = useToast();

    // Data
    const [items, setItems] = useState<V2TableWithState[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

    // Drawer Create/Edit
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<V2Table | null>(null);
    const [formLabel, setFormLabel] = useState("");
    const [formZoneId, setFormZoneId] = useState<string | null>(null);
    const [formSeats, setFormSeats] = useState<string>("");
    const [formMaintenanceMode, setFormMaintenanceMode] = useState(false);
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

    // Close table drawer
    const [isCloseOpen, setIsCloseOpen] = useState(false);
    const [tableToClose, setTableToClose] = useState<V2TableWithState | null>(null);
    const [billDrawerTable, setBillDrawerTable] = useState<{ id: string; label: string } | null>(null);

    // Zone management drawer
    const [isZoneDrawerOpen, setIsZoneDrawerOpen] = useState(false);
    // Bumped quando zone cambiano fuori dal dropdown → forza reload del select via key remount.
    const [zoneReloadKey, setZoneReloadKey] = useState(0);

    // QR generation flags
    const [isGeneratingQrAll, setIsGeneratingQrAll] = useState(false);
    const [generatingQrTableId, setGeneratingQrTableId] = useState<string | null>(null);

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
        if (statusFilter !== "all") {
            result = result.filter(t => {
                if (statusFilter === "maintenance") return t.maintenance_mode;
                if (statusFilter === "occupied")
                    return t.active_sessions_count > 0 && !t.maintenance_mode;
                if (statusFilter === "free")
                    return t.active_sessions_count === 0 && !t.maintenance_mode;
                return true;
            });
        }
        return result;
    }, [items, searchQuery, statusFilter]);

    // ── Handlers ──
    function openCreate() {
        setEditingItem(null);
        setFormLabel("");
        setFormZoneId(null);
        setFormSeats("");
        setFormMaintenanceMode(false);
        setIsCreatingZone(false);
        setIsDrawerOpen(true);
    }

    function openEdit(item: V2Table) {
        setEditingItem(item);
        setFormLabel(item.label);
        setFormZoneId(item.zone_id);
        setFormSeats(item.seats?.toString() ?? "");
        setFormMaintenanceMode(item.maintenance_mode);
        setIsCreatingZone(false);
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

        setIsSaving(true);
        try {
            if (editingItem) {
                await updateTable(editingItem.id, tenantId, {
                    label: formLabel.trim(),
                    zone_id: formZoneId,
                    seats: seatsParsed ?? null,
                    maintenance_mode: formMaintenanceMode
                });
                showToast({ message: "Tavolo aggiornato", type: "success" });
            } else {
                await createTable(tenantId, {
                    activity_id: activityId,
                    label: formLabel.trim(),
                    zone_id: formZoneId,
                    seats: seatsParsed,
                    maintenance_mode: formMaintenanceMode
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

    async function handleRegenerate() {
        if (!itemToRegen || !tenantId) return;
        try {
            await regenerateTableQrToken(itemToRegen.id, tenantId);
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

    function openClose(item: V2TableWithState) {
        setTableToClose(item);
        setIsCloseOpen(true);
    }

    async function handleCloseConfirm() {
        if (!tableToClose) return;
        try {
            const result = await closeTable(tableToClose.id);
            const msg =
                result.closed_groups_count === 0
                    ? "Nessun conto aperto da chiudere"
                    : `Tavolo chiuso (${result.closed_groups_count} ${result.closed_groups_count === 1 ? "conto" : "conti"}, ${result.closed_orders_count} ${result.closed_orders_count === 1 ? "ordine" : "ordini"})`;
            showToast({ message: msg, type: "success" });
            setIsCloseOpen(false);
            setTableToClose(null);
            await loadData();
        } catch (err) {
            if (err instanceof Error && err.message === "TABLE_HAS_OPEN_ORDERS") {
                showToast({
                    message:
                        "Il tavolo ha ordini non ancora consegnati. Completa o cancella quegli ordini prima di chiudere il tavolo.",
                    type: "error"
                });
                setIsCloseOpen(false);
                setTableToClose(null);
                await loadData();
                return;
            }
            showToast({
                message: "Errore durante la chiusura del tavolo",
                type: "error"
            });
        }
    }

    // ── Columns ──
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
                    {row.zone_name && (
                        <Text variant="body-sm" colorVariant="muted">
                            {row.zone_name}
                        </Text>
                    )}
                    {row.bill_requested_count > 0 && (
                        <button
                            type="button"
                            className={styles.billBadge}
                            onClick={e => {
                                e.stopPropagation();
                                setBillDrawerTable({ id: row.id, label: row.label });
                            }}
                            aria-label={`${row.bill_requested_count} richieste conto`}
                        >
                            <Bell size={12} />
                            <span>Conto richiesto</span>
                            {row.bill_requested_count > 1 && (
                                <span className={styles.billBadgeCount}>
                                    {row.bill_requested_count}
                                </span>
                            )}
                        </button>
                    )}
                </div>
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
        {
            id: "status",
            header: "Stato",
            width: "140px",
            accessor: row => {
                if (row.maintenance_mode) return "maintenance";
                if (row.active_sessions_count > 0) return "occupied";
                return "free";
            },
            cell: (_v, row) => {
                if (row.maintenance_mode) {
                    return <StatusBadge variant="warning" label="Manutenzione" />;
                }
                if (row.active_sessions_count > 0) {
                    return <StatusBadge variant="success" label="Occupato" />;
                }
                return <StatusBadge variant="neutral" label="Libero" />;
            }
        },
        {
            id: "sessions",
            header: "Sessioni",
            width: "100px",
            accessor: row => row.active_sessions_count,
            cell: (_v, row) => (
                <Text variant="body-sm">{row.active_sessions_count}</Text>
            )
        },
        {
            id: "open_groups",
            header: "Conti",
            width: "120px",
            accessor: row => row.open_groups_count,
            cell: (_v, row) => <Text variant="body-sm">{row.open_groups_count}</Text>
        },
        {
            id: "current_total",
            header: "Totale",
            width: "140px",
            align: "right",
            accessor: row => row.current_total,
            cell: (_v, row) => (
                <Text variant="body-sm" weight={row.current_total > 0 ? 600 : 400}>
                    {row.current_total > 0
                        ? CURRENCY_FORMATTER.format(row.current_total)
                        : "—"}
                </Text>
            )
        },
        {
            id: "actions",
            header: "",
            width: "56px",
            align: "right",
            cell: (_v, row) => (
                <TableRowActions
                    actions={[
                        { label: "Modifica", onClick: () => openEdit(row) },
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
                        },
                        {
                            label: "Chiudi tavolo",
                            icon: Lock,
                            onClick: () => openClose(row)
                        },
                        {
                            label: "Elimina",
                            variant: "destructive",
                            onClick: () => openDelete(row),
                            separator: true
                        }
                    ]}
                />
            )
        }
    ];

    const hasFiltersActive = searchQuery.trim().length > 0 || statusFilter !== "all";

    const headerActions = useMemo(
        () => (
            <div className={styles.headerActions}>
                <Button
                    variant="secondary"
                    leftIcon={<RefreshCw size={16} />}
                    onClick={loadData}
                    disabled={!activityId || isLoading}
                >
                    Aggiorna
                </Button>
                <Button
                    variant="secondary"
                    leftIcon={<Layers size={16} />}
                    onClick={() => setIsZoneDrawerOpen(true)}
                    disabled={!activityId}
                >
                    Gestisci zone
                </Button>
                <Button
                    variant="secondary"
                    leftIcon={<QrCode size={16} />}
                    onClick={handleGenerateQrAll}
                    loading={isGeneratingQrAll}
                    disabled={!activityId || items.length === 0}
                >
                    Genera QR
                </Button>
                <Button
                    variant="primary"
                    leftIcon={<Plus size={16} />}
                    onClick={openCreate}
                    disabled={!activityId || !orderingEnabled}
                >
                    Nuovo tavolo
                </Button>
            </div>
        ),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [loadData, activityId, isLoading, isGeneratingQrAll, items.length, orderingEnabled]
    );

    // usePageHeader accetta null per "non registrare nessun header".
    // Mode "page": titolo + sticky in cima alla pagina standalone /tables.
    // Mode "embedded": titolo viene dalla tab padre (ActivityDetailPage), niente registrazione.
    usePageHeader(
        mode === "page"
            ? {
                  title: "Tavoli",
                  subtitle: "Gestisci i tavoli delle tue sedi e monitora lo stato live.",
                  actions: headerActions,
                  sticky: true
              }
            : null
    );

    return (
        <section className={styles.container}>
            {mode === "embedded" && (
                <div className={styles.embeddedHeader}>{headerActions}</div>
            )}

            <div className={styles.content}>
                <FilterBar
                    search={{
                        value: searchQuery,
                        onChange: setSearchQuery,
                        placeholder: "Cerca per nome o zona..."
                    }}
                />

                <div className={styles.statusFilter} role="tablist">
                    {(
                        [
                            { value: "all", label: "Tutti" },
                            { value: "free", label: "Liberi" },
                            { value: "occupied", label: "Occupati" },
                            { value: "maintenance", label: "Manutenzione" }
                        ] as Array<{ value: StatusFilter; label: string }>
                    ).map(opt => (
                        <button
                            key={opt.value}
                            type="button"
                            role="tab"
                            aria-selected={statusFilter === opt.value}
                            className={
                                statusFilter === opt.value
                                    ? styles.statusButtonActive
                                    : styles.statusButton
                            }
                            onClick={() => setStatusFilter(opt.value)}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                {!isLoading && filteredItems.length === 0 ? (
                    <EmptyState
                        icon={<Grid2X2 size={40} strokeWidth={1.5} />}
                        title={items.length === 0 ? "Nessun tavolo" : "Nessun risultato"}
                        description={
                            items.length === 0
                                ? "Crea il primo tavolo per iniziare a ricevere ordinazioni."
                                : hasFiltersActive
                                  ? "Modifica i filtri per vedere altri risultati."
                                  : "Nessun tavolo da mostrare."
                        }
                        action={
                            items.length === 0 && activityId && orderingEnabled ? (
                                <Button variant="primary" onClick={openCreate}>
                                    Nuovo tavolo
                                </Button>
                            ) : undefined
                        }
                    />
                ) : (
                    <DataTable<V2TableWithState>
                        data={filteredItems}
                        columns={columns}
                        isLoading={isLoading}
                        selectable
                        selectedRowIds={selectedTableIds}
                        onSelectedRowsChange={setSelectedTableIds}
                        onBulkDelete={handleBulkDelete}
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
                        />
                        <label className={styles.toggleRow}>
                            <input
                                type="checkbox"
                                checked={formMaintenanceMode}
                                onChange={e => setFormMaintenanceMode(e.target.checked)}
                            />
                            <span className={styles.toggleCopy}>
                                <Text weight={500}>Manutenzione</Text>
                                <Text variant="body-sm" colorVariant="muted">
                                    I clienti non possono ordinare da questo tavolo finché
                                    disattivi questa opzione.
                                </Text>
                            </span>
                        </label>
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

            <TableCloseDrawer
                open={isCloseOpen}
                table={tableToClose}
                onClose={() => {
                    setIsCloseOpen(false);
                    setTableToClose(null);
                }}
                onConfirm={handleCloseConfirm}
            />

            <BillRequestsDrawer
                isOpen={billDrawerTable !== null}
                onClose={() => setBillDrawerTable(null)}
                tableId={billDrawerTable?.id ?? null}
                tableLabel={billDrawerTable?.label ?? ""}
                onSuccess={loadData}
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
