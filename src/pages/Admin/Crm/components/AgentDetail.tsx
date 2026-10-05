import { useState, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import Text from "@/components/ui/Text/Text";
import type { AgentActivityItem, AgentDetailData } from "@/utils/crm/agentDetail";
import type { AgentRow } from "@/utils/crm/agentsOverview";
import { formatAiCost } from "@shared/crmAi";
import styles from "../Agents.module.scss";

const MONTH = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", month: "long" });

export function ActivityList({ items, empty }: { items: AgentActivityItem[]; empty: string }) {
    if (items.length === 0) {
        return (
            <Text variant="body-sm" colorVariant="muted" className={styles.activityEmpty}>
                {empty}
            </Text>
        );
    }
    return (
        <ul className={styles.detailRows}>
            {items.map(item => (
                <li key={item.key} className={styles.detailRow} data-when={item.when ? true : undefined}>
                    {item.when && (
                        <Text as="span" variant="caption" colorVariant="muted" className={styles.activityWhen}>
                            {item.when}
                        </Text>
                    )}
                    <span className={styles.activityText}>
                        <Text as="span" variant="body-sm">
                            {item.text}
                        </Text>
                        {item.sub && (
                            <Text as="span" variant="caption" colorVariant="muted" className={styles.detailSub}>
                                {item.sub}
                            </Text>
                        )}
                    </span>
                    <Text as="span" variant="caption" weight={600} color="inherit" className={styles.giroTag} data-tone={item.tone}>
                        {item.tag}
                    </Text>
                </li>
            ))}
        </ul>
    );
}

/**
 * La pagina di un agente (canvas A2): torna agli agenti, nome e stato, quattro
 * numeri, cosa ha in corso e cosa ha fatto oggi, la spesa degli ultimi sette
 * giorni, e in fondo come funziona coi suoi comandi. I numeri li fa `agentDetail`.
 */
export function AgentDetail({
    row,
    data,
    loading,
    now,
    panel,
    onBack
}: {
    row: AgentRow;
    data: AgentDetailData | null;
    loading: boolean;
    now: Date;
    /** «Come funziona» coi comandi dell'agente. */
    panel: ReactNode;
    onBack: () => void;
}) {
    // Finché non si sceglie: «In corso» se c'è qualcosa, altrimenti «Fatti oggi».
    const [picked, setTab] = useState<"current" | "done" | null>(null);
    const tab = picked ?? (data && data.current.length > 0 ? "current" : "done");
    const kpis = data?.kpis ?? Array.from({ length: 4 }, () => ({ label: "", value: "…" }));
    const month = MONTH.format(now);
    const weekTotal = data ? data.week.reduce((sum, d) => sum + d.usd, 0) : 0;

    return (
        <div className={styles.detail}>
            <button type="button" className={styles.linkButton} onClick={onBack}>
                <ChevronLeft size={16} aria-hidden="true" />
                <Text as="span" variant="body-sm" color="inherit">
                    Agenti
                </Text>
            </button>

            <header className={styles.detailHead}>
                <Text as="h2" variant="title-sm" weight={700}>
                    {row.name}
                </Text>
                <StatusBadge variant={row.tone} label={row.status} />
            </header>

            <dl className={styles.kpis}>
                {kpis.map((k, i) => (
                    <div key={i} className={styles.kpi}>
                        <Text as="dt" variant="caption" colorVariant="muted">
                            {k.label || "…"}
                        </Text>
                        <Text as="dd" variant="title-sm" weight={700} className={styles.kpiValue}>
                            {k.value}
                        </Text>
                    </div>
                ))}
            </dl>

            <div className={styles.detailBottom}>
                <section className={styles.activity} aria-label={`Lavoro di ${row.name}`}>
                    <Tabs value={tab} onChange={setTab} variant="line">
                        <Tabs.List aria-label={`Lavoro di ${row.name}`}>
                            <Tabs.Tab value="current" badge={data?.current.length || undefined}>
                                In corso
                            </Tabs.Tab>
                            <Tabs.Tab value="done" badge={data?.done.length || undefined}>
                                Fatti oggi
                            </Tabs.Tab>
                        </Tabs.List>
                        <Tabs.Panel value="current">
                            <ActivityList items={data?.current ?? []} empty={loading ? "Carico…" : "Niente in corso."} />
                        </Tabs.Panel>
                        <Tabs.Panel value="done">
                            <ActivityList items={data?.done ?? []} empty={loading ? "Carico…" : "Niente ancora oggi."} />
                        </Tabs.Panel>
                    </Tabs>
                </section>

                <section className={styles.spendBox} aria-labelledby="agente-spesa">
                    <div className={styles.boxHead}>
                        <Text as="h3" id="agente-spesa" variant="body-sm" weight={700}>
                            Spesa, ultimi 7 giorni
                        </Text>
                        <Text as="span" variant="body-sm" weight={600}>
                            {row.role ? formatAiCost(weekTotal) : "—"}
                        </Text>
                    </div>
                    {row.role ? (
                        <>
                            <ol className={styles.week}>
                                {(data?.week ?? []).map(d => (
                                    <li key={d.day} className={styles.weekDay}>
                                        <span className={styles.weekTrack} aria-hidden="true">
                                            <span
                                                className={styles.weekBar}
                                                data-level={d.level}
                                                data-today={d.label === "oggi" || undefined}
                                            />
                                        </span>
                                        <Text as="span" variant="caption" colorVariant="muted">
                                            {d.label}
                                        </Text>
                                        <span className="visually-hidden">{formatAiCost(d.usd)}</span>
                                    </li>
                                ))}
                            </ol>
                            <div className={styles.spendFoot}>
                                <Text as="span" variant="body-sm">
                                    {data?.monthUsd != null ? `${formatAiCost(data.monthUsd)} a ${month}` : "…"}
                                    {data?.perUnit ? ` · ${data.perUnit}` : ""}
                                </Text>
                            </div>
                            {data?.sharedNote && (
                                <Text as="p" variant="caption" colorVariant="muted" className={styles.detailNote}>
                                    {data.sharedNote}
                                </Text>
                            )}
                        </>
                    ) : (
                        <Text as="p" variant="body-sm" colorVariant="muted" className={styles.detailNote}>
                            Non usa Claude: nessuna spesa AI.
                        </Text>
                    )}
                </section>
            </div>

            <div className={styles.detailPanel}>{panel}</div>
        </div>
    );
}
