import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Grid2X2, RefreshCw, QrCode, RotateCw, Lock } from "lucide-react";

import { usePageHeader } from "@/context/usePageHeader";
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

import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";

import {
    listTablesWithState,
    createTable,
    updateTable,
    deleteTable,
    generateTableQrsPdf,
    regenerateTableQrToken
} from "@/services/supabase/tables";
import type { V2Table, V2TableWithState } from "@/types/orders";

import { getActivities } from "@/services/supabase/activities";
import type { V2Activity } from "@/types/activity";

import { closeTable } from "@/services/supabase/customerSessions";

import TableDeleteDrawer from "./TableDeleteDrawer";
import TableRegenerateTokenDrawer from "./TableRegenerateTokenDrawer";
import TableCloseDrawer from "./TableCloseDrawer";
import styles from "./Tables.module.scss";

type StatusFilter = "all" | "free" | "occupied" | "maintenance";

const CURRENCY_FORMATTER = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR"
});

export default function Tables() {
    const tenantId = useTenantId();
    const { showToast } = useToast();

    // Activity selection
    const [activities, setActivities] = useState<V2Activity[]>([]);
    const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);

    // Data
    const [items, setItems] = useState<V2TableWithState[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

    // Drawer Create/Edit (inline)
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<V2Table | null>(null);
    const [formLabel, setFormLabel] = useState("");
    const [formZone, setFormZone] = useState("");
    const [formSeats, setFormSeats] = useState<string>("");
    const [formMaintenanceMode, setFormMaintenanceMode] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Delete
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState<V2Table | null>(null);

    // Regenerate token drawer
    const [isRegenOpen, setIsRegenOpen] = useState(false);
    const [itemToRegen, setItemToRegen] = useState<V2Table | null>(null);

    // Close table drawer
    const [isCloseOpen, setIsCloseOpen] = useState(false);
    const [tableToClose, setTableToClose] = useState<V2TableWithState | null>(null);

    // QR generation flags (per disabilitazione bottoni durante async)
    const [isGeneratingQrAll, setIsGeneratingQrAll] = useState(false);
    const [generatingQrTableId, setGeneratingQrTableId] = useState<string | null>(null);

    // ── Activities load (once on mount per tenant) ──
    const loadActivities = useCallback(async () => {
        if (!tenantId) return;
        try {
            const data = await getActivities(tenantId);
            setActivities(data);
            setSelectedActivityId(prev => prev ?? (data.length > 0 ? data[0].id : null));
        } catch {
            showToast({ message: "Impossibile caricare le sedi", type: "error" });
        }
    }, [tenantId, showToast]);

    useEffect(() => {
        loadActivities();
    }, [loadActivities]);

    // ── Tables load (on tenant or activity change) ──
    const loadData = useCallback(async () => {
        if (!tenantId || !selectedActivityId) {
            setItems([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const data = await listTablesWithState(tenantId, selectedActivityId);
            setItems(data);
        } catch {
            showToast({ message: "Impossibile caricare i tavoli", type: "error" });
        } finally {
            setIsLoading(false);
        }
    }, [tenantId, selectedActivityId, showToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // ── Filtering ──
    const filteredItems = useMemo(() => {
        let result = items;
        const q = searchQuery.trim().toLowerCase();
        if (q.length > 0) {
            result = result.filter(
                t =>
                    t.label.toLowerCase().includes(q) ||
                    (t.zone?.toLowerCase() ?? "").includes(q)
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
        setFormZone("");
        setFormSeats("");
        setFormMaintenanceMode(false);
        setIsDrawerOpen(true);
    }

    function openEdit(item: V2Table) {
        setEditingItem(item);
        setFormLabel(item.label);
        setFormZone(item.zone ?? "");
        setFormSeats(item.seats?.toString() ?? "");
        setFormMaintenanceMode(item.maintenance_mode);
        setIsDrawerOpen(true);
    }

    function openDelete(item: V2Table) {
        setItemToDelete(item);
        setIsDeleteOpen(true);
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        if (!tenantId || !selectedActivityId) return;
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
                    zone: formZone.trim() || null,
                    seats: seatsParsed ?? null,
                    maintenance_mode: formMaintenanceMode
                });
                showToast({ message: "Tavolo aggiornato", type: "success" });
            } else {
                await createTable(tenantId, {
                    activity_id: selectedActivityId,
                    label: formLabel.trim(),
                    zone: formZone.trim() || undefined,
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

    // Trigger download del blob PDF lato browser.
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
        if (!selectedActivityId || isGeneratingQrAll) return;
        setIsGeneratingQrAll(true);
        try {
            const blob = await generateTableQrsPdf(selectedActivityId);
            const activity = activities.find(a => a.id === selectedActivityId);
            const filename = `qr-codes-${activity?.slug ?? selectedActivityId}.pdf`;
            downloadPdfBlob(blob, filename);
            showToast({ message: "PDF QR generato", type: "success" });
        } catch (err) {
            const msg =
                err instanceof Error
                    ? err.message
                    : "Errore nella generazione del PDF";
            showToast({ message: msg, type: "error" });
        } finally {
            setIsGeneratingQrAll(false);
        }
    }

    async function handleGenerateQrSingle(table: V2Table) {
        if (!selectedActivityId || generatingQrTableId !== null) return;
        setGeneratingQrTableId(table.id);
        try {
            const blob = await generateTableQrsPdf(selectedActivityId, [table.id]);
            const filename = `qr-${table.label}.pdf`;
            downloadPdfBlob(blob, filename);
            showToast({ message: "PDF QR generato", type: "success" });
        } catch (err) {
            const msg =
                err instanceof Error
                    ? err.message
                    : "Errore nella generazione del PDF";
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
                    {row.zone && (
                        <Text variant="body-sm" colorVariant="muted">
                            {row.zone}
                        </Text>
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
            cell: (_v, row) => (
                <Text variant="body-sm">{row.open_groups_count}</Text>
            )
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
            width: "60px",
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

    const headerActions = useMemo(() => (
        <div className={styles.headerActions}>
            <Button
                variant="secondary"
                leftIcon={<RefreshCw size={16} />}
                onClick={loadData}
                disabled={!selectedActivityId || isLoading}
            >
                Aggiorna
            </Button>
            <Button
                variant="secondary"
                leftIcon={<QrCode size={16} />}
                onClick={handleGenerateQrAll}
                loading={isGeneratingQrAll}
                disabled={!selectedActivityId || items.length === 0}
            >
                Genera QR
            </Button>
            <Button
                variant="primary"
                leftIcon={<Plus size={16} />}
                onClick={openCreate}
                disabled={!selectedActivityId}
            >
                Nuovo tavolo
            </Button>
        </div>
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ), [loadData, selectedActivityId, isLoading, isGeneratingQrAll, items.length]);

    usePageHeader({
        title: "Tavoli",
        subtitle: "Gestisci i tavoli delle tue sedi e monitora lo stato live.",
        actions: headerActions,
        sticky: true,
    });

    return (
        <section className={styles.container}>
            {activities.length > 1 && (
                <div className={styles.activitySelector}>
                    <label htmlFor="activity-select" className={styles.activitySelectorLabel}>
                        Sede:
                    </label>
                    <select
                        id="activity-select"
                        className={styles.activitySelect}
                        value={selectedActivityId ?? ""}
                        onChange={e => setSelectedActivityId(e.target.value || null)}
                    >
                        {activities.map(a => (
                            <option key={a.id} value={a.id}>
                                {a.name}
                            </option>
                        ))}
                    </select>
                </div>
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
                        title={
                            items.length === 0
                                ? "Nessun tavolo"
                                : "Nessun risultato"
                        }
                        description={
                            items.length === 0
                                ? "Crea il primo tavolo per iniziare a ricevere ordinazioni."
                                : hasFiltersActive
                                  ? "Modifica i filtri per vedere altri risultati."
                                  : "Nessun tavolo da mostrare."
                        }
                        action={
                            items.length === 0 && selectedActivityId ? (
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
                        density="compact"
                        isLoading={isLoading}
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
                    <form id="table-form" onSubmit={handleSave} className={styles.form}>
                        <TextInput
                            label="Nome tavolo"
                            required
                            value={formLabel}
                            onChange={e => setFormLabel(e.target.value)}
                            placeholder="es. T1, Tavolo 5, Sala A-3"
                        />
                        <TextInput
                            label="Zona (opzionale)"
                            value={formZone}
                            onChange={e => setFormZone(e.target.value)}
                            placeholder="es. Sala interna, Dehor, Sala A"
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
        </section>
    );
}
