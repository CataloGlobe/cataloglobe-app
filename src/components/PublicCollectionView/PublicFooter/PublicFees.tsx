import { useTranslation } from "react-i18next";
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

/**
 * Lista righe tariffe (label sinistra, valore destra).
 * Riusabile sia nel footer che nella modale Informazioni.
 * Allineato visivamente al pattern di PublicOpeningHours.
 */
export function PublicFeeRows({ fees, surface = "bg" }: { fees: ActivityFee[]; surface?: "bg" | "surface" }) {
    const { t } = useTranslation("public");
    return (
        <dl className={styles.feeList} data-surface={surface}>
            {fees.map(fee => {
                const def = FEE_DEFINITIONS_BY_KEY[fee.key];
                return (
                    <div key={fee.key} className={styles.feeRow}>
                        <dt className={styles.feeLabel}>
                            {def ? t(def.labelKey) : fee.key}
                        </dt>
                        <dd className={styles.feeValue}>
                            {def
                                ? t(`fees.unit_format.${def.unitFormatKey}`, { value: fee.value })
                                : fee.value}
                        </dd>
                    </div>
                );
            })}
        </dl>
    );
}

export default function PublicFees({ fees }: Props) {
    const { t } = useTranslation("public");
    if (!fees || fees.length === 0) return null;

    return (
        <div className={styles.feesBlock}>
            <section className={styles.section}>
                <h3 className={styles.sectionTitle}>{t("info.fees")}</h3>
                <PublicFeeRows fees={fees} />
            </section>
        </div>
    );
}
