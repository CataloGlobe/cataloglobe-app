import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./CatalogManagerModal.module.scss";

import Text from "../ui/Text/Text";
import { Button } from "../ui";
import { Input } from "../ui";

import type { Item } from "@/types/database";
import type { CatalogType, ServiceSubtype } from "@/types/catalog";

import {
    listItems,
    searchItems,
    createItem,
    updateItem,
    deleteItem
} from "@/services/supabase/collections";

import { getFieldsForCollection } from "@/domain/catalog/getCatalogConfig";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    catalogType: CatalogType;
};

type Draft = {
    base: {
        name: string;
        description: string;
        base_price: string;
        duration: string;
    };
    metadata: Record<string, unknown>;
    subtype?: ServiceSubtype;
};

function readSubtype(metadata: Item["metadata"]): ServiceSubtype | undefined {
    const st = (metadata as any)?.subtype;
    if (st === "generic" || st === "hairdresser" || st === "beauty") return st;
    return undefined;
}

export default function CatalogManagerModal({ isOpen, onClose, catalogType }: Props) {
    const firstFocusRef = useRef<HTMLInputElement | null>(null);

    // "catalogType" è il default esterno; "activeCatalogType" è il filtro interno
    const [activeCatalogType, setActiveCatalogType] = useState<CatalogType>(catalogType);

    const [items, setItems] = useState<Item[]>([]);
    const [drafts, setDrafts] = useState<Record<string, Draft>>({});
    const [openId, setOpenId] = useState<string | null>(null);

    const [query, setQuery] = useState("");
    const [createName, setCreateName] = useState("");
    const [createError, setCreateError] = useState<string | null>(null);

    const [loading, setLoading] = useState(false);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // evita race tra fetch multipli (type change + search)
    const reqIdRef = useRef(0);

    /* ----------------------------------------
       RESET SOLO ALL'APERTURA
    ---------------------------------------- */
    useEffect(() => {
        if (!isOpen) return;

        // quando apro: riallineo il filtro al default esterno (fallback C -> menu, ecc.)
        setActiveCatalogType(catalogType);

        // reset UI (solo apertura)
        setItems([]);
        setDrafts({});
        setOpenId(null);
        setQuery("");
        setCreateName("");
        setCreateError(null);
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
       DRAFT INIT
    ---------------------------------------- */
    const ensureDraft = useCallback((it: Item) => {
        setDrafts(prev => {
            if (prev[it.id]) return prev;

            const meta = (it.metadata as Record<string, unknown>) ?? {};

            return {
                ...prev,
                [it.id]: {
                    base: {
                        name: it.name ?? "",
                        description: it.description ?? "",
                        base_price: it.base_price != null ? String(it.base_price) : "",
                        duration: it.duration != null ? String(it.duration) : ""
                    },
                    metadata: meta,
                    subtype: readSubtype(it.metadata)
                }
            };
        });
    }, []);

    /* ----------------------------------------
       TOGGLE ITEM
    ---------------------------------------- */
    const onToggle = useCallback(
        (it: Item) => {
            ensureDraft(it);
            setOpenId(prev => (prev === it.id ? null : it.id));
        },
        [ensureDraft]
    );

    /* ----------------------------------------
       CREATE
    ---------------------------------------- */
    const onCreate = useCallback(async () => {
        const name = createName.trim();
        if (!name) {
            setCreateError("Inserisci un nome.");
            return;
        }

        setCreateError(null);
        setSavingId("create");

        try {
            const newItem = await createItem({
                name,
                type: activeCatalogType
            });

            setItems(prev => [newItem, ...prev]);
            setOpenId(newItem.id);
            ensureDraft(newItem);
            setCreateName("");
        } catch {
            setCreateError("Errore nella creazione del contenuto");
        } finally {
            setSavingId(null);
        }
    }, [createName, activeCatalogType, ensureDraft]);

    /* ----------------------------------------
       UPDATE
    ---------------------------------------- */
    const onSave = async (it: Item) => {
        const d = drafts[it.id];
        if (!d) return;

        setSavingId(it.id);
        try {
            const payload = {
                name: d.base.name,
                description: d.base.description || null,
                base_price: d.base.base_price ? Number(d.base.base_price) : null,
                duration: d.base.duration ? Number(d.base.duration) : null,
                metadata: {
                    ...(it.metadata ?? {}),
                    ...d.metadata,
                    ...(activeCatalogType === "services" && d.subtype ? { subtype: d.subtype } : {})
                }
            };

            const updated = await updateItem(it.id, payload);
            setItems(prev => prev.map(x => (x.id === it.id ? updated : x)));
        } catch {
            setError("Errore nel salvataggio");
        } finally {
            setSavingId(null);
        }
    };

    /* ----------------------------------------
       REMOVE
    ---------------------------------------- */
    const onRemove = async (id: string) => {
        setSavingId(id);
        try {
            await deleteItem(id);
            setItems(prev => prev.filter(x => x.id !== id));
            if (openId === id) setOpenId(null);
        } catch {
            setError("Errore nell’eliminazione");
        } finally {
            setSavingId(null);
        }
    };

    /* ----------------------------------------
       RENDER
    ---------------------------------------- */
    if (!isOpen) return null;

    const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));

    return (
        <div className={styles.overlay} role="dialog" aria-modal="true">
            <div className={styles.modal}>
                <header className={styles.header}>
                    <div>
                        <Text as="h2" variant="title-md" weight={700}>
                            Catalogo
                        </Text>
                        <Text variant="caption" colorVariant="muted">
                            Gestisci i contenuti globali
                        </Text>
                    </div>
                    <Button label="Chiudi" variant="ghost" onClick={onClose} />
                </header>

                <div className={styles.toolbar}>
                    <div className={styles.search}>
                        <input
                            ref={firstFocusRef}
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Cerca contenuto…"
                        />
                    </div>

                    <div className={styles.typeFilter}>
                        <Text variant="caption" weight={600}>
                            Tipo
                        </Text>
                        <select
                            value={activeCatalogType}
                            onChange={e => {
                                const next = e.target.value as CatalogType;
                                setActiveCatalogType(next);
                                // reset solo stato locale legato agli item aperti
                                setDrafts({});
                                setOpenId(null);
                                // NON svuotiamo items: la search effect (query vuota) caricherà la lista del nuovo type
                                setQuery("");
                                setError(null);
                            }}
                        >
                            <option value="menu">Menu</option>
                            <option value="services">Servizi</option>
                            <option value="products">Prodotti</option>
                        </select>
                    </div>

                    <div className={styles.createRow}>
                        <Input
                            label="Nuovo contenuto"
                            value={createName}
                            onChange={e => setCreateName(e.target.value)}
                            error={createError ?? undefined}
                        />
                        <Button label="Crea" loading={savingId === "create"} onClick={onCreate} />
                    </div>
                </div>

                <div className={styles.content}>
                    {error && <Text colorVariant="muted">{error}</Text>}

                    {loading && <Text colorVariant="muted">Caricamento…</Text>}

                    {!loading && sorted.length === 0 && (
                        <Text colorVariant="muted">Nessun contenuto trovato.</Text>
                    )}

                    <ul className={styles.list}>
                        {sorted.map(it => {
                            const isOpenRow = openId === it.id;
                            const d = drafts[it.id];

                            const fields = getFieldsForCollection(
                                activeCatalogType,
                                activeCatalogType === "services" ? d?.subtype ?? "generic" : null
                            );

                            return (
                                <li key={it.id}>
                                    <button onClick={() => onToggle(it)}>
                                        <Text weight={700}>{it.name}</Text>
                                    </button>

                                    {isOpenRow && d && (
                                        <div>
                                            {fields.map(field => {
                                                // FieldDef.key è string => per base bisogna proteggere l’accesso
                                                const value =
                                                    field.storage === "base"
                                                        ? (d.base as Record<string, string>)[
                                                              field.key
                                                          ]
                                                        : d.metadata[field.key];

                                                const inputValue =
                                                    typeof value === "string" ||
                                                    typeof value === "number"
                                                        ? value
                                                        : "";

                                                return (
                                                    <Input
                                                        key={field.key}
                                                        label={field.label}
                                                        value={inputValue}
                                                        onChange={e => {
                                                            const v = e.target.value;

                                                            setDrafts(prev => ({
                                                                ...prev,
                                                                [it.id]: {
                                                                    ...prev[it.id],
                                                                    base:
                                                                        field.storage === "base"
                                                                            ? {
                                                                                  ...prev[it.id]
                                                                                      .base,
                                                                                  [field.key]: v
                                                                              }
                                                                            : prev[it.id].base,
                                                                    metadata:
                                                                        field.storage === "metadata"
                                                                            ? {
                                                                                  ...prev[it.id]
                                                                                      .metadata,
                                                                                  [field.key]: v
                                                                              }
                                                                            : prev[it.id].metadata
                                                                }
                                                            }));
                                                        }}
                                                    />
                                                );
                                            })}

                                            <div className={styles.actions}>
                                                <Button
                                                    label="Salva"
                                                    loading={savingId === it.id}
                                                    onClick={() => onSave(it)}
                                                />
                                                <Button
                                                    label="Elimina"
                                                    variant="secondary"
                                                    loading={savingId === it.id}
                                                    onClick={() => onRemove(it.id)}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </div>
        </div>
    );
}
