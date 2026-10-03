import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button/Button";
import { Card } from "@/components/ui/Card/Card";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { useToast } from "@/context/Toast/ToastContext";
import { countCrmQueuedMessages, getCrmWaChannel, getCrmWaSettings } from "@/services/supabase/crmWhatsappAgent";
import { channelHealth } from "@/utils/crm/waLabels";
import { formatDateTimeIt } from "@/utils/formatDateTime";
import type { CrmWaChannel, CrmWaSettings } from "@/types/crm";
import { WhatsappSettingsDrawer } from "./WhatsappSettingsDrawer";

/**
 * Pagina Agenti: il Mac di WhatsApp Web (F1-2). Salute del canale (battito,
 * stato di WhatsApp Web, invii falliti di fila), coda, primo messaggio
 * automatico e prova. La pausa è quella della card in cima: il canale ci
 * mette gli agenti da solo quando qualcosa non va.
 */
export function WhatsappChannelCard() {
    const { showToast } = useToast();
    const [channel, setChannel] = useState<CrmWaChannel | null>(null);
    const [settings, setSettings] = useState<CrmWaSettings | null>(null);
    const [queued, setQueued] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);

    const load = useCallback(async () => {
        try {
            const [nextChannel, nextSettings, nextQueued] = await Promise.all([
                getCrmWaChannel(),
                getCrmWaSettings(),
                countCrmQueuedMessages()
            ]);
            setChannel(nextChannel);
            setSettings(nextSettings);
            setQueued(nextQueued);
            setError(null);
        } catch {
            setError("Non riesco a leggere lo stato di WhatsApp. Ricarica la pagina.");
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const health = channelHealth(channel);
    const firstMessageOn = Boolean(settings?.wa_first_message);

    return (
        <Card
            title="Canale WhatsApp"
            flush
            badge={<StatusBadge variant={health.variant} label={health.label} />}
            actions={
                <Button variant="secondary" size="sm" onClick={() => setDrawerOpen(true)} disabled={!settings}>
                    Impostazioni
                </Button>
            }
        >
            {error && <InlineBanner variant="error">{error}</InlineBanner>}
            <ListRow
                title="Mac di WhatsApp Web"
                subtitle={health.detail}
                wrapSubtitle
                meta={channel?.last_heartbeat_at ? `Ultimo segnale ${formatDateTimeIt(channel.last_heartbeat_at)}` : undefined}
            />
            <ListRow
                title="Primo messaggio automatico"
                subtitle={
                    firstMessageOn
                        ? "Acceso: parte da solo ai lead nuovi dei moduli Meta e della landing."
                        : "Spento: nessun primo messaggio parte da solo."
                }
                wrapSubtitle
            />
            <ListRow
                title="Solo numeri di prova"
                subtitle={
                    settings?.wa_test_only
                        ? `Acceso: l'agente scrive solo a ${settings.wa_test_numbers.length} ${
                              settings.wa_test_numbers.length === 1 ? "numero" : "numeri"
                          } di prova.`
                        : "Spento: l'agente scrive ai lead veri."
                }
                wrapSubtitle
            />
            <ListRow
                title="In coda"
                subtitle={queued === 0 ? "Nessun messaggio da mandare." : `${queued} ${queued === 1 ? "messaggio" : "messaggi"} da mandare.`}
            />
            <WhatsappSettingsDrawer
                settings={drawerOpen ? settings : null}
                onClose={() => setDrawerOpen(false)}
                onSaved={async () => {
                    await load();
                    setDrawerOpen(false);
                    showToast({ message: "Impostazioni di WhatsApp salvate.", type: "success" });
                }}
            />
        </Card>
    );
}
