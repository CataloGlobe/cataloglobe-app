import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { V2Product } from "@/services/supabase/products";
import { ProductForm } from "./components/ProductForm";

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
    const { businessId } = useParams<{ businessId: string }>();

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
                                    navigate(`/business/${businessId}/products/${productData.id}`);
                                }}
                            >
                                Apri pagina prodotto →
                            </Button>
                        )}
                    </div>
                }
                footer={
                    <>
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
                    </>
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
