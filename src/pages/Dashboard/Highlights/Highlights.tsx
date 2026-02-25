import React, { useState, useEffect } from "react";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { Button } from "@/components/ui/Button/Button";
import { IconButton } from "@/components/ui/Button/IconButton";
import Text from "@/components/ui/Text/Text";
import { Select } from "@/components/ui/Select/Select";
import FilterBar from "@/components/ui/FilterBar/FilterBar";
import { Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/context/Toast/ToastContext";
import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutFooter,
    ModalLayoutHeader
} from "@/components/ui/ModalLayout/ModalLayout";
import {
    listFeaturedContents,
    deleteFeaturedContent,
    FeaturedContentWithProducts
} from "@/services/supabase/v2/featuredContents";
import FeaturedContentDrawer from "./FeaturedContentDrawer";
import styles from "./Highlights.module.scss";

export default function Highlights() {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(true);
    const [contents, setContents] = useState<FeaturedContentWithProducts[]>([]);

    // Filters and Toolbar
    const [searchQuery, setSearchQuery] = useState("");
    const [typeFilter, setTypeFilter] = useState<string>("all");
    const [densityView, setDensityView] = useState<"list" | "grid">("grid"); // list = compact, grid = extended mapping

    // Drawer state
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editingContent, setEditingContent] = useState<FeaturedContentWithProducts | null>(null);

    // Delete state
    const [deleteTarget, setDeleteTarget] = useState<FeaturedContentWithProducts | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const loadData = async () => {
        try {
            setLoading(true);
            const data = await listFeaturedContents();
            setContents(data);
        } catch (error) {
            console.error(error);
            showToast({
                type: "error",
                message: "Errore durante il caricamento dei contenuti in evidenza",
                duration: 3000
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleCreate = () => {
        setEditingContent(null);
        setDrawerOpen(true);
    };

    const handleEdit = (item: FeaturedContentWithProducts) => {
        setEditingContent(item);
        setDrawerOpen(true);
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;

        try {
            setIsDeleting(true);
            await deleteFeaturedContent(deleteTarget.id);
            setContents(prev => prev.filter(c => c.id !== deleteTarget.id));
            showToast({
                type: "success",
                message: "Contenuto eliminato con successo",
                duration: 2500
            });
        } catch (error) {
            console.error(error);
            showToast({
                type: "error",
                message: "Errore durante l'eliminazione del contenuto",
                duration: 3000
            });
        } finally {
            setIsDeleting(false);
            setDeleteTarget(null);
        }
    };

    const filteredContents = contents.filter(item => {
        const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = typeFilter === "all" || item.type === typeFilter;
        return matchesSearch && matchesType;
    });

    const activeFilters = (
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <Select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                options={[
                    { value: "all", label: "Tutti i tipi" },
                    { value: "informative", label: "Informativo" },
                    { value: "composite", label: "Composito" }
                ]}
            />
        </div>
    );

    return (
        <>
            <div className={styles.wrapper}>
                <PageHeader
                    title="Contenuti in evidenza"
                    subtitle="Gestisci i contenuti informativi e compositi."
                    actions={
                        <Button variant="primary" onClick={handleCreate}>
                            Crea contenuto
                        </Button>
                    }
                />

                <FilterBar
                    search={{
                        value: searchQuery,
                        onChange: setSearchQuery,
                        placeholder: "Cerca per titolo..."
                    }}
                    view={{
                        value: densityView,
                        onChange: setDensityView
                    }}
                    advancedFilters={activeFilters}
                />

                {loading ? (
                    <Text colorVariant="muted">Caricamento in corso...</Text>
                ) : filteredContents.length === 0 ? (
                    <div className={styles.emptyState}>
                        <Text variant="title-sm" weight={600}>
                            Nessun contenuto trovato
                        </Text>
                        <Text colorVariant="muted">
                            Non ci sono contenuti che corrispondono ai filtri.
                        </Text>
                    </div>
                ) : (
                    <ul
                        className={`${styles.list} ${densityView === "list" ? styles.compact : styles.extended}`}
                        role="list"
                    >
                        {filteredContents.map(item => (
                            <li key={item.id} className={styles.listItem}>
                                <div className={styles.cardInfo}>
                                    <Text variant="title-sm" weight={600}>
                                        {item.title}
                                    </Text>
                                    <div className={styles.badges}>
                                        <div className={styles.badge}>
                                            {item.type === "informative"
                                                ? "Informativo"
                                                : "Composito"}
                                        </div>
                                        {!item.is_active && (
                                            <div className={`${styles.badge} ${styles.draft}`}>
                                                Bozza
                                            </div>
                                        )}
                                        {item.type === "composite" && (
                                            <div className={styles.badge}>
                                                {item.products_count || 0} prodotti
                                            </div>
                                        )}
                                    </div>
                                    {densityView === "grid" && item.subtitle && (
                                        <Text variant="caption" colorVariant="muted">
                                            {item.subtitle}
                                        </Text>
                                    )}
                                </div>
                                <div className={styles.actions}>
                                    <IconButton
                                        variant="ghost"
                                        icon={<Pencil size={16} />}
                                        aria-label="Modifica"
                                        onClick={() => handleEdit(item)}
                                    />
                                    <IconButton
                                        variant="ghost"
                                        icon={<Trash2 size={16} />}
                                        aria-label="Elimina"
                                        onClick={() => setDeleteTarget(item)}
                                    />
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <FeaturedContentDrawer
                isOpen={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                editingContent={editingContent}
                onSuccess={() => {
                    setDrawerOpen(false);
                    loadData();
                }}
            />

            <ModalLayout
                isOpen={Boolean(deleteTarget)}
                onClose={() => !isDeleting && setDeleteTarget(null)}
                width="xs"
                height="fit"
            >
                <ModalLayoutHeader>
                    <Text as="h2" variant="title-sm" weight={700}>
                        Elimina contenuto
                    </Text>
                </ModalLayoutHeader>
                <ModalLayoutContent>
                    <Text variant="body">
                        Sei sicuro di voler eliminare <b>{deleteTarget?.title}</b>? Questa azione
                        non può essere annullata.
                    </Text>
                </ModalLayoutContent>
                <ModalLayoutFooter>
                    <Button
                        variant="secondary"
                        onClick={() => setDeleteTarget(null)}
                        disabled={isDeleting}
                    >
                        Annulla
                    </Button>
                    <Button variant="primary" onClick={handleDelete} loading={isDeleting}>
                        Elimina
                    </Button>
                </ModalLayoutFooter>
            </ModalLayout>
        </>
    );
}
