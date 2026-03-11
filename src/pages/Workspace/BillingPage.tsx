import PageHeader from "@/components/ui/PageHeader/PageHeader";
import { Card } from "@/components/ui/Card/Card";
import Text from "@/components/ui/Text/Text";
import { Badge } from "@/components/ui/Badge/Badge";
import { Button } from "@/components/ui/Button/Button";
import styles from "./BillingPage.module.scss";

const PLANS = [
    {
        name: "Starter",
        price: "€0 / mese",
        features: ["1 business", "fino a 3 membri"],
        cta: "Piano attuale",
        current: true
    },
    {
        name: "Pro",
        price: "€29 / mese",
        features: ["fino a 5 business", "fino a 10 membri"],
        cta: "Passa a Pro",
        current: false
    },
    {
        name: "Enterprise",
        price: "Contattaci",
        features: ["business illimitati", "supporto dedicato"],
        cta: "Contattaci",
        current: false
    }
];

export default function BillingPage() {
    return (
        <div className={styles.page}>
            <div className={styles.container}>
                <PageHeader title="Abbonamento" subtitle="Gestisci il piano del tuo workspace." />

                <div className={styles.section}>
                    <Card title="Piano corrente" className={styles.card}>
                        <div className={styles.currentGrid}>
                            <div>
                                <Text variant="caption" colorVariant="muted">
                                    Piano attuale
                                </Text>
                                <Text variant="title-sm" weight={700}>
                                    Starter
                                </Text>
                            </div>
                            <div>
                                <Text variant="caption" colorVariant="muted">
                                    Business inclusi
                                </Text>
                                <Text variant="title-sm" weight={700}>
                                    1 business
                                </Text>
                            </div>
                            <div>
                                <Text variant="caption" colorVariant="muted">
                                    Membri inclusi
                                </Text>
                                <Text variant="title-sm" weight={700}>
                                    3 membri
                                </Text>
                            </div>
                        </div>
                    </Card>
                </div>

                <div className={styles.section}>
                    <Text variant="title-sm" weight={700}>
                        Piani disponibili
                    </Text>

                    <div className={styles.planGrid}>
                        {PLANS.map(plan => (
                            <Card key={plan.name} className={styles.planCard}>
                                <div className={styles.planHeader}>
                                    <Text variant="title-sm" weight={700}>
                                        {plan.name}
                                    </Text>
                                    {plan.current && (
                                        <Badge variant="success" absolute top={12} right={12}>
                                            Piano attuale
                                        </Badge>
                                    )}
                                </div>

                                <Text variant="title-lg" weight={700} className={styles.planPrice}>
                                    {plan.price}
                                </Text>

                                <ul className={styles.planFeatures}>
                                    {plan.features.map(feature => (
                                        <Text as="li" key={feature} variant="body-sm">
                                            {feature}
                                        </Text>
                                    ))}
                                </ul>

                                <Button
                                    variant={plan.current ? "secondary" : "primary"}
                                    disabled
                                    fullWidth
                                >
                                    {plan.cta}
                                </Button>
                            </Card>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
