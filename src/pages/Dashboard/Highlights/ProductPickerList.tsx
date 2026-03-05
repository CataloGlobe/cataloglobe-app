import React, { useEffect, useState, useMemo } from "react";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { supabase } from "@/services/supabase/client";

interface ProductPickerListProps {
    excludedProductIds?: string[];
    onSelect: (productId: string) => void;
}

export default function ProductPickerList({
    excludedProductIds = [],
    onSelect
}: ProductPickerListProps) {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [availableProducts, setAvailableProducts] = useState<
        { id: string; name: string; base_price: number | null }[]
    >([]);
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        loadProducts();
    }, []);

    const loadProducts = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from("v2_products")
                .select("id, name, base_price")
                .order("name");

            if (error) throw error;
            setAvailableProducts(data || []);
        } catch (error) {
            console.error("Error loading products for picker", error);
            showToast({ type: "error", message: "Impossibile caricare la lista prodotti." });
        } finally {
            setLoading(false);
        }
    };

    const unselectedProducts = useMemo(() => {
        return availableProducts.filter(p => !excludedProductIds.includes(p.id));
    }, [availableProducts, excludedProductIds]);

    const filteredProducts = useMemo(() => {
        if (!searchTerm) return unselectedProducts;
        return unselectedProducts.filter(p =>
            p.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [unselectedProducts, searchTerm]);

    if (loading) {
        return (
            <div style={{ padding: "32px", textAlign: "center" }}>
                <Text variant="body-sm" colorVariant="muted">
                    Caricamento prodotti disponibili...
                </Text>
            </div>
        );
    }

    if (availableProducts.length > 0 && unselectedProducts.length === 0) {
        return (
            <div style={{ padding: "32px", textAlign: "center" }}>
                <Text variant="body-sm" colorVariant="muted">
                    Hai già aggiunto tutti i prodotti disponibili nel catalogo.
                </Text>
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", height: "100%" }}>
            <div style={{ padding: "0 4px" }}>
                <input
                    type="search"
                    placeholder="Cerca prodotto..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    style={{
                        width: "100%",
                        padding: "10px 12px",
                        border: "1px solid var(--border-base, #ccc)",
                        borderRadius: "8px",
                        background: "var(--surface-primary)",
                        fontFamily: "inherit",
                        fontSize: "14px"
                    }}
                />
            </div>

            <div
                style={{
                    flex: 1,
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    paddingBottom: "24px"
                }}
            >
                {filteredProducts.length === 0 ? (
                    <Text
                        variant="body-sm"
                        colorVariant="muted"
                        style={{ textAlign: "center", marginTop: "16px" }}
                    >
                        Nessun prodotto trovato.
                    </Text>
                ) : (
                    filteredProducts.map(p => (
                        <button
                            key={p.id}
                            onClick={() => onSelect(p.id)}
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "12px 16px",
                                border: "1px solid var(--border-subtle, #e5e7eb)",
                                borderRadius: "8px",
                                background: "var(--surface-primary)",
                                cursor: "pointer",
                                textAlign: "left",
                                transition: "background 0.2s"
                            }}
                            onMouseOver={e => {
                                e.currentTarget.style.background = "var(--surface-secondary)";
                            }}
                            onMouseOut={e => {
                                e.currentTarget.style.background = "var(--surface-primary)";
                            }}
                        >
                            <Text variant="body-sm" weight={600}>
                                {p.name}
                            </Text>
                            {p.base_price !== null && (
                                <Text variant="body-sm" colorVariant="muted">
                                    €{p.base_price.toFixed(2)}
                                </Text>
                            )}
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}
