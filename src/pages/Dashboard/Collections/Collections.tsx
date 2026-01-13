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
import type { BusinessType, Collection } from "@/types/database";
import CollectionBuilderModal from "@/components/CollectionBuilderModal/CollectionBuilderModal";
import ConfirmModal from "@/components/ui/ConfirmModal/ConfirmModal";
import { useToast } from "@/context/Toast/ToastContext";
import { businessTypeToCatalogType } from "@/domain/catalog/businessToCatalog";
import { Pencil, Star, Trash2 } from "lucide-react";
import styles from "./Collections.module.scss";
import { CatalogType } from "@/types/catalog";
import { Select } from "@/components/ui/Select/Select";
import { CATALOG_TYPE_LABELS } from "@/domain/catalog/catalogTypeLabels";
import { getUserBusinesses } from "@/services/supabase/businesses";
import { getAllowedCatalogTypesForBusinesses } from "@/domain/catalog/catalogTypeRules";
import { useAuth } from "@/context/useAuth";

const ALL_CATALOG_TYPE_OPTIONS = (Object.keys(CATALOG_TYPE_LABELS) as CatalogType[]).map(value => ({
    value,
    label: CATALOG_TYPE_LABELS[value]
}));

export default function Collections() {
    const { user } = useAuth();
    const userId = user?.id;
    const { showToast } = useToast();
    const [collections, setCollections] = useState<Collection[]>([]);
    const [userBusinessTypes, setUserBusinessTypes] = useState<BusinessType[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
    const [catalogOpen, setCatalogOpen] = useState(false);

    const [modalOpen, setModalOpen] = useState(false);
    const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Collection | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [kind, setKind] = useState<"standard" | "special">("standard");
    const [collectionType, setCollectionType] = useState<CatalogType>("menu");

    const allowedCatalogTypes = getAllowedCatalogTypesForBusinesses(userBusinessTypes);

    const catalogTypeOptions = ALL_CATALOG_TYPE_OPTIONS.filter(opt =>
        allowedCatalogTypes.includes(opt.value as CatalogType)
    );

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

    useEffect(() => {
        if (!userId) return;

        const id = userId; // <- ora è sicuramente string per TS

        async function loadBusinesses() {
            try {
                const businesses = await getUserBusinesses(id);
                setUserBusinessTypes(businesses.map(b => b.type));
            } catch (error) {
                console.error("Errore caricamento business", error);
                setUserBusinessTypes([]);
            }
        }

        loadBusinesses();
    }, [userId]);

    const openCreateModal = () => {
        setEditingCollection(null);
        setName("");
        setDescription("");
        setKind("standard");
        setCollectionType(catalogTypeOptions[0]?.value ?? "generic");
        setModalOpen(true);
    };

    const openEditModal = (collection: Collection) => {
        setEditingCollection(collection);
        setName(collection.name);
        setDescription(collection.description ?? "");
        setKind(collection.kind ?? "standard");
        setCollectionType(collection.collection_type);
        setModalOpen(true);
    };

    const handleConfirm = async () => {
        if (!name.trim()) return;

        if (editingCollection) {
            const updated = await updateCollection(editingCollection.id, {
                name: name.trim(),
                description: description.trim() || undefined,
                kind
            });

            setCollections(prev => prev.map(c => (c.id === updated.id ? updated : c)));
        } else {
            const created = await createCollection({
                name: name.trim(),
                description: description.trim() || undefined,
                collection_type: collectionType,
                kind
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

                                {col.kind === "special" && (
                                    <div className={styles.specialBadge}>
                                        <Star fill={"#d97706"} />
                                    </div>
                                )}
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

                    {!editingCollection ? (
                        <Select
                            label="Tipo di contenuto"
                            value={collectionType}
                            onChange={e => setCollectionType(e.target.value as CatalogType)}
                            options={catalogTypeOptions}
                        />
                    ) : (
                        <Text variant="caption" colorVariant="muted">
                            Tipo: {catalogTypeOptions.find(o => o.value === collectionType)?.label}
                        </Text>
                    )}

                    <div>
                        <Text as="label" variant="body" weight={600}>
                            Collezione in evidenza
                        </Text>

                        <input
                            type="checkbox"
                            checked={kind === "special"}
                            onChange={e => setKind(e.target.checked ? "special" : "standard")}
                        />
                    </div>
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
