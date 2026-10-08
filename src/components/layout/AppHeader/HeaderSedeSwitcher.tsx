import { Check, ChevronsUpDown, Plus, Store } from "lucide-react";
import { Menu } from "@/components/ui/Menu/Menu";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import { AddActivityDrawer } from "@/components/Businesses/AddActivityDrawer/AddActivityDrawer";
import { useSedeSwitcher } from "@/hooks/useSedeSwitcher";
import styles from "./HeaderSedeSwitcher.module.scss";

const ALL_LABEL = "Tutte le sedi";

/** Lo spazio dell'icona per le voci senza spunta: i nomi restano in colonna. */
function NoIcon() {
    return <span className={styles.iconSpacer} aria-hidden="true" />;
}

/**
 * Il selettore di sede nella testata (§51.7), al telefono: dice dove sei e
 * porta altrove (regole in `useSedeSwitcher`). Sul desktop lo stesso lavoro
 * lo fa `PlaceSwitcher` in cima alla sidebar.
 * Accanto alla sede solo «Sospesa»: «Pubblicata» resta nella Scheda.
 * Nessuna sede leggibile: niente segmento.
 */
export function HeaderSedeSwitcher() {
    const sw = useSedeSwitcher();
    if (!sw.ready) return null;

    const label = sw.currentName ?? ALL_LABEL;

    const trigger = (
        <button
            type="button"
            className={styles.trigger}
            aria-label={`Sede: ${label}${sw.suspended ? " · Sospesa" : ""}`}
        >
            <Store size={14} aria-hidden="true" className={styles.storeIcon} />
            <Text as="span" variant="body-sm" weight={600} className={styles.name}>
                {label}
            </Text>
            {sw.suspended && <StatusBadge variant="neutral" label="Sospesa" />}
            <ChevronsUpDown size={13} aria-hidden="true" className={styles.chevron} />
        </button>
    );

    return (
        <>
            <span className={styles.separator} aria-hidden="true">
                /
            </span>
            <Menu trigger={trigger}>
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
                {(sw.canCreate || sw.context !== "unica") && <Menu.Separator />}
                {sw.canCreate && (
                    <Menu.Item icon={Plus} onSelect={sw.openAdd}>
                        Aggiungi una sede
                    </Menu.Item>
                )}
                {sw.context !== "unica" && (
                    <Menu.Item icon={NoIcon} onSelect={sw.goToAll}>
                        {ALL_LABEL}
                    </Menu.Item>
                )}
            </Menu>
            {sw.canCreate && sw.addMounted && (
                <AddActivityDrawer open={sw.addOpen} onClose={sw.closeAdd} usedSeats={sw.activities.length} />
            )}
        </>
    );
}
