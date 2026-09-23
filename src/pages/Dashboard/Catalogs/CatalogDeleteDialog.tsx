import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { ConfirmDialogShell } from "@/components/ui/ConfirmDialog/ConfirmDialogShell";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { StatusBadge, type StatusBadgeVariant } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import { useToast } from "@/context/Toast/ToastContext";
import { useTenantId } from "@/context/useTenantId";
import { useVerticalConfig } from "@/hooks/useVerticalConfig";
import { deleteCatalog, type V2Catalog } from "@/services/supabase/catalogs";
import {
    listSchedulesUsingCatalog,
    type CatalogScheduleUsage
} from "@/services/supabase/layoutScheduling";
import { isPostgrestFKError } from "@/utils/supabaseErrors";

const MAX_VISIBLE_SCHEDULES = 10;

type ScheduleStatus = "active" | "scheduled" | "expired" | "disabled";

const STATUS: Record<ScheduleStatus, { label: string; variant: StatusBadgeVariant }> = {
    active: { label: "Attiva", variant: "success" },
    scheduled: { label: "Programmata", variant: "info" },
    expired: { label: "Scaduta", variant: "neutral" },
    disabled: { label: "Disabilitata", variant: "neutral" }
};

function deriveScheduleStatus(rule: CatalogScheduleUsage, now: Date): ScheduleStatus {
    if (!rule.enabled) return "disabled";
    if (rule.end_at !== null && new Date(rule.end_at) < now) return "expired";
    if (rule.start_at !== null && new Date(rule.start_at) > now) return "scheduled";
    return "active";
}

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
 */
export function CatalogDeleteDialog({ isOpen, onClose, catalog, tenantId, onSuccess }: CatalogDeleteDialogProps) {
    const { showToast } = useToast();
    const businessId = useTenantId();
    const { catalogLabel, categoryLabelPlural, productLabelPlural } = useVerticalConfig();
    const [schedulesUsing, setSchedulesUsing] = useState<CatalogScheduleUsage[] | null>(null);
    const [isLoadingUsage, setIsLoadingUsage] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadUsage = useCallback(async (): Promise<void> => {
        if (!catalog) return;
        setIsLoadingUsage(true);
        try {
            setSchedulesUsing(await listSchedulesUsingCatalog(tenantId, catalog.id));
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

    const now = new Date();
    const blocking = schedulesUsing ?? [];
    const hasBlocking = blocking.length > 0;
    const visible = blocking.slice(0, MAX_VISIBLE_SCHEDULES);
    const hiddenCount = blocking.length - visible.length;
    const hasLive = blocking.some(rule => {
        const status = deriveScheduleStatus(rule, now);
        return status === "active" || status === "scheduled";
    });
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
                            : `Questo ${catalogLower} è collegato a ${rules(blocking.length)} disabilitate o scadute. Rimuovi i collegamenti prima di eliminarlo.`}
                    </InlineBanner>
                    <div role="list" aria-label="Regole di programmazione collegate">
                        {visible.map(rule => {
                            const status = STATUS[deriveScheduleStatus(rule, now)];
                            return (
                                <div role="listitem" key={rule.id}>
                                    <ListRow
                                        dense
                                        to={`/business/${businessId}/scheduling/${rule.id}`}
                                        title={rule.name ?? "Regola senza nome"}
                                        trailing={<StatusBadge variant={status.variant} label={status.label} />}
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
