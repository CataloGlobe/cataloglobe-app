import { Fragment, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronRight, Info } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import type { CrmAiRole } from "@/types/crm";
import type { AgentRow } from "@/utils/crm/agentsOverview";
import { formatAiCost } from "@shared/crmAi";
import { MixBar } from "./AgentsParts";
import styles from "../Agents.module.scss";

/**
 * La tabella degli agenti (U2, ritocco R1 variante A): righe fisse, dense,
 * senza pagine. Il passo scelto nel giro accende le sue righe finché non se ne
 * sceglie un altro (la tabella del design system ha solo il lampo che svanisce).
 * Un gesto per riga: la riga (e il nome, che è il bottone vero) apre la pagina
 * dell'agente (A2), e al passaggio si accende «Apri ›». La «i», piccola e
 * grigia, apre «Come funziona» sotto la riga senza uscire. Il passo e il
 * lavoro di oggi stanno sotto il nome: una colonna in meno.
 */
export function AgentsTable({
    rows,
    highlighted,
    spend,
    openId,
    onToggle,
    onOpen,
    renderPanel
}: {
    rows: AgentRow[];
    highlighted: string[];
    spend: Record<CrmAiRole, number> | null;
    openId: AgentRow["id"] | null;
    onToggle: (id: AgentRow["id"]) => void;
    onOpen: (id: AgentRow["id"]) => void;
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
                    <th scope="col">
                        <Text as="span" variant="caption" colorVariant="muted" weight={600}>
                            Stato
                        </Text>
                    </th>
                    <th scope="col" className={styles.hidePhone}>
                        <Text as="span" variant="caption" colorVariant="muted" weight={600}>
                            Inviate così
                        </Text>
                    </th>
                    <th scope="col" className={`${styles.hidePhone} ${styles.numCol}`}>
                        <Text as="span" variant="caption" colorVariant="muted" weight={600}>
                            Spesa oggi
                        </Text>
                    </th>
                    <th scope="col">
                        <span className="visually-hidden">Azioni</span>
                    </th>
                </tr>
            </thead>
            <tbody>
                {rows.map(r => {
                    const on = highlighted.includes(r.id);
                    const open = openId === r.id;
                    const canOpen = r.id !== "sentinella";
                    return (
                        <Fragment key={r.id}>
                            <tr
                                data-on={on || undefined}
                                data-opens={canOpen || undefined}
                                aria-current={on ? "step" : undefined}
                                onClick={canOpen ? () => onOpen(r.id) : undefined}
                            >
                                <th scope="row">
                                    {canOpen ? (
                                        <button
                                            type="button"
                                            className={styles.agentName}
                                            aria-label={`Apri la pagina di ${r.name}`}
                                            onClick={e => {
                                                e.stopPropagation();
                                                onOpen(r.id);
                                            }}
                                        >
                                            <Text as="span" variant="body-sm" weight={700} color="inherit">
                                                {r.name}
                                            </Text>
                                        </button>
                                    ) : (
                                        <Text as="span" variant="body-sm" weight={700}>
                                            {r.name}
                                        </Text>
                                    )}
                                    <Text as="span" variant="caption" colorVariant="muted" className={styles.agentSub}>
                                        {r.id === "sentinella" ? "Sicurezza e bug di CataloGlobe" : `${r.step === null ? "Fuori dal giro" : `Passo ${r.step}`} · ${r.today}`}
                                    </Text>
                                </th>
                                <td>
                                    <StatusBadge variant={r.tone} label={r.status} />
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
                                <td className={`${styles.hidePhone} ${styles.numCol}`}>
                                    <Text as="span" variant="body-sm" colorVariant={r.spendShared ? "muted" : undefined}>
                                        {r.spendShared || !r.role || !spend ? "—" : formatAiCost(spend[r.role])}
                                    </Text>
                                </td>
                                <td className={styles.guideCell}>
                                    {r.id === "sentinella" ? (
                                        <Text as="span" variant="caption" colorVariant="muted" className={styles.hidePhone}>
                                            Si accende quando lo decidete
                                        </Text>
                                    ) : (
                                        <span className={styles.rowActions}>
                                            <button
                                                type="button"
                                                className={styles.infoToggle}
                                                aria-label={`Come funziona: ${r.name}`}
                                                aria-expanded={open}
                                                aria-controls={`agente-pannello-${r.id}`}
                                                data-open={open || undefined}
                                                onClick={e => {
                                                    e.stopPropagation();
                                                    onToggle(r.id);
                                                }}
                                            >
                                                <Info size={14} aria-hidden="true" />
                                            </button>
                                            <span className={styles.openHint} aria-hidden="true">
                                                <Text as="span" variant="body-sm" weight={600} color="inherit" className={styles.openHintLabel}>
                                                    Apri
                                                </Text>
                                                <ChevronRight size={16} />
                                            </span>
                                        </span>
                                    )}
                                </td>
                            </tr>
                            <AnimatePresence initial={false}>
                                {open && (
                                    <tr key="pannello" className={styles.panelRow}>
                                        <td colSpan={5} id={`agente-pannello-${r.id}`}>
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
