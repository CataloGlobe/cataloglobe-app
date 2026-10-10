import { useId } from "react";
import { TextInput } from "@/components/ui/Input/TextInput";
import { SediBottone } from "@/components/ui/SediPannello/SediPannello";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import { LayoutRuleOption } from "@/services/supabase/layoutScheduling";
import styles from "../ProgrammingRuleDetail.module.scss";

export type TargetMode = "all" | "activities" | "groups";

interface TargetSectionProps {
    name: string;
    targetMode: TargetMode;
    activityIds: string[];
    groupIds: string[];
    tenantActivities: LayoutRuleOption[];
    tenantGroups: LayoutRuleOption[];
    /** Le sedi di ogni gruppo: un gruppo intero preso nel pannello è il gruppo. */
    groupMembers: ReadonlyMap<string, string[]> | null;
    onFormChange: (
        updates: Partial<{
            name: string;
            targetMode: TargetMode;
            activityIds: string[];
            groupIds: string[];
        }>
    ) => void;
    /** Errore del nome (`validateRuleForm`), sotto il campo. */
    nameError?: string;
    onNameBlur?: () => void;
    /** Falso per i ruoli di sede: «Tutte le sedi» è di owner e admin (T9b). */
    allowAllSites?: boolean;
}

// ─── TargetSection ─────────────────────────────────────────────────────────────

export function TargetSection({
    name,
    targetMode,
    activityIds,
    groupIds,
    tenantActivities,
    tenantGroups,
    groupMembers,
    onFormChange,
    nameError,
    onNameBlur,
    allowAllSites = true
}: TargetSectionProps) {
    const hid = useId();
    const sedi = tenantActivities.map(activity => ({ id: activity.id, name: activity.name }));
    const gruppi = tenantGroups.map(group => ({ id: group.id, name: group.name, sedeIds: groupMembers?.get(group.id) ?? [] }));
    const known = new Set(sedi.map(sede => sede.id));
    const ids =
        targetMode === "all"
            ? sedi.map(sede => sede.id)
            : targetMode === "groups"
              ? sedi.map(sede => sede.id).filter(id => gruppi.some(g => groupIds.includes(g.id) && g.sedeIds.includes(id)))
              : activityIds.filter(id => known.has(id));
    const suspended = new Set(tenantActivities.filter(activity => activity.status === "inactive").map(activity => activity.id));
    const many = (k: number) => `${k} ${k === 1 ? "sede" : "sedi"}`;
    const label =
        targetMode === "all"
            ? `Tutte le sedi · ${sedi.length}, anche le nuove`
            : targetMode === "groups" && groupIds.length
              ? groupIds.map(id => "«" + (tenantGroups.find(g => g.id === id)?.name ?? "gruppo") + "»").join(", ") + ` · ${many(ids.length)}`
              : undefined;

    // D151: tutte prese = tutte, anche quelle che si aggiungeranno; un gruppo intero = il gruppo, anche chi ci entrerà
    const pick = (next: string[]) => {
        if (allowAllSites && sedi.length > 1 && next.length === sedi.length) return onFormChange({ targetMode: "all", activityIds: [], groupIds: [] });
        const g = gruppi.find(x => x.sedeIds.length > 1 && x.sedeIds.length === next.length && x.sedeIds.every(id => next.includes(id)));
        onFormChange(g ? { targetMode: "groups", activityIds: [], groupIds: [g.id] } : { targetMode: "activities", activityIds: next, groupIds: [] });
    };

    return (
        // `id`: «Modifica sedi» della barra della regola condivisa ci porta qui (PG7).
        <section id="rule-targets" className={styles.sectionCard}>
            <Text as="h3" variant="title-sm">
                Dove si applica
            </Text>

            <TextInput
                id="rule-field-name"
                label="Nome"
                value={name}
                onChange={event => onFormChange({ name: event.target.value })}
                onBlur={onNameBlur}
                error={nameError}
                required
            />

            <div className={styles.targetField} role="group" aria-labelledby={hid}>
                <Text id={hid} variant="body-sm" weight={600}>
                    Si applica a
                </Text>
                <SediBottone
                    className={styles.targetButton}
                    sedi={sedi}
                    gruppi={gruppi}
                    value={ids}
                    onChange={pick}
                    future={allowAllSites}
                    tag={id => (suspended.has(id) ? <StatusBadge variant="neutral" label="Sospesa" /> : null)}
                >
                    {label}
                </SediBottone>
                <Text variant="body-sm" colorVariant="muted">
                    {targetMode === "all"
                        ? "Vale anche per le sedi che aprirai."
                        : targetMode === "groups"
                          ? "Vale anche per le sedi che entreranno nel gruppo."
                          : ids.length
                            ? "Quello che vale per una sede vince su quello che vale per tutte."
                            : "Nessuna sede scelta."}
                </Text>
            </div>
        </section>
    );
}
