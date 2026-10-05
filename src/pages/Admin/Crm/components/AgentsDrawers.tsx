import { useEffect, useState } from "react";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { Button } from "@/components/ui/Button/Button";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { TextInput } from "@/components/ui/Input/TextInput";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import type { CrmAgentSettings, CrmBrandRules, CrmBrandRulesStatus } from "@/types/crm";
import { crmAgentErrorMessage, formatUsdInput, parseUsdCap } from "@/utils/crm/agentLabels";
import { formatDateTimeIt } from "@/utils/formatDateTime";
import { updateCrmAgentSettings } from "@/services/supabase/crmAgents";
import styles from "../Agents.module.scss";

const CAPS_FORM = "crm-spend-caps";

/** «Cambia i tetti»: mese e giorno in dollari, all'80% l'avviso, al tetto la pausa. */
export function SpendCapsDrawer({
    settings,
    onClose,
    onSaved
}: {
    settings: CrmAgentSettings | null;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [month, setMonth] = useState("");
    const [day, setDay] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!settings) return;
        setMonth(formatUsdInput(settings.ai_month_cap_usd));
        setDay(formatUsdInput(settings.ai_day_cap_usd));
        setError(null);
    }, [settings]);

    async function handleSubmit() {
        const m = parseUsdCap(month);
        const d = parseUsdCap(day);
        if (m === null || d === null) {
            setError("Scrivi due importi in dollari maggiori di zero, come 100 o 12,50 (al massimo 10.000).");
            return;
        }
        if (d > m) {
            setError("Il tetto di oggi non può superare quello del mese.");
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await updateCrmAgentSettings({ ai_month_cap_usd: m, ai_day_cap_usd: d });
            onSaved();
        } catch (err) {
            setError(crmAgentErrorMessage(err));
        } finally {
            setSaving(false);
        }
    }

    return (
        <SystemDrawer open={settings !== null} onClose={onClose} size="sm">
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Tetti di spesa AI
                    </Text>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose} disabled={saving}>
                            Annulla
                        </Button>
                        <Button variant="primary" type="submit" form={CAPS_FORM} loading={saving}>
                            Salva
                        </Button>
                    </>
                }
            >
                <form
                    id={CAPS_FORM}
                    className={styles.drawerForm}
                    noValidate
                    onSubmit={e => {
                        e.preventDefault();
                        void handleSubmit();
                    }}
                >
                    {error && <InlineBanner variant="error">{error}</InlineBanner>}
                    <TextInput
                        label="Tetto del mese ($)"
                        inputMode="decimal"
                        value={month}
                        onChange={e => setMonth(e.target.value)}
                        disabled={saving}
                    />
                    <TextInput
                        label="Tetto di oggi ($)"
                        inputMode="decimal"
                        value={day}
                        onChange={e => setDay(e.target.value)}
                        disabled={saving}
                    />
                    <Text variant="caption" colorVariant="muted">
                        All'80% arriva un avviso su Telegram; al tetto gli agenti vanno in pausa da soli. Giorno e mese secondo l'ora di
                        Roma.
                    </Text>
                </form>
            </DrawerLayout>
        </SystemDrawer>
    );
}

const RULES_STATUS: Record<CrmBrandRulesStatus, { label: string; variant: "success" | "warning" | "neutral" }> = {
    draft: { label: "Da approvare", variant: "warning" },
    approved: { label: "In vigore", variant: "success" },
    retired: { label: "Ritirata", variant: "neutral" },
    discarded: { label: "Scartata", variant: "neutral" }
};

/**
 * «Regole del brand» dalla testata: la versione in vigore e le altre. Aprire
 * una versione, o proporne una nuova, passa al drawer della singola versione.
 */
export function BrandRulesListDrawer({
    open,
    rules,
    error,
    teamName,
    onClose,
    onOpen,
    onPropose
}: {
    open: boolean;
    rules: CrmBrandRules[] | null;
    error: string | null;
    teamName: (userId: string | null) => string;
    onClose: () => void;
    onOpen: (rules: CrmBrandRules) => void;
    onPropose: (initialBody: string) => void;
}) {
    const approved = rules?.find(r => r.status === "approved") ?? null;
    const others = rules?.filter(r => r.status !== "approved") ?? [];
    return (
        <SystemDrawer open={open} onClose={onClose} size="md">
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Regole del brand
                    </Text>
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose}>
                            Chiudi
                        </Button>
                        <Button variant="primary" onClick={() => onPropose(approved?.body ?? "")} disabled={rules === null}>
                            Nuova versione
                        </Button>
                    </>
                }
            >
                <div className={styles.drawerForm}>
                    {error && <InlineBanner variant="error">{error}</InlineBanner>}
                    {rules && !approved && (
                        <EmptyState
                            variant="inline"
                            title="Nessuna regola in vigore"
                            description="Gli agenti non scrivono a nessuno finché una versione non è approvata."
                        />
                    )}
                    {approved && (
                        <>
                            <div className={styles.rulesHead}>
                                <Text variant="body-sm" weight={700}>
                                    Versione {approved.version}
                                </Text>
                                <StatusBadge variant="success" label="In vigore" />
                            </div>
                            <Text variant="body-sm" className={styles.preWrap}>
                                {approved.body}
                            </Text>
                            <Text variant="caption" colorVariant="muted">
                                Approvata da {teamName(approved.approved_by)}
                                {approved.approved_at ? ` · ${formatDateTimeIt(approved.approved_at)}` : ""}
                            </Text>
                        </>
                    )}
                </div>
                {others.map(version => (
                    <ListRow
                        key={version.id}
                        title={`Versione ${version.version}`}
                        subtitle={version.note ?? undefined}
                        meta={`${formatDateTimeIt(version.created_at)} · ${teamName(version.created_by)}`}
                        trailing={<StatusBadge variant={RULES_STATUS[version.status].variant} label={RULES_STATUS[version.status].label} />}
                        onClick={() => onOpen(version)}
                    />
                ))}
            </DrawerLayout>
        </SystemDrawer>
    );
}
