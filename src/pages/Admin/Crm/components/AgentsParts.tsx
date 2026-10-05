import { ChevronRight } from "lucide-react";
import { ProgressBar } from "@/components/ui/ProgressBar/ProgressBar";
import Text from "@/components/ui/Text/Text";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { CRM_MESSAGE_STEPS } from "@shared/crmGuide";
import { formatUsd, spendShare } from "@shared/crmAi";
import type { CrmAiSpend } from "@/types/crm";
import type { DraftMix, GiroToday } from "@/utils/crm/agentsOverview";
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

const STEP_COUNT: Record<number, (g: GiroToday) => string> = {
    1: () => "dai lead",
    2: g => (g.written === 1 ? "1 bozza" : `${g.written} bozze`),
    3: g => `${g.reviewed} ${g.reviewed === 1 ? "riletta" : "rilette"}, ${g.stopped} ${g.stopped === 1 ? "fermata" : "fermate"}`,
    4: g => (g.waiting === 0 ? "niente in attesa" : `${g.waiting} ${g.waiting === 1 ? "aspetta" : "aspettano"} · ${g.oldestWait}`),
    5: g => (g.sent === 1 ? "1 inviato" : `${g.sent} inviati`)
};

/**
 * Il giro di un messaggio, oggi (U2): cinque passi in fila; cliccandone uno
 * nella tabella si accende chi lo fa. Il passo 4 prende il filo del colore
 * dell'attesa più vecchia.
 */
export function GiroStrip({
    giro,
    selected,
    onSelect
}: {
    giro: GiroToday | null;
    selected: number | null;
    onSelect: (step: number | null) => void;
}) {
    return (
        <section className={styles.giroBox} aria-labelledby="agenti-giro">
            <div className={styles.giroHead}>
                <Text as="h2" id="agenti-giro" variant="body-sm" weight={700}>
                    Il giro di un messaggio, oggi
                </Text>
                <Text as="span" variant="caption" colorVariant="muted">
                    clicca un passo: si accende chi lo fa
                </Text>
            </div>
            <ol className={styles.giroSteps}>
                {CRM_MESSAGE_STEPS.map((step, index) => (
                    <li key={step.step} className={styles.giroItem}>
                        <button
                            type="button"
                            className={styles.giroButton}
                            data-selected={selected === step.step}
                            data-level={step.step === 4 && giro && giro.waiting > 0 ? giro.oldestLevel : undefined}
                            aria-pressed={selected === step.step}
                            onClick={() => onSelect(selected === step.step ? null : step.step)}
                        >
                            <span className={styles.giroNumber} aria-hidden="true">
                                {step.step}
                            </span>
                            <span className={styles.giroText}>
                                <Text as="span" variant="body" weight={700}>
                                    {step.title}
                                </Text>
                                <Text as="span" variant="caption" className={styles.giroCount}>
                                    {giro ? STEP_COUNT[step.step](giro) : "—"}
                                </Text>
                            </span>
                        </button>
                        {index < CRM_MESSAGE_STEPS.length - 1 && <ChevronRight size={14} className={styles.giroArrow} aria-hidden="true" />}
                    </li>
                ))}
            </ol>
            {selected === 4 && (
                <Text variant="caption" colorVariant="muted">
                    Il passo 4 siete voi: le bozze in attesa si decidono nella scheda del lead o su Telegram.
                </Text>
            )}
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
