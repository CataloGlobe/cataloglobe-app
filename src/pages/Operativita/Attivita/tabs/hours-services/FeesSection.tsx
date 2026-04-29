import React, { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "@/components/ui";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Switch } from "@/components/ui/Switch/Switch";
import Text from "@/components/ui/Text/Text";
import { updateActivity } from "@/services/supabase/activities";
import type { V2Activity, ActivityFee, ActivityFeeKey } from "@/types/activity";
import { FEE_DEFINITIONS } from "@/constants/activityFees";
import { useToast } from "@/context/Toast/ToastContext";
import pageStyles from "../../ActivityDetailPage.module.scss";
import sharedStyles from "./HoursServices.module.scss";
import styles from "./FeesSection.module.scss";

interface FeesSectionProps {
    activity: V2Activity;
    tenantId: string;
    onSaved: () => void;
}

type FeesState = Record<ActivityFeeKey, string>;

const NUMERIC_INPUT_RE = /^[0-9]*[.,]?[0-9]*$/;

function feesToState(fees: ActivityFee[] | null | undefined): FeesState {
    const next: FeesState = {
        coperto: "",
        servizio: "",
        prenotazione_minima: "",
        spesa_minima: "",
        eta_minima: ""
    };
    if (!fees) return next;
    for (const fee of fees) {
        if (fee.key in next) {
            next[fee.key] = fee.value ?? "";
        }
    }
    return next;
}

function buildFeesPayload(state: FeesState): ActivityFee[] {
    return FEE_DEFINITIONS.map(def => {
        const raw = state[def.key]?.trim() ?? "";
        if (!raw || raw === "0") return null;
        return { key: def.key, value: raw };
    }).filter((x): x is ActivityFee => x !== null);
}

export const FeesSection: React.FC<FeesSectionProps> = ({
    activity,
    tenantId,
    onSaved
}) => {
    const { showToast } = useToast();
    const [fees, setFees] = useState<FeesState>(() => feesToState(activity.fees));
    const [isPublic, setIsPublic] = useState(activity.fees_public);
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    useEffect(() => {
        setFees(feesToState(activity.fees));
    }, [activity.fees]);

    useEffect(() => {
        setIsPublic(activity.fees_public);
    }, [activity.fees_public]);

    useEffect(() => {
        return () => clearTimeout(saveTimeoutRef.current);
    }, []);

    const handleChange = useCallback(
        (key: ActivityFeeKey, raw: string) => {
            const normalized = raw.replace(/\s/g, "");
            if (normalized && !NUMERIC_INPUT_RE.test(normalized)) {
                return;
            }
            setFees(prev => {
                const next: FeesState = { ...prev, [key]: normalized };
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = setTimeout(async () => {
                    try {
                        await updateActivity(activity.id, tenantId, {
                            fees: buildFeesPayload(next)
                        });
                        await onSaved();
                    } catch {
                        showToast({
                            message: "Impossibile salvare le tariffe.",
                            type: "error"
                        });
                    }
                }, 800);
                return next;
            });
        },
        [activity.id, tenantId, onSaved, showToast]
    );

    const handlePublicToggle = useCallback(
        async (checked: boolean) => {
            setIsPublic(checked);
            try {
                await updateActivity(activity.id, tenantId, {
                    fees_public: checked
                });
                await onSaved();
            } catch {
                showToast({
                    message: "Impossibile aggiornare la visibilità.",
                    type: "error"
                });
            }
        },
        [activity.id, tenantId, onSaved, showToast]
    );

    return (
        <Card className={pageStyles.card}>
            <div className={sharedStyles.cardHeader}>
                <div className={sharedStyles.headerLeft}>
                    <h3 className={sharedStyles.sectionTitle}>Tariffe</h3>
                    <Switch
                        label="Mostra nella pagina pubblica"
                        checked={isPublic}
                        onChange={handlePublicToggle}
                    />
                </div>
            </div>
            <div className={pageStyles.cardContent}>
                <div className={styles.feeList}>
                    {FEE_DEFINITIONS.map(def => (
                        <div key={def.key} className={styles.feeRow}>
                            <label
                                htmlFor={`fee-${def.key}`}
                                className={styles.feeLabel}
                            >
                                {def.label}
                            </label>
                            <div className={styles.feeInputWrap}>
                                <TextInput
                                    id={`fee-${def.key}`}
                                    type="text"
                                    inputMode="decimal"
                                    placeholder={def.placeholder}
                                    value={fees[def.key]}
                                    onChange={e => handleChange(def.key, e.target.value)}
                                    endAdornment={
                                        <span className={styles.unitBadge}>{def.unit}</span>
                                    }
                                    containerClassName={styles.feeInputContainer}
                                />
                            </div>
                        </div>
                    ))}
                </div>
                <Text
                    as="p"
                    variant="body-sm"
                    colorVariant="muted"
                    className={styles.hint}
                >
                    Le tariffe non compilate non verranno mostrate nella pagina pubblica.
                </Text>
            </div>
        </Card>
    );
};
