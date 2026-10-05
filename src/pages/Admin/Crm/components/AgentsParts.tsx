import { ProgressBar } from "@/components/ui/ProgressBar/ProgressBar";
import Text from "@/components/ui/Text/Text";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { formatUsd, spendShare } from "@shared/crmAi";
import type { CrmAiSpend } from "@/types/crm";
import type { DraftMix } from "@/utils/crm/agentsOverview";
import type { ChannelHealth } from "@/utils/crm/waLabels";
import styles from "../Agents.module.scss";

type Dot = "success" | "warning" | "danger" | "neutral";

const FIRST_MESSAGES_PER_DAY = 30;

/**
 * La riga di stato in cima ad Agenti (U2): agenti, WhatsApp, numeri di prova e
 * spesa di oggi in una riga sola. Ogni pezzo arriva da una lettura sua: se
 * manca, quel pezzo dice «non si legge» e gli altri restano.
 */
export function AgentsStatusLine({
    brakeOn,
    brakeReason,
    health,
    firstToday,
    queued,
    testOnly,
    spend,
    onWhatsapp
}: {
    brakeOn: boolean | null;
    brakeReason: string | null;
    health: ChannelHealth | null;
    firstToday: number | null;
    queued: number | null;
    testOnly: boolean | null;
    spend: CrmAiSpend | null;
    onWhatsapp: () => void;
}) {
    const agentsDot: Dot = brakeOn === null ? "neutral" : brakeOn ? "danger" : "success";
    const waDot: Dot = health ? (health.variant === "success" ? "success" : health.variant) : "neutral";
    const waParts = [
        health ? `WhatsApp ${health.label.toLowerCase()}` : "WhatsApp non si legge",
        firstToday !== null ? `${firstToday} di ${FIRST_MESSAGES_PER_DAY} primi messaggi` : null,
        queued ? `${queued} in coda` : null
    ].filter(Boolean);
    return (
        <section className={styles.statusLine} aria-label="Stato degli agenti">
            <span className={styles.statusItem}>
                <span className={styles.dot} data-tone={agentsDot} aria-hidden="true" />
                <Text as="span" variant="body-sm" weight={600}>
                    {brakeOn === null ? "Agenti: stato non letto" : brakeOn ? "Agenti in pausa" : "Agenti attivi"}
                </Text>
                {brakeOn && brakeReason && (
                    <Text as="span" variant="body-sm" colorVariant="muted">
                        · {brakeReason}
                    </Text>
                )}
            </span>
            <Tooltip content={health?.detail ?? "Stato del canale non letto."}>
                <button type="button" className={styles.statusButton} onClick={onWhatsapp}>
                    <span className={styles.dot} data-tone={waDot} aria-hidden="true" />
                    <Text as="span" variant="body-sm" color="inherit">
                        {waParts.join(" · ")}
                    </Text>
                </button>
            </Tooltip>
            {testOnly && (
                <span className={styles.statusItem}>
                    <span className={styles.dot} data-tone="warning" aria-hidden="true" />
                    <Text as="span" variant="body-sm">
                        Solo numeri di prova
                    </Text>
                </span>
            )}
            <span className={styles.statusSpend}>
                <Text as="span" variant="body-sm" colorVariant="muted">
                    Spesa oggi
                </Text>
                <Text as="span" variant="body-sm" weight={700}>
                    {spend ? formatUsd(spend.dayUsd) : "—"}
                </Text>
                {spend && (
                    <Text as="span" variant="body-sm" colorVariant="muted">
                        di {formatUsd(spend.dayCap)}
                    </Text>
                )}
            </span>
        </section>
    );
}

const percent = (n: number) => `${Math.round(n * 100)}%`;

/** Inviate così (verde), corrette (arancio), non mandate (grigio), con la quota delle prime. */
export function MixBar({ mix, name }: { mix: DraftMix | null; name: string }) {
    if (!mix) {
        return (
            <Text as="span" variant="body-sm" colorVariant="muted">
                nessun caso
            </Text>
        );
    }
    const label = `${name}: ${percent(mix.approved)} inviate così, ${percent(mix.edited)} corrette, ${percent(mix.discarded)} non mandate`;
    return (
        <span className={styles.mix}>
            <svg className={styles.mixBar} viewBox="0 0 100 6" preserveAspectRatio="none" role="img" aria-label={label}>
                <rect className={styles.mixTrack} x="0" y="0" width="100" height="6" rx="3" />
                <rect className={styles.mixApproved} x="0" y="0" width={mix.approved * 100} height="6" />
                <rect className={styles.mixEdited} x={mix.approved * 100} y="0" width={mix.edited * 100} height="6" />
                <rect className={styles.mixDiscarded} x={(mix.approved + mix.edited) * 100} y="0" width={mix.discarded * 100} height="6" />
            </svg>
            <Text as="span" variant="body-sm">
                {percent(mix.approved)}
            </Text>
        </span>
    );
}

const MONTH = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", month: "long" });

/** Spesa AI (U2): oggi e il mese sui loro tetti, quanto costa un messaggio. */
export function SpendCard({
    spend,
    perMessage,
    now,
    onCaps
}: {
    spend: CrmAiSpend | null;
    perMessage: number | null;
    now: Date;
    onCaps: () => void;
}) {
    const month = MONTH.format(now);
    return (
        <section className={styles.spendBox} aria-labelledby="agenti-spesa">
            <div className={styles.boxHead}>
                <Text as="h2" id="agenti-spesa" variant="body-sm" weight={700}>
                    Spesa AI
                </Text>
                <button type="button" className={styles.linkButton} onClick={onCaps} disabled={!spend}>
                    <Text as="span" variant="body-sm" color="inherit">
                        Cambia i tetti
                    </Text>
                </button>
            </div>
            {spend && (
                <>
                    <div className={styles.spendRows}>
                        <div className={styles.spendRow}>
                            <Text as="span" variant="body-sm">
                                Oggi
                            </Text>
                            <ProgressBar
                                value={spend.dayUsd}
                                max={spend.dayCap}
                                variant={spendShare(spend.dayUsd, spend.dayCap) >= 0.8 ? "warning" : "brand"}
                                aria-label="Spesa di oggi"
                                label={`${formatUsd(spend.dayUsd)} di ${formatUsd(spend.dayCap)}`}
                            />
                        </div>
                        <div className={styles.spendRow}>
                            <Text as="span" variant="body-sm">
                                {month.charAt(0).toUpperCase() + month.slice(1)}
                            </Text>
                            <ProgressBar
                                value={spend.monthUsd}
                                max={spend.monthCap}
                                variant={spendShare(spend.monthUsd, spend.monthCap) >= 0.8 ? "warning" : "brand"}
                                aria-label="Spesa del mese"
                                label={`${formatUsd(spend.monthUsd)} di ${formatUsd(spend.monthCap)}`}
                            />
                        </div>
                    </div>
                    <div className={styles.spendFoot}>
                        <Text as="span" variant="body-sm" colorVariant="muted">
                            A messaggio
                        </Text>
                        <Text as="span" variant="body-sm" weight={700}>
                            {perMessage === null ? "—" : `${perMessage.toFixed(3).replace(".", ",")} $`}
                        </Text>
                    </div>
                </>
            )}
        </section>
    );
}
