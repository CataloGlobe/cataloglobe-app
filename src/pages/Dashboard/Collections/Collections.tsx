import { useCallback, useEffect, useState } from "react";
import Text from "@/components/ui/Text/Text";
import { Button, Input } from "@/components/ui";
import CatalogManagerModal from "@/components/CatalogManagerModal/CatalogManagerModal";
import {
    listCollections,
    createCollection,
    updateCollection,
    deleteCollection,
    isCollectionDeletable
} from "@/services/supabase/collections";
import type { Collection } from "@/types/database";
import CollectionBuilderModal from "@/components/CollectionBuilderModal/CollectionBuilderModal";
import ConfirmModal from "@/components/ui/ConfirmModal/ConfirmModal";
import { useToast } from "@/context/Toast/ToastContext";
import { businessTypeToCatalogType } from "@/domain/catalog/businessToCatalog";
import { Pencil, Trash2 } from "lucide-react";
import styles from "./Collections.module.scss";

export default function Collections() {
    const { showToast } = useToast();
    const [collections, setCollections] = useState<Collection[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
    const [catalogOpen, setCatalogOpen] = useState(false);

    const [modalOpen, setModalOpen] = useState(false);
    const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Collection | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const [name, setName] = useState("");
    const [description, setDescription] = useState("");

    const loadCollections = useCallback(async () => {
        try {
            setLoading(true);
            const data = await listCollections();
            setCollections(data);
        } finally {
            setLoading(false);
        }
    }, []);

    const catalogType = businessTypeToCatalogType(null);

    useEffect(() => {
        loadCollections();
    }, [loadCollections]);

    const openCreateModal = () => {
        setEditingCollection(null);
        setName("");
        setDescription("");
        setModalOpen(true);
    };

    const openEditModal = (collection: Collection) => {
        setEditingCollection(collection);
        setName(collection.name);
        setDescription(collection.description ?? "");
        setModalOpen(true);
    };

    const handleConfirm = async () => {
        if (!name.trim()) return;

        if (editingCollection) {
            const updated = await updateCollection(editingCollection.id, {
                name: name.trim(),
                description: description.trim() || undefined
            });

            setCollections(prev => prev.map(c => (c.id === updated.id ? updated : c)));
        } else {
            const created = await createCollection({
                name: name.trim(),
                description: description.trim() || undefined
            });

            setCollections(prev => [...prev, created]);
            setActiveCollectionId(created.id);
        }

        setModalOpen(false);
    };

    const handleDeleteCollection = async () => {
        if (!deleteTarget) return;

        try {
            await deleteCollection(deleteTarget.id);

            setCollections(prev => prev.filter(c => c.id !== deleteTarget.id));

            if (activeCollectionId === deleteTarget.id) {
                setActiveCollectionId(null);
            }

            showToast({
                type: "success",
                message: "Collezione eliminata con successo",
                duration: 2500
            });
        } catch (error) {
            console.error(error);
            showToast({
                type: "error",
                message: "Errore durante l’eliminazione della collezione",
                duration: 3000
            });
        } finally {
            setDeleteTarget(null);
        }
    };

    return (
        <>
            <div className={styles.wrapper}>
                <header className={styles.header}>
                    <div className={styles.headerText}>
                        <Text variant="body" colorVariant="muted">
                            Gestisci i tuo cataloghi (listini prezzi, menu, etc...)
                        </Text>
                    </div>

                    <div className={styles.headerActions}>
                        <Button label="Crea catalogo" onClick={openCreateModal} />

                        <Button
                            label="I tuoi prodotti"
                            variant="secondary"
                            onClick={() => setCatalogOpen(true)}
                        />
                    </div>
                </header>

                {loading && <Text colorVariant="muted">Caricamento…</Text>}

                {!loading && collections.length === 0 && (
                    <div className={styles.emptyState}>
                        <Text variant="title-sm" weight={600}>
                            Nessuna collezione
                        </Text>
                        <Text colorVariant="muted">
                            Crea la tua prima collezione per iniziare a costruire il menu.
                        </Text>
                    </div>
                )}

                <ul className={styles.list} role="list">
                    {collections.map(col => (
                        <li key={col.id} role="listitem">
                            <div
                                className={styles.card}
                                onClick={() => setActiveCollectionId(col.id)}
                            >
                                <div className={styles.preview}>
                                    <div className={styles.previewHeader} />
                                    <div className={styles.previewItem} />
                                    <div className={styles.previewItem} />
                                </div>

                                <div className={styles.cardHeader}>
                                    <Text variant="title-sm" weight={600}>
                                        {col.name}
                                    </Text>

                                    <button
                                        className={styles.moreBtn}
                                        aria-label="Rinomina collezione"
                                        onClick={e => {
                                            e.stopPropagation();
                                            openEditModal(col);
                                        }}
                                    >
                                        <Pencil size={16} />
                                    </button>

                                    <button
                                        className={styles.moreBtn}
                                        aria-label="Elimina collezione"
                                        onClick={async e => {
                                            e.stopPropagation();

                                            try {
                                                const canDelete = await isCollectionDeletable(
                                                    col.id
                                                );

                                                if (!canDelete) {
                                                    setDeleteError(
                                                        "Questa collezione è utilizzata in uno o più menu attivi. Disattiva prima i menu per poterla eliminare."
                                                    );
                                                    return;
                                                }

                                                setDeleteTarget(col);
                                            } catch {
                                                setDeleteError(
                                                    "Errore nel controllo dell’eliminazione."
                                                );
                                            }
                                        }}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>

                                {col.description && (
                                    <Text variant="body" colorVariant="muted">
                                        {col.description}
                                    </Text>
                                )}

                                <Text variant="caption" colorVariant="muted">
                                    Creata il{" "}
                                    {new Date(col.created_at).toLocaleDateString("it-IT", {
                                        day: "2-digit",
                                        month: "long",
                                        year: "numeric"
                                    })}
                                </Text>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>

            <CollectionBuilderModal
                isOpen={Boolean(activeCollectionId)}
                collectionId={activeCollectionId}
                onClose={() => setActiveCollectionId(null)}
            />

            <CatalogManagerModal
                isOpen={catalogOpen}
                onClose={() => setCatalogOpen(false)}
                catalogType={catalogType}
            />

            <ConfirmModal
                isOpen={modalOpen}
                title={editingCollection ? "Modifica collezione" : "Crea nuova collezione"}
                description={
                    editingCollection
                        ? "Modifica i dettagli della collezione."
                        : "Inserisci un nome e una descrizione."
                }
                confirmLabel={editingCollection ? "Salva" : "Crea"}
                cancelLabel="Annulla"
                onConfirm={handleConfirm}
                onCancel={() => setModalOpen(false)}
            >
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "1rem",
                        marginBottom: "1rem"
                    }}
                >
                    <Input
                        label="Nome collezione"
                        value={name}
                        onChange={e => setName(e.target.value)}
                    />

                    <Input
                        label="Descrizione"
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                    />
                </div>
            </ConfirmModal>

            <ConfirmModal
                isOpen={Boolean(deleteTarget)}
                title="Elimina collezione"
                description={`Sei sicuro di voler eliminare "${deleteTarget?.name}"? Questa azione è irreversibile.`}
                confirmLabel="Elimina"
                cancelLabel="Annulla"
                onConfirm={handleDeleteCollection}
                onCancel={() => setDeleteTarget(null)}
            />

            <ConfirmModal
                isOpen={Boolean(deleteError)}
                title="Impossibile eliminare"
                description={deleteError ?? ""}
                confirmLabel="Ok"
                onConfirm={() => setDeleteError(null)}
            />
        </>
    );
}
