import React, { useEffect, useState, useMemo } from "react";
import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import FilterBar from "@/components/ui/FilterBar/FilterBar";
import { Card } from "@/components/ui/Card/Card";
import { Badge } from "@/components/ui/Badge/Badge";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { IconTags, IconPlus } from "@tabler/icons-react";
import { TableRowActions } from "@/components/ui/TableRowActions/TableRowActions";
import styles from "./Attributes.module.scss";

import {
    listAttributeDefinitions,
    V2ProductAttributeDefinition
} from "@/services/supabase/attributes";
import { AttributeCreateEditDrawer } from "./AttributeCreateEditDrawer";
import { AttributeDeleteDrawer } from "./AttributeDeleteDrawer";

export default function Attributes() {
    const currentTenantId = useTenantId();
    const { showToast } = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [allAttributes, setAllAttributes] = useState<V2ProductAttributeDefinition[]>([]);

    // Filter State
    const [searchQuery, setSearchQuery] = useState("");

    // Drawer States
    const [isCreateEditOpen, setIsCreateEditOpen] = useState(false);
    const [attributeToEdit, setAttributeToEdit] = useState<V2ProductAttributeDefinition | null>(
        null
    );

    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [attributeToDelete, setAttributeToDelete] = useState<V2ProductAttributeDefinition | null>(
        null
    );

    const loadData = async () => {
        try {
            setIsLoading(true);
            const data = await listAttributeDefinitions(currentTenantId!);
            setAllAttributes(data);
        } catch (error) {
            console.error("Errore nel caricamento degli attributi:", error);
            showToast({ message: "Non è stato possibile caricare gli attributi.", type: "error" });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (currentTenantId) {
            loadData();
        }
    }, [currentTenantId]);

    const filteredAttributes = useMemo(() => {
        return allAttributes.filter(attr => {
            if (
                searchQuery &&
                !attr.label.toLowerCase().includes(searchQuery.toLowerCase()) &&
                !attr.code.toLowerCase().includes(searchQuery.toLowerCase())
            ) {
                return false;
            }
            return true;
        });
    }, [allAttributes, searchQuery]);

    const handleCreate = () => {
        setAttributeToEdit(null);
        setIsCreateEditOpen(true);
    };

    const handleEdit = (attr: V2ProductAttributeDefinition) => {
        setAttributeToEdit(attr);
        setIsCreateEditOpen(true);
    };

    const handleDelete = (attr: V2ProductAttributeDefinition) => {
        setAttributeToDelete(attr);
        setIsDeleteOpen(true);
    };

    const getTypeLabel = (type: string) => {
        switch (type) {
            case "text":
                return "Testo";
            case "number":
                return "Numero";
            case "boolean":
                return "Interruttore";
            case "select":
                return "Selezione singola";
            case "multi_select":
                return "Selezione multipla";
            default:
                return type;
        }
    };

    return (
        <section className={styles.container}>
            <PageHeader
                title="Attributi prodotto"
                subtitle="Definisci gli attributi dinamici (es. Colore, Taglia, Ingredienti) per arricchire i tuoi prodotti."
                actions={<Button onClick={handleCreate}>Nuovo attributo</Button>}
            />

            <div className={styles.content}>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "16px",
                        marginBottom: "24px"
                    }}
                >
                    <FilterBar
                        search={{
                            value: searchQuery,
                            onChange: setSearchQuery,
                            placeholder: "Cerca per nome o codice..."
                        }}
                        className={styles.filterBar}
                    />
                </div>

                <Card className={styles.tableCard}>
                    {isLoading ? (
                        <div className={styles.loadingState}>
                            <Text variant="body-sm" colorVariant="muted">
                                Caricamento attributi in corso...
                            </Text>
                        </div>
                    ) : filteredAttributes.length === 0 ? (
                        <div className={styles.emptyState}>
                            <IconTags size={48} stroke={1} className={styles.emptyIcon} />
                            <Text variant="title-sm" weight={600}>
                                Nessun attributo trovato
                            </Text>
                            <Text variant="body-sm" colorVariant="muted">
                                {searchQuery
                                    ? "Nessun attributo corrisponde alla tua ricerca."
                                    : "Crea il tuo primo attributo per personalizzare ulteriormente i prodotti."}
                            </Text>
                            {!searchQuery && (
                                <Button
                                    variant="primary"
                                    onClick={handleCreate}
                                    className={styles.emptyButton}
                                >
                                    Crea attributo
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className={styles.listContainer}>
                            <div className={styles.listHeader}>
                                <div className={styles.colName}>Nome</div>
                                <div className={styles.colCode}>Codice Interno</div>
                                <div className={styles.colType}>Tipo di dato</div>
                                <div className={styles.colRequired}>Richiesto</div>
                                <div className={styles.colActions}></div>
                            </div>
                            <div className={styles.listBody}>
                                {filteredAttributes.map(attr => (
                                    <div key={attr.id} className={styles.listRow}>
                                        <div className={styles.colName}>
                                            <Text variant="body-sm" weight={600}>
                                                {attr.label}
                                            </Text>
                                        </div>
                                        <div className={styles.colCode}>
                                            <Text
                                                variant="caption"
                                                style={{
                                                    fontFamily: "monospace",
                                                    backgroundColor: "var(--color-gray-100)",
                                                    padding: "2px 6px",
                                                    borderRadius: "4px"
                                                }}
                                            >
                                                {attr.code}
                                            </Text>
                                        </div>
                                        <div className={styles.colType}>
                                            <Badge variant="secondary">
                                                {getTypeLabel(attr.type)}
                                            </Badge>
                                        </div>
                                        <div className={styles.colRequired}>
                                            {attr.is_required ? (
                                                <Badge variant="warning">Sì</Badge>
                                            ) : (
                                                <span style={{ color: "var(--color-gray-400)" }}>
                                                    -
                                                </span>
                                            )}
                                        </div>
                                        <div className={styles.colActions}>
                                            <TableRowActions
                                                actions={[
                                                    {
                                                        label: "Modifica",
                                                        onClick: () => handleEdit(attr)
                                                    },
                                                    {
                                                        label: "Elimina",
                                                        onClick: () => handleDelete(attr),
                                                        variant: "destructive",
                                                        separator: true
                                                    }
                                                ]}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </Card>
            </div>

            <AttributeCreateEditDrawer
                open={isCreateEditOpen}
                onClose={() => setIsCreateEditOpen(false)}
                attributeData={attributeToEdit}
                onSuccess={loadData}
                tenantId={currentTenantId ?? undefined}
            />

            <AttributeDeleteDrawer
                open={isDeleteOpen}
                onClose={() => setIsDeleteOpen(false)}
                attributeData={attributeToDelete}
                onSuccess={loadData}
            />
        </section>
    );
}
