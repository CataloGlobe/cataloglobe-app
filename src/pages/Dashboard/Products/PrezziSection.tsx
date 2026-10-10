import { Card, type CardProps } from "@/components/ui/Card/Card";
import Text from "@/components/ui/Text/Text";
import styles from "./PrezziOpzioniTab.module.scss";

/**
 * Officina 3 (artifact «Scheda del prodotto»): nella parte a fuoco la card
 * col titolo c'è già, quindi qui il contenuto è piatto e il bottone per
 * aggiungere sta in fondo. Fuori dalla pagina del prodotto resta la Card.
 */
export function PrezziSection({ bare, actions, empty, children, ...card }: CardProps & { bare: boolean }) {
    if (!bare) {
        return (
            <Card actions={actions} empty={empty} {...card}>
                {children}
            </Card>
        );
    }
    return (
        <div className={styles.bare}>
            {empty ? (
                <Text variant="body-sm" colorVariant="muted">
                    {empty}
                </Text>
            ) : (
                children
            )}
            {actions && <div className={styles.bareActions}>{actions}</div>}
        </div>
    );
}
