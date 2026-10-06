import { BarList } from "@/components/ui/BarList/BarList";
import Text from "@/components/ui/Text/Text";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { CRM_AI_ROLE_LABEL, formatAiCost, spendShare } from "@shared/crmAi";
import type { CrmAiRole, CrmAiSpend } from "@/types/crm";
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
                    {spend ? formatAiCost(spend.dayUsd) : "—"}
                </Text>
                {spend && (
                    <Text as="span" variant="body-sm" colorVariant="muted">
                        di {formatAiCost(spend.dayCap)}
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

/**
 * Spesa AI del mese (A2): la classifica per agente, poi mese e oggi sui loro
 * tetti e quanto costa un messaggio. Conversazione comprende Solleciti e
 * Riattivazione, che usano lo stesso conto.
 */
export function SpendCard({
    spend,
    monthByRole,
    perMessage,
    now,
    onCaps
}: {
    spend: CrmAiSpend | null;
    monthByRole: Record<CrmAiRole, number> | null;
    perMessage: number | null;
    now: Date;
    onCaps: () => void;
}) {
    const month = MONTH.format(now);
    const ranking = monthByRole
        ? (Object.keys(monthByRole) as CrmAiRole[])
              .map(role => ({ role, usd: monthByRole[role] }))
              .filter(r => r.usd > 0)
              .sort((a, b) => b.usd - a.usd)
        : [];
    const warn = spend !== null && (spendShare(spend.dayUsd, spend.dayCap) >= 0.8 || spendShare(spend.monthUsd, spend.monthCap) >= 0.8);
    return (
        <section className={styles.spendBox} aria-labelledby="agenti-spesa">
            <div className={styles.boxHead}>
                <Text as="h2" id="agenti-spesa" variant="body-sm" weight={700}>
                    Spesa AI, {month}
                </Text>
                <button type="button" className={styles.linkButton} onClick={onCaps} disabled={!spend}>
                    <Text as="span" variant="body-sm" color="inherit">
                        Cambia i tetti
                    </Text>
                </button>
            </div>
            <div className={styles.spendRows}>
                {monthByRole && ranking.length === 0 ? (
                    <Text variant="body-sm" colorVariant="muted">
                        Ancora nessuna chiamata a Claude questo mese.
                    </Text>
                ) : (
                    <BarList
                        aria-label={`Spesa AI di ${month} per agente`}
                        loading={!monthByRole}
                        items={ranking.map(r => ({
                            id: r.role,
                            label: CRM_AI_ROLE_LABEL[r.role],
                            value: r.usd,
                            valueLabel: formatAiCost(r.usd)
                        }))}
                    />
                )}
                {ranking.some(r => r.role === "conversation") && (
                    <Text variant="caption" colorVariant="muted">
                        Conversazione comprende Solleciti e Riattivazione.
                    </Text>
                )}
            </div>
            {spend && (
                <div className={styles.spendFoot} data-warn={warn || undefined}>
                    <Text as="span" variant="body-sm" colorVariant="muted">
                        Totale{" "}
                        <Text as="span" variant="body-sm" weight={700} color="inherit" className={styles.spendStrong}>
                            {formatAiCost(spend.monthUsd)} di {formatAiCost(spend.monthCap)}
                        </Text>{" "}
                        · oggi{" "}
                        <Text as="span" variant="body-sm" weight={700} color="inherit" className={styles.spendStrong}>
                            {formatAiCost(spend.dayUsd)} di {formatAiCost(spend.dayCap)}
                        </Text>{" "}
                        · a messaggio{" "}
                        <Text as="span" variant="body-sm" weight={700} color="inherit" className={styles.spendStrong}>
                            {perMessage === null ? "—" : formatAiCost(perMessage, 3)}
                        </Text>
                    </Text>
                </div>
            )}
        </section>
    );
}
