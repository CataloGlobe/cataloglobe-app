import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/Badge/Badge";
import styles from "./PendingReservationsLink.module.scss";

/**
 * «N da gestire» sulla sede in Sedi (§48.1/3): il segnale d'azienda della coda
 * delle prenotazioni, che vive nella sede. Porta alla sua coda. Zero non si
 * dice: il chiamante non lo rende.
 */
export function PendingReservationsLink({ count, to }: { count: number; to: string }) {
    return (
        // Il Badge è un `status` (una regione che annuncia): dentro un link il
        // nome lo dà il link, e il Badge resta decorazione.
        <Link to={to} className={styles.link} aria-label={`${count} da gestire`}>
            <Badge variant="warning" role="presentation">
                {count} da gestire
            </Badge>
        </Link>
    );
}
