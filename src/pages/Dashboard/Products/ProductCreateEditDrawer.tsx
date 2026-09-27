import { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import type { V2Product } from "@/services/supabase/products";
import { ProductForm, type ProductFormMode } from "./components/ProductForm";

export type { ProductFormMode };

type ProductCreateEditDrawerProps = {
    open: boolean;
    onClose: () => void;
    /**
     * Crea un {prodotto} o una variante. La modifica non passa più da qui
     * (§50.9/5): si fa nella pagina del prodotto.
     */
    mode: Exclude<ProductFormMode, "edit">;
    parentProduct: V2Product | null;
    onSuccess: (savedProduct?: V2Product) => void | Promise<void>;
    tenantId?: string;
};

export function ProductCreateEditDrawer({
    open,
    onClose,
    mode,
    parentProduct,
    onSuccess,
    tenantId
}: ProductCreateEditDrawerProps) {
    const [isSaving, setIsSaving] = useState(false);
    const { productLabel } = useVerticalConfig();
    const title = mode === "create_variant" ? "Nuova variante" : `Nuovo ${productLabel.toLowerCase()}`;

    return (
        <SystemDrawer open={open} onClose={onClose} size="md">
            <DrawerLayout
                title={title}
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                            Annulla
                        </Button>
                        <Button variant="primary" type="submit" form="product-form" loading={isSaving} disabled={isSaving}>
                            Crea
                        </Button>
                    </>
                }
            >
                <ProductForm
                    formId="product-form"
                    mode={mode}
                    productData={null}
                    parentProduct={parentProduct}
                    tenantId={tenantId || null}
                    onSuccess={onSuccess}
                    onSavingChange={setIsSaving}
                />
            </DrawerLayout>
        </SystemDrawer>
    );
}
