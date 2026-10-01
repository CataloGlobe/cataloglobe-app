import { useCallback, useEffect, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { TextInput } from "@/components/ui/Input/TextInput";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { RadioGroup } from "@/components/ui/RadioGroup/RadioGroup";
import { Switch } from "@/components/ui/Switch/Switch";
import Text from "@/components/ui/Text/Text";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { useAuth } from "@/context/useAuth";
import { useToast } from "@/context/Toast/ToastContext";
import {
    getCrmSettings,
    listCrmTeamMembers,
    setCrmDefaultAssignee,
    setCrmReceivesEscalations,
    startCrmTelegramLink,
    updateCrmSettings
} from "@/services/supabase/crm";
import type { CrmTeamMember } from "@/types/crm";
import styles from "./Crm.module.scss";

/**
 * Impostazioni del CRM: chi lavora i lead, come lo avvisa il bot, il testo
 * del messaggio WhatsApp pronto.
 *
 * Ogni persona si collega da sola: «Collega Telegram» crea la sua riga del
 * team e apre il bot con un token monouso (15 minuti); il bot salva la chat.
 * Qui si sceglie a chi va il lead nuovo (uno solo) e chi riceve i solleciti
 * dei lead fermi in Nuovo (decisione 2026-10-01: Alex di default, sollecito
 * anche a Lorenzo). Ogni scelta si salva subito.
 *
 * Il messaggio WhatsApp lo manda Alex a mano: parla come Alessandro di
 * CataloGlobe, non come Gea (decisione 2026-10-01).
 */

type Props = {
    open: boolean;
    onClose: () => void;
    onChanged: () => void;
};

const BOT_USERNAME_RE = /^[A-Za-z0-9_]{5,32}$/;

export function SettingsDrawer({ open, onClose, onChanged }: Props) {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [team, setTeam] = useState<CrmTeamMember[]>([]);
    const [botUsername, setBotUsername] = useState("");
    const [savedBotUsername, setSavedBotUsername] = useState<string | null>(null);
    const [displayName, setDisplayName] = useState("");
    const [template, setTemplate] = useState("");
    const [savedTemplate, setSavedTemplate] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isBusy, setIsBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const [members, settings] = await Promise.all([listCrmTeamMembers(), getCrmSettings()]);
            setTeam(members);
            setSavedBotUsername(settings.telegram_bot_username);
            setBotUsername(settings.telegram_bot_username ?? "");
            setTemplate(settings.whatsapp_template ?? "");
            setSavedTemplate(settings.whatsapp_template ?? "");
            const me = members.find(m => m.user_id === user?.id);
            setDisplayName(prev => prev || me?.display_name || "");
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    }, [user?.id]);

    useEffect(() => {
        if (!open) return;
        setError(null);
        void load();
    }, [open, load]);

    async function run(action: () => Promise<void>, success?: string) {
        setIsBusy(true);
        setError(null);
        try {
            await action();
            await load();
            onChanged();
            if (success) showToast({ message: success, type: "success" });
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsBusy(false);
        }
    }

    async function handleLink() {
        const name = displayName.trim();
        if (!name) {
            setError("Scrivi il nome con cui comparire nei messaggi.");
            return;
        }
        if (!savedBotUsername) {
            setError("Prima salva il nome del bot.");
            return;
        }
        // La finestra si apre prima della chiamata: aperta dopo un await,
        // Safari la bloccherebbe come popup.
        const popup = window.open("about:blank", "_blank");
        await run(async () => {
            try {
                const token = await startCrmTelegramLink(name);
                const url = `https://t.me/${savedBotUsername}?start=${token}`;
                if (popup) popup.location.href = url;
                else window.location.href = url;
            } catch (err) {
                popup?.close();
                throw err;
            }
        });
    }

    const me = team.find(m => m.user_id === user?.id);
    const defaultAssignee = team.find(m => m.is_default_assignee)?.user_id ?? "";

    return (
        <SystemDrawer open={open} onClose={onClose} size="md">
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Impostazioni del CRM
                    </Text>
                }
                footer={
                    <Button variant="secondary" onClick={onClose}>
                        Chiudi
                    </Button>
                }
            >
                <div className={styles.drawerForm}>
                    {error && <InlineBanner variant="error">{error}</InlineBanner>}

                    <div className={styles.inlineField}>
                        <TextInput
                            label="Bot Telegram"
                            helperText="Il nome del bot senza @. Il token resta solo sul server."
                            value={botUsername}
                            onChange={e => setBotUsername(e.target.value.replace(/^@/, ""))}
                            disabled={isBusy}
                        />
                        <Button
                            variant="secondary"
                            onClick={() =>
                                void run(
                                    () => updateCrmSettings({ telegram_bot_username: botUsername.trim() }),
                                    "Bot salvato."
                                )
                            }
                            disabled={
                                isBusy ||
                                !BOT_USERNAME_RE.test(botUsername.trim()) ||
                                botUsername.trim() === savedBotUsername
                            }
                        >
                            Salva
                        </Button>
                    </div>

                    <div className={styles.inlineField}>
                        <TextInput
                            label="Il tuo nome nei messaggi"
                            helperText={
                                me?.telegram_chat_id
                                    ? "Telegram collegato. Ricollegati se cambi telefono."
                                    : "Dopo il clic, premi Avvia nel bot."
                            }
                            maxLength={60}
                            value={displayName}
                            onChange={e => setDisplayName(e.target.value)}
                            disabled={isBusy}
                        />
                        <Button variant="primary" onClick={() => void handleLink()} disabled={isBusy}>
                            {me?.telegram_chat_id ? "Ricollega" : "Collega Telegram"}
                        </Button>
                    </div>

                    <div className={styles.drawerForm}>
                        <Textarea
                            label="Messaggio WhatsApp pronto"
                            helperText="{nome} diventa il nome della persona, {locale} il nome del locale. Lo mandi tu, come Alessandro di CataloGlobe."
                            rows={7}
                            maxLength={1000}
                            value={template}
                            onChange={e => setTemplate(e.target.value)}
                            disabled={isBusy}
                        />
                        <div className={styles.noteActions}>
                            <Button
                                variant="secondary"
                                onClick={() =>
                                    void run(
                                        () =>
                                            updateCrmSettings({
                                                whatsapp_template: template.trim() || null
                                            }),
                                        "Messaggio salvato."
                                    )
                                }
                                disabled={isBusy || template === savedTemplate}
                            >
                                Salva messaggio
                            </Button>
                        </div>
                    </div>

                    {team.length > 0 && (
                        <>
                            <RadioGroup
                                label="Lead nuovi assegnati a"
                                value={defaultAssignee}
                                onChange={value =>
                                    void run(() => setCrmDefaultAssignee(value), "Assegnatario salvato.")
                                }
                                options={team.map(m => ({ value: m.user_id, label: m.display_name }))}
                                disabled={isBusy}
                            />

                            <div>
                                <Text variant="body-sm" weight={600}>
                                    Team
                                </Text>
                                {team.map(member => (
                                    <ListRow
                                        key={member.user_id}
                                        title={member.display_name}
                                        subtitle={
                                            member.telegram_chat_id
                                                ? "Telegram collegato"
                                                : "Telegram non collegato"
                                        }
                                        trailing={
                                            <Switch
                                                label="Solleciti"
                                                checked={member.receives_escalations}
                                                onChange={value =>
                                                    void run(() =>
                                                        setCrmReceivesEscalations(member.user_id, value)
                                                    )
                                                }
                                                disabled={isBusy}
                                                size="sm"
                                            />
                                        }
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
