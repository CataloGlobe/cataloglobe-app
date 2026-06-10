import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Grid2X2, Layers, MoreHorizontal, Plus, QrCode, RotateCw } from "lucide-react";
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
import { TableZoneManagementDrawer } from "@/components/Tables/TableZoneManagementDrawer/TableZoneManagementDrawer";

import BillRequestsDrawer from "@/pages/Dashboard/Tables/BillRequestsDrawer";
import TableDeleteDrawer from "@/pages/Dashboard/Tables/TableDeleteDrawer";
import TableRegenerateTokenDrawer from "@/pages/Dashboard/Tables/TableRegenerateTokenDrawer";
import TableQrPreviewDrawer from "@/pages/Dashboard/Tables/TableQrPreviewDrawer";

import styles from "./TablesManagement.module.scss";

export interface TablesManagementProps {
    tenantId: string;
    activityId: string;
    /** Se false: bottoni create/edit disabilitati con tooltip prerequisito. */
    orderingEnabled: boolean;
}

export function TablesManagement({
    tenantId,
    activityId,
    orderingEnabled
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

    const [billDrawerTable, setBillDrawerTable] = useState<{ id: string; label: string } | null>(null);

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

    // ── Handlers ──
    function openCreate() {
        setEditingItem(null);
        setFormLabel("");
        setFormZoneId(null);
        setFormSeats("");
        setIsCreatingZone(false);
        setIsDrawerOpen(true);
    }

    function openEdit(item: V2Table) {
        setEditingItem(item);
        setFormLabel(item.label);
        setFormZoneId(item.zone_id);
        setFormSeats(item.seats?.toString() ?? "");
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
                    seats: seatsParsed ?? null
                });
                showToast({ message: "Tavolo aggiornato", type: "success" });
            } else {
                await createTable(tenantId, {
                    activity_id: activityId,
                    label: formLabel.trim(),
                    zone_id: formZoneId,
                    seats: seatsParsed
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
                    {row.bill_requested_count > 0 && canManage && (
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
        {
            id: "actions",
            header: "",
            width: "104px",
            align: "right",
            cell: (_v, row) => (
                <div className={styles.actionsCell}>
                    <Tooltip content="Anteprima QR">
                        <IconButton
                            icon={<QrCode size={16} />}
                            aria-label="Anteprima QR"
                            variant="ghost"
                            onClick={() => openQrPreview(row)}
                        />
                    </Tooltip>
                    {canManage && (
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
                                    label: "Elimina",
                                    variant: "destructive",
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
                                        <DropdownMenu.Item
                                            className={styles.dropdownItem}
                                            onSelect={() => void handleGenerateQrAll()}
                                            disabled={!activityId || items.length === 0 || isGeneratingQrAll || !canEdit}
                                        >
                                            <QrCode size={14} />
                                            <span>{isGeneratingQrAll ? "Generazione..." : "Genera QR"}</span>
                                        </DropdownMenu.Item>
                                    </DropdownMenu.Content>
                                </DropdownMenu.Portal>
                            </DropdownMenu.Root>
                        )}
                        {canManage && (
                            <Button
                                variant="primary"
                                leftIcon={<Plus size={16} />}
                                onClick={openCreate}
                                disabled={!activityId || !orderingEnabled || !canEdit}
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
                                ? "Crea il primo tavolo per iniziare a ricevere ordinazioni."
                                : hasFiltersActive
                                  ? "Modifica i filtri per vedere altri risultati."
                                  : "Nessun tavolo da mostrare."
                        }
                        action={
                            items.length === 0 && activityId && orderingEnabled && canManage ? (
                                <Button variant="primary" onClick={openCreate} disabled={!canEdit}>
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
                        />
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
