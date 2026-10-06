import { useCallback, useEffect, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { Select } from "@/components/ui/Select/Select";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { ListRow } from "@/components/ui/ListRow";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import { useToast } from "@/context/Toast/ToastContext";
import { useTenantId } from "@/context/useTenantId";
import { countStyleUsage, deleteStyle, V2Style } from "@/services/supabase/styles";
import { listAppearanceSources } from "@/services/supabase/layoutScheduling";
import { toRomeDateTime } from "@/services/supabase/schedulingNow";
import { appearanceOf, buildAppearance, type AppearanceRuleEntry } from "@/utils/ruleAppearance";
import { SCHEDULE_STATUS_META } from "@/utils/scheduleStatus";
import drawerStyles from "./StyleDeleteDrawer.module.scss";

const MAX_VISIBLE_SCHEDULES = 10;

type StyleDeleteDrawerProps = {
    open: boolean;
    onClose: () => void;
    styleData: V2Style | null;
    allStyles: V2Style[];
    onSuccess: () => void;
};

/**
 * Elimina uno stile (docs/patterns/delete-drawer.md, Pattern C). Uno stile
 * che non veste nessuna regola si conferma in un `ConfirmDialog`; uno in uso
 * chiede prima lo stile che lo sostituisce nelle regole, e quella scelta è un
 * campo obbligatorio: vive in un drawer `sm`, non in un dialogo di conferma.
 */
export function StyleDeleteDrawer({ open, onClose, styleData, allStyles, onSuccess }: StyleDeleteDrawerProps) {
    const { showToast } = useToast();
    const currentTenantId = useTenantId();
    const [isDeleting, setIsDeleting] = useState(false);
    const [replacementId, setReplacementId] = useState<string>("");
    // Le regole che lo nominano, con lo stato di Programmazione (§50.13/5).
    const [schedulesUsing, setSchedulesUsing] = useState<AppearanceRuleEntry[] | null>(null);
    const [isLoadingUsage, setIsLoadingUsage] = useState(false);
    // Il conteggio dell'elenco è una foto: all'apertura si rilegge il vincolo
    // che `deleteStyle` controlla. Finché non arriva, «Elimina» aspetta.
    const [usageCount, setUsageCount] = useState<number | null>(null);

    const isUsed = (usageCount ?? styleData?.usage_count ?? 0) > 0;

    const replacementOptions = allStyles
        .filter(s => s.id !== styleData?.id)
        .map(s => ({ value: s.id, label: s.name }));

    const loadUsage = useCallback(async (): Promise<void> => {
        if (!styleData || !currentTenantId) return;
        setIsLoadingUsage(true);
        try {
            const sources = await listAppearanceSources(currentTenantId);
            const index = buildAppearance({ ...sources, instant: toRomeDateTime(new Date()), subscriptionInactive: false });
            setSchedulesUsing(appearanceOf(index, { kind: "style", id: styleData.id }).rules);
        } catch (err) {
            console.warn("[StyleDeleteDrawer] usage fetch failed:", err);
            setSchedulesUsing([]);
        } finally {
            setIsLoadingUsage(false);
        }
    }, [styleData, currentTenantId]);

    useEffect(() => {
        if (!open || !styleData || !currentTenantId) {
            setUsageCount(null);
            return;
        }
        let cancelled = false;
        countStyleUsage(styleData.id, currentTenantId)
            .then(count => {
                if (!cancelled) setUsageCount(count);
            })
            .catch(err => {
                // Senza conteggio resta la foto dell'elenco: `deleteStyle` ricontrolla.
                console.warn("[StyleDeleteDrawer] usage count failed:", err);
                if (!cancelled) setUsageCount(styleData.usage_count ?? 0);
            });
        return () => {
            cancelled = true;
        };
    }, [open, styleData, currentTenantId]);

    useEffect(() => {
        if (!open || !styleData) {
            setReplacementId("");
            setSchedulesUsing(null);
            setIsDeleting(false);
            return;
        }
        if (!isUsed) {
            setSchedulesUsing([]);
            return;
        }
        void loadUsage();
    }, [open, styleData, isUsed, loadUsage]);

    const handleDelete = async (): Promise<boolean> => {
        if (!styleData) return false;
        if (isUsed && !replacementId) return false;
        setIsDeleting(true);
        try {
            await deleteStyle(styleData.id, currentTenantId!, isUsed ? replacementId : undefined);
            showToast({
                message: isUsed ? "Stile eliminato: le sue regole usano lo stile scelto." : "Stile eliminato.",
                type: "success"
            });
            onSuccess();
            onClose();
            return true;
        } catch (error) {
            console.error("Errore nell'eliminazione dello stile:", error);
            showToast({ message: "Impossibile eliminare lo stile. Riprova più tardi.", type: "error" });
            return false;
        } finally {
            setIsDeleting(false);
        }
    };

    if (!styleData) return null;

    if (!isUsed) {
        return (
            <ConfirmDialog
                isOpen={open}
                onClose={onClose}
                onConfirm={handleDelete}
                title={`Eliminare «${styleData.name}»?`}
                message="Si eliminano anche tutte le sue versioni, e non si torna indietro."
                confirmLabel="Elimina stile"
                isLoading={usageCount === null || isDeleting}
            />
        );
    }

    const blocking = schedulesUsing ?? [];
    const visibleSchedules = blocking.slice(0, MAX_VISIBLE_SCHEDULES);
    const hiddenCount = blocking.length - visibleSchedules.length;
    return (
        <SystemDrawer open={open} onClose={isDeleting ? () => undefined : onClose} size="sm">
            <DrawerLayout
                header={<Text variant="title-sm" weight={600}>Elimina stile</Text>}
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={isDeleting}>
                            Annulla
                        </Button>
                        <Button
                            variant="danger"
                            onClick={() => void handleDelete()}
                            loading={isDeleting}
                            disabled={isDeleting || isLoadingUsage || !replacementId}
                        >
                            Elimina stile
                        </Button>
                    </>
                }
            >
                <div className={drawerStyles.body}>
                    <Text variant="body-sm">
                        «{styleData.name}» veste queste regole. Scegli lo stile che le vestirà al suo posto:
                        poi lo stile e le sue versioni si eliminano, e non si torna indietro.
                    </Text>

                    <Select
                        label="Sostituisci con"
                        required
                        value={replacementId}
                        onChange={e => setReplacementId(e.target.value)}
                        options={[{ value: "", label: "Scegli uno stile" }, ...replacementOptions]}
                    />

                    <div className={drawerStyles.rules} role="list" aria-label="Regole che usano lo stile">
                        {isLoadingUsage ? (
                            <Skeleton height="56px" />
                        ) : (
                            <>
                                {visibleSchedules.map(({ rule, status }) => {
                                    const meta = SCHEDULE_STATUS_META[status];
                                    return (
                                        <ListRow
                                            key={rule.id}
                                            to={`/business/${currentTenantId}/scheduling/${rule.id}`}
                                            title={rule.name ?? "Regola senza nome"}
                                            meta={<StatusBadge variant={meta.tone} label={meta.label} />}
                                            metaInline
                                        />
                                    );
                                })}
                                {hiddenCount > 0 && (
                                    <ListRow
                                        to={`/business/${currentTenantId}/scheduling`}
                                        title={`Altre ${hiddenCount} ${hiddenCount === 1 ? "regola" : "regole"}`}
                                        muted
                                    />
                                )}
                            </>
                        )}
                    </div>
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
