import type { ActivityFee } from "@/types/activity";
import { FEE_DEFINITIONS_BY_KEY } from "@/constants/activityFees";
import styles from "./PublicFees.module.scss";

type Props = {
    fees?: ActivityFee[];
    /** @deprecated Non più renderizzato nel footer (vedi modale Informazioni). */
    paymentMethods?: string[];
    /** @deprecated Non più renderizzato nel footer (vedi modale Informazioni). */
    services?: string[];
};

function formatFeeValue(fee: ActivityFee): string {
    const def = FEE_DEFINITIONS_BY_KEY[fee.key];
    if (!def) return fee.value;
    switch (def.unit) {
        case "€/persona":
            return `€${fee.value}/persona`;
        case "%":
            return `${fee.value}%`;
        case "€":
            return `€${fee.value}`;
        case "anni":
            return `${fee.value} anni`;
        default:
            return `${fee.value} ${def.unit}`;
    }
}

/**
 * Lista righe tariffe (label sinistra, valore destra).
 * Riusabile sia nel footer che nella modale Informazioni.
 * Allineato visivamente al pattern di PublicOpeningHours.
 */
export function PublicFeeRows({ fees }: { fees: ActivityFee[] }) {
    return (
        <dl className={styles.feeList}>
            {fees.map(fee => {
                const def = FEE_DEFINITIONS_BY_KEY[fee.key];
                return (
                    <div key={fee.key} className={styles.feeRow}>
                        <dt className={styles.feeLabel}>
                            {def?.label ?? fee.key}
                        </dt>
                        <dd className={styles.feeValue}>
                            {formatFeeValue(fee)}
                        </dd>
                    </div>
                );
            })}
        </dl>
    );
}

export default function PublicFees({ fees }: Props) {
    if (!fees || fees.length === 0) return null;

    return (
        <div className={styles.feesBlock}>
            <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Tariffe</h3>
                <PublicFeeRows fees={fees} />
            </section>
        </div>
    );
}
