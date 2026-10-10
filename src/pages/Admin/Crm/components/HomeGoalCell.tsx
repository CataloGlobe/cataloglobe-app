import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button/Button";
import { NumberInput } from "@/components/ui/Input/NumberInput";
import { ProgressBar } from "@/components/ui/ProgressBar/ProgressBar";
import Text from "@/components/ui/Text/Text";
import { setCrmWeeklyGoal } from "@/services/supabase/crmGoals";
import { crmErrorMessage } from "@/utils/crm/stages";
import styles from "../Home.module.scss";

/**
 * «Obiettivo della settimana»: telefonate fissate da lunedì contro il numero
 * scelto dal team (`crm_weekly_goals`). Si sceglie e si cambia qui, in riga.
 */
export function HomeGoalCell({
    weekStart,
    done,
    target,
    unavailable,
    userId,
    onSaved
}: {
    weekStart: string;
    /** Telefonate fissate da lunedì; null se non si sono caricate. */
    done: number | null;
    target: number | null;
    /** Frase italiana quando la tabella non c'è ancora. */
    unavailable: string | null;
    userId: string | null;
    onSaved: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const startEdit = () => {
        setValue(String(target ?? 5));
        setEditing(true);
    };

    const save = async (e: FormEvent) => {
        e.preventDefault();
        const n = Number(value);
        if (!userId || !Number.isInteger(n) || n < 1 || n > 200) {
            setError("Scegli un numero da 1 a 200.");
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await setCrmWeeklyGoal(weekStart, n, userId);
            setEditing(false);
            onSaved();
        } catch (err) {
            setError(crmErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={styles.goal}>
            <Text as="span" variant="caption" colorVariant="muted">
                Obiettivo della settimana
            </Text>
            {unavailable ? (
                <Text as="span" variant="body-sm" colorVariant="muted">
                    {unavailable}
                </Text>
            ) : editing ? (
                <form noValidate className={styles.goalForm} onSubmit={e => void save(e)}>
                    <NumberInput
                        aria-label="Telefonate da fissare questa settimana"
                        min={1}
                        max={200}
                        value={value}
                        onChange={e => setValue(e.target.value)}
                        containerClassName={styles.goalInput}
                        autoFocus
                    />
                    <Button type="submit" variant="primary" size="sm" loading={saving}>
                        Salva
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
                        Annulla
                    </Button>
                    {error && (
                        <Text as="span" variant="caption" colorVariant="error" role="alert" className={styles.goalError}>
                            {error}
                        </Text>
                    )}
                </form>
            ) : target === null ? (
                <span className={styles.goalLine}>
                    <Text as="span" variant="body-sm">
                        {done ?? "—"} telefonate fissate
                    </Text>
                    <button type="button" className={styles.inlineLink} onClick={startEdit}>
                        <Text as="span" variant="caption">Fissa l'obiettivo</Text>
                    </button>
                </span>
            ) : (
                <>
                    <span className={styles.goalLine}>
                        <Text as="span" variant="body-sm">
                            <strong>
                                {done ?? "—"} di {target}
                            </strong>{" "}
                            telefonate fissate
                        </Text>
                        <button type="button" className={styles.inlineLink} onClick={startEdit}>
                            <Text as="span" variant="caption">Cambia</Text>
                        </button>
                    </span>
                    <ProgressBar
                        value={Math.min(done ?? 0, target)}
                        max={target}
                        inline
                        label={`${Math.min(100, Math.round(((done ?? 0) / target) * 100))}%`}
                        aria-label={`${done ?? 0} telefonate fissate su ${target}`}
                    />
                </>
            )}
        </div>
    );
}
