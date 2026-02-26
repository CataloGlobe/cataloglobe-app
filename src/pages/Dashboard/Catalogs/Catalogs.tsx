import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/context/Toast/ToastContext";
import FilterBar from "@/components/ui/FilterBar/FilterBar";
import { Card } from "@/components/ui/Card/Card";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { IconBook2, IconPlus, IconDotsVertical } from "@tabler/icons-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
    listCatalogs,
    createCatalog,
    updateCatalog,
    deleteCatalog,
    V2Catalog
} from "@/services/supabase/v2/catalogs";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { TextInput } from "@/components/ui/Input/TextInput";
import styles from "./Catalogs.module.scss";

export default function Catalogs() {
    const { user } = useAuth();
    const currentTenantId = user?.id;
    const { showToast } = useToast();
    const navigate = useNavigate();

    const [catalogs, setCatalogs] = useState<V2Catalog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [density, setDensity] = useState<"compact" | "extended">("compact");

    // Drawer state
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [editingCatalog, setEditingCatalog] = useState<V2Catalog | null>(null);
    const [name, setName] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    // Delete confirmation state
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [catalogToDelete, setCatalogToDelete] = useState<V2Catalog | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const loadData = useCallback(async () => {
        if (!currentTenantId) return;
        setIsLoading(true);
        try {
            const data = await listCatalogs(currentTenantId);
            setCatalogs(data);
        } catch (error) {
            console.error("Errore caricamento cataloghi:", error);
            showToast({ message: "Impossibile caricare i cataloghi.", type: "error" });
        } finally {
            setIsLoading(false);
        }
    }, [currentTenantId, showToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleOpenCreate = () => {
        setEditingCatalog(null);
        setName("");
        setIsDrawerOpen(true);
    };

    const handleOpenEdit = (catalog: V2Catalog) => {
        setEditingCatalog(catalog);
        setName(catalog.name);
        setIsDrawerOpen(true);
    };

    const handleOpenDelete = (catalog: V2Catalog) => {
        setCatalogToDelete(catalog);
        setIsDeleteOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentTenantId) return;
        if (!name.trim()) {
            showToast({ message: "Il nome è obbligatorio", type: "error" });
            return;
        }

        setIsSaving(true);
        try {
            if (editingCatalog) {
                await updateCatalog(editingCatalog.id, currentTenantId, { name });
                showToast({ message: "Catalogo aggiornato con successo.", type: "success" });
            } else {
                await createCatalog(currentTenantId, name);
                showToast({ message: "Catalogo creato con successo.", type: "success" });
            }
            setIsDrawerOpen(false);
            loadData();
        } catch (error) {
            console.error("Errore salvataggio catalogo:", error);
            showToast({ message: "Errore durante il salvataggio.", type: "error" });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!currentTenantId || !catalogToDelete) return;

        setIsDeleting(true);
        try {
            await deleteCatalog(catalogToDelete.id, currentTenantId);
            showToast({ message: "Catalogo eliminato con successo.", type: "success" });
            setIsDeleteOpen(false);
            setCatalogToDelete(null);
            loadData();
        } catch (error) {
            console.error("Errore eliminazione catalogo:", error);
            showToast({ message: "Errore durante l'eliminazione.", type: "error" });
        } finally {
            setIsDeleting(false);
        }
    };

    const filteredCatalogs = useMemo(() => {
        const normalizedSearch = searchQuery.trim().toLowerCase();
        if (!normalizedSearch) return catalogs;

        return catalogs.filter(catalog => catalog.name.toLowerCase().includes(normalizedSearch));
    }, [catalogs, searchQuery]);

    const columns: ColumnDefinition<V2Catalog>[] = [
            {
                id: "name",
                header: "Nome",
                width: "2fr",
                accessor: catalog => catalog.name,
                cell: (_value, catalog) => (
                    <div className={styles.colName}>
                        <div className={styles.catalogNameRow}>
                            <div className={styles.iconWrapper}>
                                <IconBook2 size={18} />
                            </div>
                            <Text variant="body-sm" weight={600}>
                                {catalog.name}
                            </Text>
                        </div>
                    </div>
                )
            },
            {
                id: "createdAt",
                header: "Creato il",
                width: "1fr",
                accessor: catalog => catalog.created_at,
                cell: value => {
                    const dateValue = typeof value === "string" ? new Date(value) : null;
                    const formattedDate =
                        dateValue && !Number.isNaN(dateValue.getTime())
                            ? new Intl.DateTimeFormat("it-IT", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric"
                              }).format(dateValue)
                            : "—";

                    return (
                        <Text variant="body-sm" colorVariant="muted">
                            {formattedDate}
                        </Text>
                    );
                }
            },
            {
                id: "actions",
                header: "",
                width: "60px",
                align: "right",
                cell: (_value, catalog) => (
                    <div className={styles.catalogActions}>
                        <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                                <button className={styles.actionButton} aria-label="Azioni">
                                    <IconDotsVertical size={18} />
                                </button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                                <DropdownMenu.Content
                                    className={styles.dropdownContent}
                                    align="end"
                                    sideOffset={4}
                                >
                                    <DropdownMenu.Item
                                        className={styles.dropdownItem}
                                        onClick={() => handleOpenEdit(catalog)}
                                    >
                                        Modifica nome
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Separator className={styles.dropdownSeparator} />
                                    <DropdownMenu.Item
                                        className={`${styles.dropdownItem} ${styles.danger}`}
                                        onClick={() => handleOpenDelete(catalog)}
                                    >
                                        Elimina catalogo
                                    </DropdownMenu.Item>
                                </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                    </div>
                )
            }
        ];

    const loadingState = (
        <div className={styles.loadingState}>
            <Text variant="body-sm" colorVariant="muted">
                Caricamento in corso...
            </Text>
        </div>
    );

    const hasSearchFilter = searchQuery.trim().length > 0;

    const emptyState = (
        <div className={styles.emptyState}>
            <IconBook2 size={48} stroke={1} className={styles.emptyIcon} />
            <Text variant="title-sm" weight={600}>
                Nessun catalogo trovato
            </Text>
            <Text variant="body-sm" colorVariant="muted">
                {hasSearchFilter
                    ? "Non ci sono cataloghi che corrispondono alla ricerca."
                    : "Non hai ancora creato alcun catalogo per organizzare i tuoi prodotti."}
            </Text>
            {!hasSearchFilter && (
                <Button variant="primary" onClick={handleOpenCreate} className={styles.emptyButton}>
                    Crea il primo catalogo
                </Button>
            )}
        </div>
    );

    return (
        <section className={styles.container}>
            <PageHeader
                title="Cataloghi"
                subtitle="Gestisci l'albero delle categorie e i gruppi del tuo menu."
                actions={
                    <Button variant="primary" onClick={handleOpenCreate}>
                        <IconPlus size={20} />
                        Crea catalogo
                    </Button>
                }
            />

            <div className={styles.content}>
                <FilterBar
                    search={{
                        value: searchQuery,
                        onChange: setSearchQuery,
                        placeholder: "Cerca cataloghi..."
                    }}
                    view={{
                        value: density === "compact" ? "list" : "grid",
                        onChange: value => setDensity(value === "list" ? "compact" : "extended")
                    }}
                    className={styles.filterBar}
                />

                <Card className={styles.tableCard}>
                    <DataTable<V2Catalog>
                        data={filteredCatalogs}
                        columns={columns}
                        isLoading={isLoading}
                        density={density}
                        onRowClick={catalog => navigate(`/dashboard/cataloghi/${catalog.id}`)}
                        loadingState={loadingState}
                        emptyState={emptyState}
                    />
                </Card>
            </div>

            {/* Create/Edit Drawer */}
            <SystemDrawer open={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} width={400}>
                <DrawerLayout
                    header={
                        <div>
                            <Text variant="title-sm" weight={600}>
                                {editingCatalog ? "Modifica Catalogo" : "Nuovo Catalogo"}
                            </Text>
                        </div>
                    }
                    footer={
                        <div className={styles.drawerFooterContainer}>
                            <div className={styles.drawerFooter}>
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
                                    form="catalog-form"
                                    loading={isSaving}
                                >
                                    {editingCatalog ? "Salva Modifiche" : "Crea Catalogo"}
                                </Button>
                            </div>
                        </div>
                    }
                >
                    <form id="catalog-form" onSubmit={handleSave} className={styles.form}>
                        <TextInput
                            label="Nome del Catalogo"
                            required
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Es: Menu Cena, Asporto, Cantina dei Vini..."
                        />
                    </form>
                </DrawerLayout>
            </SystemDrawer>

            {/* Delete Drawer */}
            <SystemDrawer open={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} width={400}>
                <DrawerLayout
                    header={
                        <div>
                            <Text variant="title-sm" weight={600}>
                                Elimina Catalogo
                            </Text>
                        </div>
                    }
                    footer={
                        <div className={styles.drawerFooterContainer}>
                            <div className={styles.drawerFooter}>
                                <Button
                                    variant="secondary"
                                    onClick={() => setIsDeleteOpen(false)}
                                    disabled={isDeleting}
                                >
                                    Annulla
                                </Button>
                                <Button
                                    variant="primary"
                                    style={{
                                        backgroundColor: "var(--color-red-600)",
                                        borderColor: "var(--color-red-600)"
                                    }}
                                    onClick={handleDelete}
                                    loading={isDeleting}
                                >
                                    Elimina
                                </Button>
                            </div>
                        </div>
                    }
                >
                    <div className={styles.deleteWarning}>
                        <Text variant="body-sm">
                            Sei sicuro di voler eliminare il catalogo "
                            <strong>{catalogToDelete?.name}</strong>"?
                        </Text>
                        <Text variant="body-sm" colorVariant="muted" style={{ marginTop: 8 }}>
                            Tutta la struttura di categorie e i collegamenti ai prodotti verranno
                            eliminati in modo irreversibile. I prodotti originali non verranno
                            cancellati dal tuo database.
                        </Text>
                    </div>
                </DrawerLayout>
            </SystemDrawer>
        </section>
    );
}
