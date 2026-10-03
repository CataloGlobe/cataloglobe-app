import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Check, ChevronsUpDown, Plus, Store } from "lucide-react";
import { Menu } from "@/components/ui/Menu/Menu";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import { AddActivityDrawer } from "@/components/Businesses/AddActivityDrawer/AddActivityDrawer";
import { usePermissions } from "@/context/usePermissions";
import { usePlanFeatures } from "@/lib/planFeatures";
import { useSedeScope } from "@/hooks/useSedeScope";
import { useActivitySummary } from "@/hooks/useActivitySummary";
import { useAddActivityGate } from "@/hooks/useAddActivityGate";
import { resolveNavContext, switchSedePath } from "@/utils/navModel";
import styles from "./HeaderSedeSwitcher.module.scss";

/** `/business/:businessId/locations/:activityId[/:segment]` — dentro una sede. */
const SEDE_PATH = /^\/business\/[^/]+\/locations\/([^/]+)(?:\/([^/?#]+))?/;

const ALL_LABEL = "Tutte le sedi";

/** Lo spazio dell'icona per le voci senza spunta: i nomi restano in colonna. */
function NoIcon() {
    return <span className={styles.iconSpacer} aria-hidden="true" />;
}

/**
 * Il selettore di sede nell'header, sempre (§51.7): dice dove sei e porta
 * altrove.
 * - Una sede: il suo nome; nel menu la sede e «Aggiungi una sede».
 * - Più sedi, fuori da una sede: «Tutte le sedi»; scegliere una sede ci entra.
 * - Più sedi, dentro una sede: il suo nome; scegliere un'altra sede resta
 *   sulla stessa pagina, o atterra come entrando se lì non si può usare.
 * Accanto alla sede solo «Sospesa»: «Pubblicata» resta nella Scheda.
 * Nessuna sede leggibile: niente segmento.
 */
export function HeaderSedeSwitcher() {
    const { businessId = "" } = useParams<{ businessId: string }>();
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const { permissions } = usePermissions();
    const { hasFeature } = usePlanFeatures();
    const { readableActivities, isLoaded } = useSedeScope();
    const { canCreate, tryOpen } = useAddActivityGate();
    const [addOpen, setAddOpen] = useState(false);

    const match = SEDE_PATH.exec(pathname);
    const pathActivityId = match?.[1] ?? null;
    const pathSegment = match?.[2] ?? null;
    // Una sede fuori dall'elenco leggibile (link vecchio, sede appena creata
    // altrove): il nome arriva comunque dalla cache.
    const pathSummary = useActivitySummary(pathActivityId ?? undefined);

    if (!isLoaded || readableActivities.length === 0) return null;

    const context = resolveNavContext(readableActivities.length, pathActivityId !== null);
    const currentId = context === "unica" ? readableActivities[0].id : context === "sede" ? pathActivityId : null;
    const current = currentId ? readableActivities.find(a => a.id === currentId) ?? null : null;
    const label = currentId ? current?.name ?? pathSummary?.name ?? "" : ALL_LABEL;
    const suspended = currentId ? (current?.status ?? pathSummary?.status) === "inactive" : false;

    const choose = (id: string) => {
        if (id === currentId) return;
        if (context === "sede" && permissions) {
            navigate(switchSedePath(pathSegment, businessId, id, permissions, hasFeature));
            return;
        }
        // Si entra nella sede: dove si atterra lo decide l'indice della sede.
        navigate(`/business/${businessId}/locations/${id}`);
    };

    const openAdd = () => {
        if (tryOpen()) setAddOpen(true);
    };

    const trigger = (
        <button
            type="button"
            className={styles.trigger}
            aria-label={`Sede: ${label}${suspended ? " · Sospesa" : ""}`}
        >
            <Store size={14} aria-hidden="true" className={styles.storeIcon} />
            <Text as="span" variant="body-sm" weight={600} className={styles.name}>
                {label}
            </Text>
            {suspended && <StatusBadge variant="neutral" label="Sospesa" />}
            <ChevronsUpDown size={13} aria-hidden="true" className={styles.chevron} />
        </button>
    );

    return (
        <>
            <span className={styles.separator} aria-hidden="true">
                /
            </span>
            <Menu trigger={trigger}>
                {readableActivities.map(a => (
                    <Menu.Item
                        key={a.id}
                        icon={a.id === currentId ? Check : NoIcon}
                        onSelect={() => choose(a.id)}
                        description={a.status === "inactive" ? "Sospesa" : undefined}
                    >
                        {a.name}
                    </Menu.Item>
                ))}
                {(canCreate || context !== "unica") && <Menu.Separator />}
                {canCreate && (
                    <Menu.Item icon={Plus} onSelect={openAdd}>
                        Aggiungi una sede
                    </Menu.Item>
                )}
                {context !== "unica" && (
                    <Menu.Item icon={NoIcon} onSelect={() => navigate(`/business/${businessId}/locations`)}>
                        {ALL_LABEL}
                    </Menu.Item>
                )}
            </Menu>
            {canCreate && (
                <AddActivityDrawer
                    open={addOpen}
                    onClose={() => setAddOpen(false)}
                    usedSeats={readableActivities.length}
                />
            )}
        </>
    );
}
