import { Fragment, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import type { CrmAiRole } from "@/types/crm";
import type { AgentRow } from "@/utils/crm/agentsOverview";
import { formatUsd } from "@shared/crmAi";
import { MixBar } from "./AgentsParts";
import styles from "../Agents.module.scss";

/**
 * La tabella degli agenti (U2): sei righe fisse, dense, senza pagine. Il passo
 * scelto nel giro accende le sue righe finché non se ne sceglie un altro (la
 * tabella del design system ha solo il lampo che svanisce). «Come funziona ▾»
 * apre il pannello dell'agente subito sotto la sua riga.
 */
export function AgentsTable({
    rows,
    highlighted,
    spend,
    openId,
    onToggle,
    renderPanel
}: {
    rows: AgentRow[];
    highlighted: string[];
    spend: Record<CrmAiRole, number> | null;
    openId: AgentRow["id"] | null;
    onToggle: (id: AgentRow["id"]) => void;
    renderPanel: (row: AgentRow) => ReactNode;
}) {
    const reduceMotion = useReducedMotion();
    return (
        <table className={styles.table}>
            <thead>
                <tr>
                    <th scope="col">
                        <Text as="span" variant="caption" colorVariant="muted" weight={600}>
                            Agente
                        </Text>
                    </th>
                    <th scope="col" className={styles.hidePhone}>
                        <Text as="span" variant="caption" colorVariant="muted" weight={600}>
                            Passo
                        </Text>
                    </th>
                    <th scope="col">
                        <Text as="span" variant="caption" colorVariant="muted" weight={600}>
                            Stato
                        </Text>
                    </th>
                    <th scope="col" className={styles.hidePhone}>
                        <Text as="span" variant="caption" colorVariant="muted" weight={600}>
                            Oggi
                        </Text>
                    </th>
                    <th scope="col" className={styles.hidePhone}>
                        <Text as="span" variant="caption" colorVariant="muted" weight={600}>
                            Inviate così
                        </Text>
                    </th>
                    <th scope="col" className={styles.hidePhone}>
                        <Text as="span" variant="caption" colorVariant="muted" weight={600}>
                            Spesa oggi
                        </Text>
                    </th>
                    <th scope="col">
                        <span className="visually-hidden">Come funziona</span>
                    </th>
                </tr>
            </thead>
            <tbody>
                {rows.map(r => {
                    const on = highlighted.includes(r.id);
                    const open = openId === r.id;
                    return (
                        <Fragment key={r.id}>
                            <tr data-on={on || undefined} aria-current={on ? "step" : undefined}>
                                <th scope="row">
                                    <Text as="span" variant="body-sm" weight={700}>
                                        {r.name}
                                    </Text>
                                    <Text as="span" variant="caption" colorVariant="muted" className={styles.showPhone}>
                                        {r.today}
                                    </Text>
                                </th>
                                <td className={`${styles.hidePhone} ${styles.stepCell}`} data-out={r.step === null || undefined}>
                                    <Text as="span" variant="body-sm" color="inherit">
                                        {r.step ?? "fuori"}
                                    </Text>
                                </td>
                                <td>
                                    <StatusBadge variant={r.tone} label={r.status} />
                                </td>
                                <td className={styles.hidePhone}>
                                    <Text as="span" variant="body-sm">
                                        {r.today}
                                    </Text>
                                </td>
                                <td className={styles.hidePhone}>
                                    {r.id === "conversazione" || r.id === "solleciti" ? (
                                        <MixBar mix={r.mix} name={r.name} />
                                    ) : (
                                        <Text as="span" variant="body-sm" colorVariant="muted">
                                            —
                                        </Text>
                                    )}
                                </td>
                                <td className={styles.hidePhone}>
                                    <Text as="span" variant="body-sm" colorVariant={r.spendShared ? "muted" : undefined}>
                                        {r.spendShared || !r.role || !spend ? "—" : formatUsd(spend[r.role])}
                                    </Text>
                                </td>
                                <td className={styles.guideCell}>
                                    <button
                                        type="button"
                                        className={styles.guideToggle}
                                        aria-label={`Come funziona: ${r.name}`}
                                        aria-expanded={open}
                                        aria-controls={`agente-pannello-${r.id}`}
                                        onClick={() => onToggle(r.id)}
                                    >
                                        <Text as="span" variant="body-sm" color="inherit" className={styles.guideLabel}>
                                            Come funziona
                                        </Text>
                                        <ChevronDown size={14} aria-hidden="true" data-open={open} />
                                    </button>
                                </td>
                            </tr>
                            <AnimatePresence initial={false}>
                                {open && (
                                    <tr key="pannello" className={styles.panelRow}>
                                        <td colSpan={7} id={`agente-pannello-${r.id}`}>
                                            <motion.div
                                                className={styles.panelOpen}
                                                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                                                animate={reduceMotion ? { opacity: 1 } : { opacity: 1, height: "auto" }}
                                                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                                                transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.2, 0.9, 0.25, 1] }}
                                            >
                                                {renderPanel(r)}
                                            </motion.div>
                                        </td>
                                    </tr>
                                )}
                            </AnimatePresence>
                        </Fragment>
                    );
                })}
            </tbody>
        </table>
    );
}
