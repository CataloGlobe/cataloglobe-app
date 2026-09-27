import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { ConfirmDialogShell } from "@/components/ui/ConfirmDialog/ConfirmDialogShell";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { useTenantId } from "@/context/useTenantId";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { deleteCatalog, type V2Catalog } from "@/services/supabase/catalogs";
import { listAppearanceSources } from "@/services/supabase/layoutScheduling";
import { toRomeDateTime } from "@/services/supabase/schedulingNow";
import { appearanceOf, buildAppearance, type AppearanceRuleEntry } from "@/utils/ruleAppearance";
import { SCHEDULE_STATUS_META } from "@/utils/scheduleStatus";
import { isPostgrestFKError } from "@/utils/supabaseErrors";

const MAX_VISIBLE_SCHEDULES = 10;

interface CatalogDeleteDialogProps {
    isOpen: boolean;
    onClose: () => void;
    catalog: V2Catalog | null;
    tenantId: string;
    onSuccess: () => void | Promise<void>;
}

/**
 * Eliminazione di un menù (#241): `ConfirmDialog` con l'impatto. Prima di
 * chiedere conferma si leggono le regole di programmazione che lo usano; se
 * ce n'è anche una il menù non si elimina, e il dialogo le elenca con il loro
 * link invece di offrire «Elimina». Il comportamento è quello del drawer che
 * sostituisce, compreso il caso in cui la lettura fallisce (#242, PR a parte).
 * Lo stato di ogni regola è quello di Programmazione, da `ruleAppearance.ts`
 * (§50.13/5): una seconda derivazione qui mentirebbe (§34.3).
 */
export function CatalogDeleteDialog({ isOpen, onClose, catalog, tenantId, onSuccess }: CatalogDeleteDialogProps) {
    const { showToast } = useToast();
    const businessId = useTenantId();
    const { catalogLabel, categoryLabelPlural, productLabelPlural } = useVerticalConfig();
    const [schedulesUsing, setSchedulesUsing] = useState<AppearanceRuleEntry[] | null>(null);
    const [isLoadingUsage, setIsLoadingUsage] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadUsage = useCallback(async (): Promise<void> => {
        if (!catalog) return;
        setIsLoadingUsage(true);
        try {
            const sources = await listAppearanceSources(tenantId);
            const index = buildAppearance({ ...sources, instant: toRomeDateTime(new Date()), subscriptionInactive: false });
            setSchedulesUsing(appearanceOf(index, { kind: "catalog", id: catalog.id }).rules);
        } catch (err) {
            console.error("Errore caricamento regole bloccanti:", err);
            setSchedulesUsing([]);
            showToast({ message: "Impossibile verificare l'utilizzo, procedi con cautela.", type: "error" });
        } finally {
            setIsLoadingUsage(false);
        }
    }, [tenantId, catalog, showToast]);

    useEffect(() => {
        setError(null);
        if (!isOpen || !catalog) {
            setSchedulesUsing(null);
            setIsDeleting(false);
            return;
        }
        void loadUsage();
    }, [isOpen, catalog, loadUsage]);

    const handleDelete = async (): Promise<void> => {
        if (!catalog || (schedulesUsing && schedulesUsing.length > 0)) return;
        setIsDeleting(true);
        setError(null);
        try {
            await deleteCatalog(catalog.id, tenantId);
            showToast({ message: `${catalogLabel} eliminato.`, type: "success" });
            await onSuccess();
            onClose();
        } catch (err) {
            if (isPostgrestFKError(err)) {
                setError(`Una regola creata da poco usa questo ${catalogLabel.toLowerCase()}: l'elenco è aggiornato.`);
                await loadUsage();
            } else {
                console.error("Errore eliminazione catalogo:", err);
                setError("Eliminazione non riuscita. Riprova.");
            }
        } finally {
            setIsDeleting(false);
        }
    };

    if (!catalog) return null;

    const blocking = schedulesUsing ?? [];
    const hasBlocking = blocking.length > 0;
    const visible = blocking.slice(0, MAX_VISIBLE_SCHEDULES);
    const hiddenCount = blocking.length - visible.length;
    const hasLive = blocking.some(entry => entry.isLive);
    const rules = (n: number) => `${n} ${n === 1 ? "regola" : "regole"}`;
    const catalogLower = catalogLabel.toLowerCase();

    return (
        <ConfirmDialogShell
            isOpen={isOpen}
            onClose={onClose}
            locked={isDeleting}
            title={`Eliminare «${catalog.name}»?`}
            message={`Si eliminano anche le sue ${categoryLabelPlural.toLowerCase()} e i collegamenti ai ${productLabelPlural.toLowerCase()}, e non si torna indietro. I ${productLabelPlural.toLowerCase()} restano.`}
            error={error}
            footer={
                <>
                    <Button variant="secondary" size="sm" onClick={onClose} disabled={isDeleting} data-autofocus>
                        Annulla
                    </Button>
                    <Button
                        variant="danger"
                        size="sm"
                        onClick={handleDelete}
                        loading={isDeleting}
                        disabled={isLoadingUsage || hasBlocking}
                    >
                        Elimina
                    </Button>
                </>
            }
        >
            {isLoadingUsage && (
                <Text variant="body-sm" colorVariant="muted">
                    Verifico le regole di programmazione…
                </Text>
            )}
            {!isLoadingUsage && hasBlocking && (
                <>
                    <InlineBanner variant={hasLive ? "warning" : "info"}>
                        {hasLive
                            ? `Questo ${catalogLower} è usato da ${rules(blocking.length)}. Rimuovi i collegamenti prima di eliminarlo.`
                            : `Questo ${catalogLower} è collegato a ${rules(blocking.length)} ferme (spente, in bozza o scadute). Rimuovi i collegamenti prima di eliminarlo.`}
                    </InlineBanner>
                    <div role="list" aria-label="Regole di programmazione collegate">
                        {visible.map(({ rule, status }) => {
                            const meta = SCHEDULE_STATUS_META[status];
                            return (
                                <div role="listitem" key={rule.id}>
                                    <ListRow
                                        dense
                                        to={`/business/${businessId}/scheduling/${rule.id}`}
                                        title={rule.name ?? "Regola senza nome"}
                                        trailing={<StatusBadge variant={meta.tone} label={meta.label} />}
                                    />
                                </div>
                            );
                        })}
                        {hiddenCount > 0 && (
                            <div role="listitem">
                                <ListRow
                                    dense
                                    to={`/business/${businessId}/scheduling`}
                                    title={`Altre ${rules(hiddenCount)}…`}
                                />
                            </div>
                        )}
                    </div>
                </>
            )}
        </ConfirmDialogShell>
    );
}
