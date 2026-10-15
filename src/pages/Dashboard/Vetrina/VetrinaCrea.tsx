import { Plus, UtensilsCrossed, Palette, Megaphone, ScrollText, Package } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button/Button";
import { Menu } from "@/components/ui/Menu";
import { useTenantId } from "@/context/useTenantId";
import { usePermissions } from "@/context/usePermissions";
import { canDoOnAnyActivity, canDoOnTenant } from "@/lib/permissions";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import s from "./Vetrina.module.scss";

/**
 * «Crea» di Menù e vetrina (Visual Redesign 2, `mvCrea`): un pulsante solo
 * con la tendina «Cosa vuoi creare?», le stesse quattro cose della Home più
 * il prodotto. Ogni voce apre il suo tunnel; da lì si torna alla pagina da
 * cui si è partiti (`da`). Solo le cose che chi guarda può creare.
 */
export function VetrinaCrea({ da, disabled }: { da: string; disabled?: boolean }) {
    const navigate = useNavigate();
    const tenantId = useTenantId();
    const { permissions } = usePermissions();
    const { catalogLabel, productLabel } = useVerticalConfig();
    const b = `/business/${tenantId}`;
    if (!permissions) return null;

    const items = [
        { key: "menu", show: canDoOnTenant(permissions, "catalogs.write"), icon: UtensilsCrossed, fam: "menu", title: `Un ${catalogLabel.toLowerCase()}`, text: "Categorie e piatti da mostrare", to: `${b}/crea/menu?da=${da}` },
        { key: "stile", show: canDoOnTenant(permissions, "styles.write"), icon: Palette, fam: "style", title: "Uno stile", text: "Colori e caratteri della pagina", to: `${b}/crea/stile?da=${da}` },
        { key: "evid", show: canDoOnAnyActivity(permissions, "featured.write"), icon: Megaphone, fam: "featured", title: "In evidenza", text: "Evento, piatto del giorno, promozione", to: `${b}/crea/evidenza?da=${da}` },
        { key: "storia", show: canDoOnAnyActivity(permissions, "stories.write"), icon: ScrollText, fam: "story", title: "Una storia", text: "Il locale raccontato con testo e foto", to: `${b}/crea/storia?da=${da}` }
    ].filter(item => item.show);
    const product = canDoOnTenant(permissions, "products.write");
    if (items.length === 0 && !product) return null;

    const tile = (Icon: typeof Plus, fam: string) => (
        <span className={s.creaIc} data-family={fam} aria-hidden>
            <Icon />
        </span>
    );

    return (
        <div className={s.crea}>
            <Menu
                align="end"
                contentClassName={s.creaPop}
                trigger={
                    <Button variant="primary" size="sm" leftIcon={<Plus size={16} aria-hidden />} disabled={disabled} className={s.creaBtn}>
                        <span className={s.creaWord}>Crea</span>
                    </Button>
                }
            >
                <Menu.Label>Cosa vuoi creare?</Menu.Label>
                {items.map(item => (
                    <Menu.Item key={item.key} leading={tile(item.icon, item.fam)} description={item.text} onSelect={() => navigate(item.to)}>
                        {item.title}
                    </Menu.Item>
                ))}
                {product && items.length > 0 && <Menu.Separator />}
                {product && (
                    <Menu.Item leading={tile(Package, "price")} description="Nome, prezzo, varianti e allergeni" onSelect={() => navigate(`${b}/products?nuovo=1`)}>
                        {`Un ${productLabel.toLowerCase()}`}
                    </Menu.Item>
                )}
            </Menu>
        </div>
    );
}
