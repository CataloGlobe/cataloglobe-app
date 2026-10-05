import { Activity, ArrowLeft, BarChart3, Bot, LifeBuoy, Wallet } from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { usePageHeader } from "@/context/usePageHeader";
import { usePageTitle } from "@/hooks/usePageTitle";
import styles from "./Crm.module.scss";

/**
 * «Altro» al telefono (U8): ciò che non sta nella barra in basso. Dal computer
 * le stesse voci sono nella barra a sinistra.
 */
export default function MorePage() {
    usePageTitle("Altro");
    usePageHeader({ title: "Altro" });
    return (
        <div className={styles.page}>
            <Card title="CRM" flush>
                <ListRow leading={<Bot size={18} />} title="Agenti" subtitle="Stato, giro dei messaggi, spesa" to="/admin/agenti" />
                <ListRow leading={<BarChart3 size={18} />} title="Riepilogo" subtitle="Dove si fermano i lead" to="/admin/lead?vista=riepilogo" />
                <ListRow leading={<Wallet size={18} />} title="Costi" to="/admin/costi" />
            </Card>
            <Card title="Piattaforma" flush>
                <ListRow leading={<LifeBuoy size={18} />} title="Supporto" to="/admin/supporto" />
                <ListRow leading={<Activity size={18} />} title="Incidenti" to="/admin/status-incidents" />
                <ListRow leading={<ArrowLeft size={18} />} title="Torna al workspace" to="/workspace" />
            </Card>
        </div>
    );
}
