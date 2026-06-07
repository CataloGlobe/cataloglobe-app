import Text from "@/components/ui/Text/Text";
import { TextInput } from "@/components/ui/Input/TextInput";
import type { Plan } from "@/types/plan";
import type { GraduatedBreakdown } from "@/utils/pricing";
import styles from "../CreateBusinessWizard.module.scss";

interface Step3SummaryProps {
    name: string;
    plan: Plan;
    breakdown: GraduatedBreakdown;
    total: number;
    discountPercent: number;
    promotionCode: string;
    onPromotionCodeChange: (value: string) => void;
    showPromoInput: boolean;
    onTogglePromoInput: () => void;
    promoError: string | null;
    submitError: string | null;
}

function formatEuro(value: number): string {
    return `€${value.toFixed(2).replace(".", ",")}`;
}

export function Step3Summary({
    name,
    plan,
    breakdown,
    total,
    discountPercent,
    promotionCode,
    onPromotionCodeChange,
    showPromoInput,
    onTogglePromoInput,
    promoError,
    submitError,
}: Step3SummaryProps) {
    return (
        <div className={styles.stepRoot}>
            <div className={styles.stepHeader}>
                <Text variant="title-sm" weight={700}>Quasi fatto</Text>
                <span className={styles.stepSubtitle}>
                    Controlla il riepilogo e procedi al pagamento. Potrai modificare piano e sedi successivamente.
                </span>
            </div>

            <div className={styles.summaryWrap}>
                <div className={styles.summaryCard}>
                    <div className={styles.summaryTopRow}>
                        <div className={styles.summaryMeta}>
                            <span className={styles.summaryMetaLabel}>Attività</span>
                            <span className={styles.summaryMetaValue}>{name || "—"}</span>
                        </div>
                        <div className={`${styles.summaryMeta} ${styles.summaryMetaRight}`}>
                            <span className={styles.summaryMetaLabel}>Piano</span>
                            <span className={styles.summaryMetaValue}>{plan.name}</span>
                        </div>
                    </div>

                    <div className={styles.summaryLines}>
                        {breakdown.lines.map(line => (
                            <div key={line.seat} className={styles.breakdownRow}>
                                <span className={styles.breakdownLabel}>
                                    {line.seat === 1 ? "1ª sede" : `${line.seat}ª sede`}
                                    {line.discounted && (
                                        <span className={styles.breakdownDiscountChip}>
                                            −{discountPercent}%
                                        </span>
                                    )}
                                </span>
                                <span>{formatEuro(line.unitPrice)}</span>
                            </div>
                        ))}
                    </div>

                    <div className={styles.summaryTotals}>
                        <div className={styles.summaryGrandRow}>
                            <span>Totale mensile</span>
                            <span>{formatEuro(total)}</span>
                        </div>
                    </div>
                </div>

                <div className={styles.promoBlock}>
                    {!showPromoInput ? (
                        <button
                            type="button"
                            className={styles.promoToggle}
                            onClick={onTogglePromoInput}
                        >
                            Hai un codice promozionale?
                        </button>
                    ) : (
                        <div className={styles.promoCard}>
                            <TextInput
                                label="Codice promozionale"
                                value={promotionCode}
                                onChange={e => onPromotionCodeChange(e.target.value.toUpperCase())}
                                placeholder="es. FOUNDER10"
                            />
                            <span className={styles.promoHint}>
                                Il codice verrà verificato al checkout. Se valido, lo sconto o il trial esteso saranno applicati automaticamente.
                            </span>
                            {promoError && (
                                <span className={styles.promoError}>{promoError}</span>
                            )}
                        </div>
                    )}
                </div>

                <div className={styles.infoBlock}>
                    <span className={styles.infoTitle}>Cosa succede al click su "Vai al pagamento"</span>
                    <span className={styles.infoText}>
                        Sarai reindirizzato alla pagina sicura di Stripe. Inserirai la carta e il primo addebito partirà solo dopo la conferma. Puoi cancellare l'abbonamento in qualsiasi momento dalla pagina Abbonamento.
                    </span>
                </div>

                {submitError && (
                    <div className={styles.submitError}>{submitError}</div>
                )}
            </div>
        </div>
    );
}
