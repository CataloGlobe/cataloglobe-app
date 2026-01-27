import { useCallback, useEffect, useState } from "react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui";
import { TextInput } from "@/components/ui/Input/TextInput";
import { CheckboxInput } from "@/components/ui/Input/CheckboxInput";
import CatalogManager from "@/components/CatalogManager/CatalogManager";
import {
    listCollections,
    createCollection,
    updateCollection,
    deleteCollection,
    isCollectionDeletable,
    duplicateCollection
} from "@/services/supabase/collections";
import type { BusinessType, Collection } from "@/types/database";
import CollectionBuilder from "@/components/CollectionBuilder/CollectionBuilder";
import { useToast } from "@/context/Toast/ToastContext";
import { businessTypeToCatalogType } from "@/domain/catalog/businessToCatalog";
import { CopyPlus, Pencil, Star, Trash2 } from "lucide-react";
import { CatalogType } from "@/types/catalog";
import { Select } from "@/components/ui/Select/Select";
import { CATALOG_TYPE_LABELS } from "@/domain/catalog/catalogTypeLabels";
import { getUserBusinesses } from "@/services/supabase/businesses";
import { getAllowedCatalogTypesForBusinesses } from "@/domain/catalog/catalogTypeRules";
import { useAuth } from "@/context/useAuth";
import styles from "./Collections.module.scss";
import { IconButton } from "@/components/ui/Button/IconButton";
import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutFooter,
    ModalLayoutHeader
} from "@/components/ui/ModalLayout/ModalLayout";

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

    const [duplicateTarget, setDuplicateTarget] = useState<Collection | null>(null);
    const [duplicateName, setDuplicateName] = useState("");
    const [isDuplicating, setIsDuplicating] = useState(false);
    const [duplicateDescription, setDuplicateDescription] = useState("");
    const [duplicateItems, setDuplicateItems] = useState(true);

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

    const handleConfirmDuplicate = async () => {
        if (!duplicateTarget || !duplicateName.trim()) return;

        try {
            setIsDuplicating(true);

            const newId = await duplicateCollection(
                duplicateTarget.id,
                duplicateName.trim(),
                duplicateItems
            );

            if (duplicateDescription.trim()) {
                await updateCollection(newId, {
                    description: duplicateDescription.trim()
                });
            }

            showToast({
                type: "success",
                message: "Collezione duplicata con successo",
                duration: 2500
            });

            await loadCollections();
            setActiveCollectionId(newId);
        } catch (error) {
            console.error(error);
            showToast({
                type: "error",
                message: "Errore durante la duplicazione della collezione",
                duration: 3000
            });
        } finally {
            setIsDuplicating(false);
            setDuplicateTarget(null);
            setDuplicateName("");
            setDuplicateDescription("");
            setDuplicateItems(true);
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
                        <Button variant="primary" onClick={openCreateModal}>
                            Crea catalogo
                        </Button>

                        <Button variant="outline" onClick={() => setCatalogOpen(true)}>
                            I tuoi prodotti
                        </Button>
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

                                    <div className={styles.actions}>
                                        <IconButton
                                            variant="ghost"
                                            icon={<CopyPlus size={16} />}
                                            aria-label="Duplica collezione"
                                            onClick={e => {
                                                e.stopPropagation();
                                                setDuplicateTarget(col);
                                                setDuplicateName(`${col.name} (copia)`);
                                                setDuplicateDescription(col.description ?? "");
                                            }}
                                        />

                                        <IconButton
                                            variant="ghost"
                                            icon={<Pencil size={16} />}
                                            aria-label="Rinomina collezione"
                                            onClick={e => {
                                                e.stopPropagation();
                                                openEditModal(col);
                                            }}
                                        />

                                        <IconButton
                                            variant="ghost"
                                            icon={<Trash2 size={16} />}
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
                                        />
                                    </div>
                                </div>

                                {col.description && (
                                    <Text variant="caption" colorVariant="muted">
                                        {col.description}
                                    </Text>
                                )}

                                <Text variant="caption-xs" colorVariant="muted">
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

            <CollectionBuilder
                isOpen={Boolean(activeCollectionId)}
                collectionId={activeCollectionId}
                onClose={() => setActiveCollectionId(null)}
            />

            <CatalogManager
                isOpen={catalogOpen}
                onClose={() => setCatalogOpen(false)}
                catalogType={catalogType}
            />

            <ModalLayout
                isOpen={Boolean(duplicateTarget)}
                onClose={() => setDuplicateTarget(null)}
                width="sm"
                height="fit"
            >
                <ModalLayoutHeader>
                    <div className={styles.headerLeft}>
                        <Text as="h2" variant="title-md" weight={700}>
                            Duplica collezione
                        </Text>
                        <Text variant="caption" colorVariant="muted">
                            {duplicateTarget
                                ? `Vuoi duplicare la collezione "${duplicateTarget.name}"?`
                                : ""}
                        </Text>
                    </div>
                </ModalLayoutHeader>

                <ModalLayoutContent>
                    <div className={styles.modalContent}>
                        <TextInput
                            label="Nome nuova collezione"
                            value={duplicateName}
                            onChange={e => setDuplicateName(e.target.value)}
                            autoFocus
                        />

                        <TextInput
                            label="Descrizione"
                            value={duplicateDescription}
                            onChange={e => setDuplicateDescription(e.target.value)}
                            placeholder="Descrizione opzionale"
                        />

                        <CheckboxInput
                            label="Duplica anche gli item"
                            description={
                                duplicateItems
                                    ? "Voglio duplicare anche gli item"
                                    : "Voglio duplicare solo la struttura"
                            }
                            checked={duplicateItems}
                            onChange={e => setDuplicateItems(e.target.checked)}
                        />
                    </div>
                </ModalLayoutContent>

                <ModalLayoutFooter>
                    <Button variant="secondary" onClick={() => setDuplicateTarget(null)}>
                        Annulla
                    </Button>

                    <Button
                        variant="primary"
                        onClick={handleConfirmDuplicate}
                        loading={isDuplicating}
                        disabled={!duplicateName.trim() || isDuplicating}
                    >
                        {isDuplicating ? "Duplicazione..." : "Duplica"}
                    </Button>
                </ModalLayoutFooter>
            </ModalLayout>

            <ModalLayout
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                width="sm"
                height="fit"
            >
                <ModalLayoutHeader>
                    <div className={styles.headerLeft}>
                        <Text as="h2" variant="title-md" weight={700}>
                            {editingCollection ? "Modifica collezione" : "Crea nuova collezione"}
                        </Text>
                        <Text variant="caption" colorVariant="muted">
                            {editingCollection
                                ? "Modifica i dettagli della collezione."
                                : "Inserisci un nome e una descrizione."}
                        </Text>
                    </div>
                </ModalLayoutHeader>

                <ModalLayoutContent>
                    <div className={styles.modalContent}>
                        <TextInput
                            label="Nome collezione"
                            value={name}
                            onChange={e => setName(e.target.value)}
                        />

                        <TextInput
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
                                Tipo:{" "}
                                {catalogTypeOptions.find(o => o.value === collectionType)?.label}
                            </Text>
                        )}

                        <CheckboxInput
                            label="Collezione in evidenza"
                            description="Mostra in evidenza sopra il resto dei contenuti"
                            checked={kind === "special"}
                            onChange={e => setKind(e.target.checked ? "special" : "standard")}
                        />
                    </div>
                </ModalLayoutContent>

                <ModalLayoutFooter>
                    <Button variant="secondary" onClick={() => setModalOpen(false)}>
                        Annulla
                    </Button>

                    <Button variant="primary" onClick={handleConfirm} disabled={!name.trim()}>
                        {editingCollection ? "Salva" : "Crea"}
                    </Button>
                </ModalLayoutFooter>
            </ModalLayout>

            <ModalLayout
                isOpen={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                width="xs"
                height="fit"
            >
                <ModalLayoutHeader>
                    <div className={styles.headerLeft}>
                        <Text as="h2" variant="title-sm" weight={700}>
                            Elimina collezione
                        </Text>
                    </div>
                </ModalLayoutHeader>

                <ModalLayoutContent>
                    <Text variant="body">
                        {`Sei sicuro di voler eliminare "${deleteTarget?.name}"? Questa azione è irreversibile.`}
                    </Text>
                </ModalLayoutContent>

                <ModalLayoutFooter>
                    <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                        Annulla
                    </Button>

                    <Button variant="primary" onClick={handleDeleteCollection}>
                        Elimina
                    </Button>
                </ModalLayoutFooter>
            </ModalLayout>

            <ModalLayout
                isOpen={Boolean(deleteError)}
                onClose={() => setDeleteError(null)}
                width="xs"
                height="fit"
            >
                <ModalLayoutHeader>
                    <div className={styles.headerLeft}>
                        <Text as="h2" variant="title-sm" weight={700}>
                            Impossibile eliminare
                        </Text>
                    </div>
                </ModalLayoutHeader>

                <ModalLayoutContent>
                    <Text variant="body">{deleteError ?? ""}</Text>
                </ModalLayoutContent>

                <ModalLayoutFooter>
                    <Button variant="primary" onClick={() => setDeleteError(null)}>
                        Chiudi
                    </Button>
                </ModalLayoutFooter>
            </ModalLayout>
        </>
    );
}
