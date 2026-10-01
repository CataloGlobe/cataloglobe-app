import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { Select } from "@/components/ui/Select/Select";
import { StatusBadge, type StatusBadgeVariant } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import {
    dismissCrmAccountSuggestion,
    linkCrmAccount,
    listCrmAccountSuggestions,
    listCrmLinkableTenants,
    unlinkCrmAccount,
    type CrmAccountSuggestion,
    type CrmLinkableTenant
} from "@/services/supabase/crm";
import { crmErrorMessage } from "@/utils/crm/stages";
import styles from "./Crm.module.scss";

/**
 * Account CataloGlobe del locale.
 *
 * Il telefono identico collega da solo (job crm-sync-accounts, ogni 15
 * minuti); email o nome uguali arrivano qui come proposta da confermare o
 * scartare. Collegato l'account, la fase segue l'abbonamento: In prova con la
 * prova, Cliente pagante col primo pagamento. Scollegare non sposta la fase e
 * impedisce al job di ricollegare lo stesso account.
 */

const STATUS_LABEL: Record<string, { label: string; variant: StatusBadgeVariant }> = {
    trialing: { label: "In prova", variant: "warning" },
    active: { label: "Attivo", variant: "success" },
    suspended: { label: "Senza abbonamento", variant: "neutral" },
    canceled: { label: "Disdetto", variant: "danger" }
};

const REASON_LABEL: Record<CrmAccountSuggestion["reason"], string> = {
    email: "Stessa email",
    name: "Stesso nome"
};

type Props = {
    venueId: string;
    tenantId: string | null;
    linkSource: "phone_auto" | "manual" | null;
    onChanged: () => Promise<void> | void;
};

export function AccountCard({ venueId, tenantId, linkSource, onChanged }: Props) {
    const [tenants, setTenants] = useState<CrmLinkableTenant[]>([]);
    const [suggestions, setSuggestions] = useState<CrmAccountSuggestion[]>([]);
    const [manualTenant, setManualTenant] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isBusy, setIsBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const [allTenants, open] = await Promise.all([
                listCrmLinkableTenants(),
                listCrmAccountSuggestions(venueId)
            ]);
            setTenants(allTenants);
            setSuggestions(open);
        } catch (err) {
            setError(crmErrorMessage(err));
        }
    }, [venueId]);

    useEffect(() => {
        void load();
    }, [load, tenantId]);

    const tenantById = useMemo(() => new Map(tenants.map(t => [t.id, t])), [tenants]);

    async function run(action: () => Promise<void>) {
        setIsBusy(true);
        setError(null);
        try {
            await action();
            await load();
            await onChanged();
        } catch (err) {
            setError(crmErrorMessage(err));
        } finally {
            setIsBusy(false);
        }
    }

    const linked = tenantId ? tenantById.get(tenantId) : null;
    const status = linked ? STATUS_LABEL[linked.subscription_status] : null;

    return (
        <Card
            title="Account CataloGlobe"
            badge={
                tenantId ? (
                    <StatusBadge
                        variant={status?.variant ?? "neutral"}
                        label={status?.label ?? "Collegato"}
                    />
                ) : undefined
            }
            flush
        >
            {error && (
                <div className={styles.cardPadding}>
                    <InlineBanner variant="error">{error}</InlineBanner>
                </div>
            )}

            {tenantId ? (
                <ListRow
                    title={linked?.name ?? "Azienda non trovata"}
                    subtitle={
                        linkSource === "phone_auto"
                            ? "Collegato da solo: stesso telefono"
                            : "Collegato a mano"
                    }
                    trailing={
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void run(() => unlinkCrmAccount(venueId))}
                            disabled={isBusy}
                        >
                            Scollega
                        </Button>
                    }
                />
            ) : (
                <>
                    {suggestions.map(suggestion => (
                        <ListRow
                            key={suggestion.id}
                            title={tenantById.get(suggestion.tenant_id)?.name ?? "Azienda"}
                            subtitle={`Possibile account · ${REASON_LABEL[suggestion.reason]}`}
                            trailingWrap
                            trailing={
                                <div className={styles.headerActions}>
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        onClick={() =>
                                            void run(() => linkCrmAccount(venueId, suggestion.tenant_id))
                                        }
                                        disabled={isBusy}
                                    >
                                        Collega
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() =>
                                            void run(() => dismissCrmAccountSuggestion(suggestion.id))
                                        }
                                        disabled={isBusy}
                                    >
                                        Non è lui
                                    </Button>
                                </div>
                            }
                        />
                    ))}
                    <div className={styles.cardPadding}>
                        <Text variant="body-sm" colorVariant="muted">
                            Nessun account collegato. Se si registra con lo stesso telefono si collega
                            da solo.
                        </Text>
                        <div className={styles.inlineField}>
                            <Select
                                label="Collega a mano"
                                value={manualTenant}
                                onChange={e => setManualTenant(e.target.value)}
                                options={[
                                    { value: "", label: "Scegli un'azienda" },
                                    ...tenants.map(t => ({ value: t.id, label: t.name }))
                                ]}
                                disabled={isBusy}
                            />
                            <Button
                                variant="secondary"
                                onClick={() => void run(() => linkCrmAccount(venueId, manualTenant))}
                                disabled={isBusy || !manualTenant}
                            >
                                Collega
                            </Button>
                        </div>
                    </div>
                </>
            )}
        </Card>
    );
}
