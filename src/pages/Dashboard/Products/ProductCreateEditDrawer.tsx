import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { V2Product } from "@/services/supabase/v2/products";
import { ProductForm } from "./components/ProductForm";
import styles from "./Products.module.scss";

export type ProductFormMode = "create_base" | "create_variant" | "edit";

type ProductCreateEditDrawerProps = {
    open: boolean;
    onClose: () => void;
    mode: ProductFormMode;
    productData: V2Product | null; // For edit
    parentProduct: V2Product | null; // For create_variant
    onSuccess: (savedProduct?: V2Product) => void | Promise<void>;
    tenantId?: string;
};

export function ProductCreateEditDrawer({
    open,
    onClose,
    mode,
    productData,
    parentProduct,
    onSuccess,
    tenantId
}: ProductCreateEditDrawerProps) {
    const [isSaving, setIsSaving] = useState(false);
    const navigate = useNavigate();

    let title = "Nuovo Prodotto";
    if (mode === "edit") title = "Modifica Prodotto";
    if (mode === "create_variant") title = "Nuova Variante";

    return (
        <SystemDrawer open={open} onClose={onClose} width={500}>
            <DrawerLayout
                header={
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            width: "100%"
                        }}
                    >
                        <Text variant="title-sm" weight={700}>
                            {title}
                        </Text>
                        {mode === "edit" && productData && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    onClose();
                                    navigate(`/dashboard/prodotti/${productData.id}`);
                                }}
                            >
                                Apri pagina prodotto →
                            </Button>
                        )}
                    </div>
                }
                footer={
                    <div className={styles.drawerFooterContainer}>
                        <div className={styles.drawerFooter}>
                            <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                                Annulla
                            </Button>
                            <Button
                                variant="primary"
                                type="submit"
                                form="product-form"
                                loading={isSaving}
                            >
                                {mode === "edit" ? "Salva" : "Crea"}
                            </Button>
                        </div>
                    </div>
                }
            >
                <ProductForm
                    formId="product-form"
                    mode={mode}
                    productData={productData}
                    parentProduct={parentProduct}
                    tenantId={tenantId || null}
                    onSuccess={onSuccess}
                    onSavingChange={setIsSaving}
                />
            </DrawerLayout>
        </SystemDrawer>
    );
}
