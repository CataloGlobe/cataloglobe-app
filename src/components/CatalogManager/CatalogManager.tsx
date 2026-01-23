import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./CatalogManager.module.scss";

import Text from "../ui/Text/Text";
import { Button } from "../ui";

import type { Item } from "@/types/database";
import type { CatalogType } from "@/types/catalog";

import {
    listItems,
    searchItems,
    deleteItem,
    createItem,
    updateItem
} from "@/services/supabase/collections";

import { TextInput } from "../ui/Input/TextInput";
import { Select } from "../ui/Select/Select";
import { ItemRow } from "../CollectionBuilder/ItemRow/ItemRow";
import { Eye, Pencil, Trash2 } from "lucide-react";
import ModalLayout, {
    ModalLayoutContent,
    ModalLayoutDrawer,
    ModalLayoutHeader
} from "../ui/ModalLayout/ModalLayout";
import { Drawer } from "../ui/Drawer/Drawer";
import {
    CreateItemDrawer,
    CreateItemDrawerRef
} from "../CollectionBuilder/CreateItemDrawer/CreateItemDrawer";
import {
    EditItemDrawer,
    EditItemDrawerRef
} from "../CollectionBuilder/EditItemDrawer/EditItemDrawer";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    catalogType: CatalogType;
};

type DrawerState = { type: "none" } | { type: "add" } | { type: "edit"; item: Item };

export default function CatalogManager({ isOpen, onClose, catalogType }: Props) {
    const firstFocusRef = useRef<HTMLInputElement | null>(null);

    // "catalogType" è il default esterno; "activeCatalogType" è il filtro interno
    const [activeCatalogType, setActiveCatalogType] = useState<CatalogType>(catalogType);

    const [items, setItems] = useState<Item[]>([]);

    const [query, setQuery] = useState("");

    const [drawer, setDrawer] = useState<DrawerState>({ type: "none" });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // evita race tra fetch multipli (type change + search)
    const reqIdRef = useRef(0);
    const createItemRef = useRef<CreateItemDrawerRef | null>(null);
    const editItemRef = useRef<EditItemDrawerRef | null>(null);

    useEffect(() => {
        if (!isOpen) {
            setDrawer({ type: "none" });
        }
    }, [isOpen]);

    /* ----------------------------------------
       RESET SOLO ALL'APERTURA
    ---------------------------------------- */
    useEffect(() => {
        if (!isOpen) return;

        // quando apro: riallineo il filtro al default esterno (fallback C -> menu, ecc.)
        setActiveCatalogType(catalogType);

        // reset UI (solo apertura)
        setItems([]);
        setQuery("");
        setError(null);

        // focus input
        const t = setTimeout(() => firstFocusRef.current?.focus(), 50);
        return () => clearTimeout(t);
    }, [isOpen, catalogType]);

    /* ----------------------------------------
       FETCH BASE LIST (quando cambia type e query è vuota)
       - NON resetta la UI
       - ignora risposte vecchie
    ---------------------------------------- */
    const loadBaseList = useCallback(
        async (type: CatalogType) => {
            const myReq = ++reqIdRef.current;
            setLoading(true);
            setError(null);

            try {
                const data = await listItems(type, 50);
                if (reqIdRef.current !== myReq) return; // risposta vecchia
                setItems(data);
            } catch {
                if (reqIdRef.current !== myReq) return;
                setError("Errore nel caricamento dei contenuti");
                setItems([]);
            } finally {
                if (reqIdRef.current === myReq) setLoading(false);
            }
        },
        [setItems]
    );

    /* ----------------------------------------
       SEARCH (debounced)
       - se query vuota -> ricarico base list del type attivo
       - ignora risposte vecchie
    ---------------------------------------- */
    useEffect(() => {
        if (!isOpen) return;

        const q = query.trim();

        // se query vuota: carico lista base per il type attivo
        if (!q) {
            loadBaseList(activeCatalogType);
            return;
        }

        const myReq = ++reqIdRef.current;

        const t = setTimeout(async () => {
            setLoading(true);
            setError(null);

            try {
                const data = await searchItems(q, activeCatalogType);
                if (reqIdRef.current !== myReq) return;
                setItems(data);
            } catch {
                if (reqIdRef.current !== myReq) return;
                setError("Errore nella ricerca");
                setItems([]);
            } finally {
                if (reqIdRef.current === myReq) setLoading(false);
            }
        }, 250);

        return () => clearTimeout(t);
    }, [query, isOpen, activeCatalogType, loadBaseList]);

    /* ----------------------------------------
       REMOVE
    ---------------------------------------- */
    const onRemove = async (id: string) => {
        try {
            await deleteItem(id);
            setItems(prev => prev.filter(x => x.id !== id));
        } catch {
            setError("Errore nell’eliminazione");
        }
    };

    const openAddDrawer = useCallback(() => {
        setDrawer({ type: "add" });
    }, []);

    const openEditDrawer = useCallback((item: Item) => {
        setDrawer({ type: "edit", item });
    }, []);

    const closeDrawer = useCallback(() => {
        setDrawer({ type: "none" });
    }, []);

    /* ----------------------------------------
       RENDER
    ---------------------------------------- */

    const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));

    const renderToolbar = () => (
        <div className={styles.toolbar}>
            <div className={styles.search}>
                <TextInput
                    ref={firstFocusRef}
                    placeholder="Cerca contenuto…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                />
            </div>

            <div className={styles.typeFilter}>
                <Select
                    value={activeCatalogType}
                    onChange={e => {
                        const next = e.target.value as CatalogType;
                        setActiveCatalogType(next);
                        setQuery("");
                        setError(null);
                    }}
                >
                    <option value="menu">Menu</option>
                    <option value="services">Servizi</option>
                    <option value="products">Prodotti</option>
                </Select>
            </div>
        </div>
    );

    const renderList = () => {
        if (error) return <Text colorVariant="muted">{error}</Text>;
        if (loading) return <Text colorVariant="muted">Caricamento…</Text>;
        if (sorted.length === 0) return <Text colorVariant="muted">Nessun contenuto trovato.</Text>;

        return (
            <ul className={styles.itemsList}>
                {sorted.map(it => (
                    <ItemRow
                        key={it.id}
                        name={it.name}
                        price={it.base_price}
                        actions={[
                            {
                                icon: <Eye size={16} />,
                                ariaLabel: "Mostra / nascondi",
                                onClick: () => {}
                            },
                            {
                                icon: <Pencil size={16} />,
                                ariaLabel: "Modifica",
                                onClick: () => openEditDrawer(it)
                            },
                            {
                                icon: <Trash2 size={16} />,
                                ariaLabel: "Elimina definitivamente",
                                onClick: () => onRemove(it.id)
                            }
                        ]}
                    />
                ))}
            </ul>
        );
    };

    return (
        <ModalLayout
            isOpen={isOpen}
            onClose={onClose}
            isDrawerOpen={drawer.type !== "none"}
            onCloseDrawer={closeDrawer}
        >
            <ModalLayoutHeader>
                <div className={styles.headerLeft}>
                    <Text as="h2" variant="title-md" weight={600}>
                        Catalogo
                    </Text>
                </div>
                <div className={styles.headerRight}>
                    <Button variant="primary" onClick={openAddDrawer}>
                        Aggiungi
                    </Button>
                    <Button variant="secondary" onClick={onClose}>
                        Chiudi
                    </Button>
                </div>
            </ModalLayoutHeader>

            <ModalLayoutContent>
                {renderToolbar()}
                <div className={styles.content}>{renderList()}</div>
            </ModalLayoutContent>

            <ModalLayoutDrawer>
                <Drawer
                    isOpen={drawer.type !== "none"}
                    title={drawer.type === "edit" ? "Modifica elemento" : "Aggiungi elemento"}
                    onClose={closeDrawer}
                    footer={
                        drawer.type === "add" ? (
                            <Button
                                variant="primary"
                                onClick={() => createItemRef.current?.submit()}
                            >
                                Crea elemento
                            </Button>
                        ) : drawer.type === "edit" ? (
                            <>
                                <Button variant="secondary" onClick={closeDrawer}>
                                    Annulla
                                </Button>
                                <Button
                                    variant="primary"
                                    onClick={() => editItemRef.current?.submit()}
                                >
                                    Salva modifiche
                                </Button>
                            </>
                        ) : null
                    }
                >
                    {/* ADD */}
                    {drawer.type === "add" && (
                        <CreateItemDrawer
                            ref={createItemRef}
                            collectionType={catalogType}
                            onSubmit={async payload => {
                                const item = await createItem(payload);
                                setItems(prev => [item, ...prev]);
                                closeDrawer();
                            }}
                        />
                    )}

                    {/* EDIT */}
                    {drawer.type === "edit" && (
                        <EditItemDrawer
                            ref={editItemRef}
                            item={drawer.item}
                            collectionType={catalogType}
                            onSubmit={async payload => {
                                await updateItem(payload.id, {
                                    name: payload.name,
                                    description: payload.description ?? null,
                                    base_price: payload.base_price ?? null,
                                    duration: payload.duration ?? null
                                });

                                setItems(prev =>
                                    prev.map(it =>
                                        it.id === payload.id ? { ...it, ...payload } : it
                                    )
                                );

                                closeDrawer();
                            }}
                        />
                    )}
                </Drawer>
            </ModalLayoutDrawer>
        </ModalLayout>
    );
}
