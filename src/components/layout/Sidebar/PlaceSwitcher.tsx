import { useNavigate } from "react-router-dom";
import { ArrowLeftRight, Check, ChevronsUpDown, Plus, Store } from "lucide-react";
import { Menu } from "@/components/ui/Menu/Menu";
import Text from "@/components/ui/Text/Text";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { AddActivityDrawer } from "@/components/Businesses/AddActivityDrawer/AddActivityDrawer";
import { useTenant } from "@/context/useTenant";
import { getTenantLogoPublicUrl } from "@/services/supabase/tenants";
import { useSedeSwitcher } from "@/hooks/useSedeSwitcher";
import { placeLines } from "@/utils/placeLabel";
import styles from "./PlaceSwitcher.module.scss";

/** Iniziali dell'azienda quando manca il logo: due parole, una lettera ciascuna. */
function tenantInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
const ALL_LABEL = "Tutte le sedi";

/** Lo spazio dell'icona per le voci senza spunta: i nomi restano in colonna. */
function NoIcon() {
    return <span className={styles.iconSpacer} aria-hidden="true" />;
}

interface PlaceSwitcherProps {
    collapsed: boolean;
}

/**
 * In cima alla sidebar (Officina): azienda e sede in un pulsante solo, al
 * posto di «azienda / sede» nella testata. Sopra l'azienda, sotto dove sei,
 * senza ripetere il nome (`placeLines`). Il menù cambia sede (regole di
 * `useSedeSwitcher`) e, con più aziende, azienda. Chiusa resta il quadrato
 * con le iniziali e il nome passa al tooltip.
 */
export function PlaceSwitcher({ collapsed }: PlaceSwitcherProps) {
    const { tenants, selectedTenant, selectedTenantId, selectTenant } = useTenant();
    const navigate = useNavigate();
    const sw = useSedeSwitcher();

    if (!selectedTenant) return null;

    const lines = sw.ready
        ? placeLines(selectedTenant.name, sw.currentName, ALL_LABEL)
        : { title: selectedTenant.name, subtitle: null };
    const status = sw.suspended ? "Sospesa" : null;
    const second = [lines.subtitle, status].filter(Boolean).join(" · ");
    // Il nome intero (tooltip da chiusa, nome accessibile): la sede che si
    // chiama come l'azienda non si ripete nemmeno qui.
    const full = [lines.title, second].filter(Boolean).join(" · ");

    const chooseTenant = (id: string) => {
        if (id === selectedTenantId) return;
        selectTenant(id);
        // Si entra dall'indice dell'azienda (D1): sede o Panoramica.
        navigate(`/business/${id}`);
    };

    const trigger = (
        <button
            type="button"
            className={styles.trigger}
            data-collapsed={collapsed || undefined}
            aria-label={`Dove sei: ${full}`}
        >
            {/* Il logo dell'azienda è un quadrato (impostazioni, workspace): mai
                tagliato nel cerchio dell'Avatar, mai su un fondo colorato che
                trasparirebbe dai PNG. Il viola resta alle sole iniziali. */}
            {selectedTenant.logo_url ? (
                <img src={getTenantLogoPublicUrl(selectedTenant.logo_url)} alt="" className={styles.mark} />
            ) : (
                <Text as="span" variant="caption" weight={600} colorVariant="white" className={`${styles.mark} ${styles.markInitials}`} aria-hidden="true">
                    {tenantInitials(selectedTenant.name)}
                </Text>
            )}
            <span className={styles.lines}>
                <Text as="span" variant="body-sm" weight={600} className={styles.line}>
                    {lines.title}
                </Text>
                {second && (
                    <Text as="span" variant="caption" colorVariant="muted" className={styles.line}>
                        {second}
                    </Text>
                )}
            </span>
            <ChevronsUpDown size={16} className={styles.chevron} aria-hidden="true" />
        </button>
    );

    const menu = (
        <Menu
            trigger={trigger}
            side={collapsed ? "right" : "bottom"}
            align="start"
            contentClassName={styles.menu}
            density="compact"
        >
            {sw.ready && (
                <>
                    <Menu.Label>
                        <Text as="span" variant="caption-xs" weight={600} colorVariant="muted">
                            Sedi
                        </Text>
                    </Menu.Label>
                    {sw.activities.map(a => (
                        <Menu.Item
                            key={a.id}
                            icon={a.id === sw.currentId ? Check : NoIcon}
                            onSelect={() => sw.choose(a.id)}
                            description={a.status === "inactive" ? "Sospesa" : undefined}
                        >
                            {a.name}
                        </Menu.Item>
                    ))}
                    {sw.context !== "unica" && (
                        <Menu.Item icon={sw.currentId ? Store : Check} onSelect={sw.goToAll}>
                            {ALL_LABEL}
                        </Menu.Item>
                    )}
                    {sw.canCreate && (
                        <Menu.Item icon={Plus} onSelect={sw.openAdd}>
                            Aggiungi una sede
                        </Menu.Item>
                    )}
                </>
            )}
            {tenants.length > 1 && (
                <>
                    {sw.ready && <Menu.Separator />}
                    <Menu.Label>
                        <Text as="span" variant="caption-xs" weight={600} colorVariant="muted">
                            Aziende
                        </Text>
                    </Menu.Label>
                    {tenants.map(t => (
                        <Menu.Item
                            key={t.id}
                            icon={t.id === selectedTenantId ? Check : NoIcon}
                            onSelect={() => chooseTenant(t.id)}
                        >
                            {t.name}
                        </Menu.Item>
                    ))}
                </>
            )}
            <Menu.Separator />
            <Menu.Item icon={ArrowLeftRight} onSelect={() => navigate("/workspace")}>
                Tutte le aziende
            </Menu.Item>
        </Menu>
    );

    return (
        <>
            {collapsed ? (
                <Tooltip content={full} side="right" sideOffset={12}>
                    <span className={styles.tipAnchor}>{menu}</span>
                </Tooltip>
            ) : (
                menu
            )}
            {sw.canCreate && sw.addMounted && (
                <AddActivityDrawer open={sw.addOpen} onClose={sw.closeAdd} usedSeats={sw.activities.length} />
            )}
        </>
    );
}
