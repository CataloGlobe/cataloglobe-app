import { MapPin, Archive, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/Badge/Badge";
import Text from "@/components/ui/Text/Text";
import type { V2Tenant } from "@/types/v2/tenant";
import styles from "./BusinessCard.module.scss";

const VERTICAL_LABELS: Record<string, string> = {
    restaurant: "Ristorante",
    bar: "Bar",
    retail: "Negozio",
    hotel: "Hotel",
    generic: "Generico"
};

// 6-color palette cycling by first char code — gives each business a distinct tint
const AVATAR_PALETTE = [
    { bg: "#ede9fe", text: "#7c3aed" }, // indigo
    { bg: "#dbeafe", text: "#1d4ed8" }, // blue
    { bg: "#d1fae5", text: "#065f46" }, // emerald
    { bg: "#fef3c7", text: "#b45309" }, // amber
    { bg: "#fce7f3", text: "#be185d" }, // pink
    { bg: "#e0f2fe", text: "#0369a1" }, // sky
];

function avatarColors(name: string) {
    return AVATAR_PALETTE[name.charCodeAt(0) % AVATAR_PALETTE.length];
}

interface BusinessCardProps {
    tenant: V2Tenant;
    locationCount: number;
    productCount: number;
    catalogCount: number;
    onSelect: (id: string) => void;
}

export default function BusinessCard({ tenant, locationCount, productCount, catalogCount, onSelect }: BusinessCardProps) {
    const initial = tenant.name.charAt(0).toUpperCase();
    const verticalLabel = VERTICAL_LABELS[tenant.vertical_type] ?? tenant.vertical_type;
    const { bg, text } = avatarColors(tenant.name);

    return (
        <div
            className={styles.card}
            onClick={() => onSelect(tenant.id)}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onSelect(tenant.id); }}
        >
            <div className={styles.header}>
                <div className={styles.avatar} style={{ background: bg, color: text }}>
                    {initial}
                </div>
                <div className={styles.meta}>
                    <div className={styles.nameRow}>
                        <Text variant="title-sm" weight={600} className={styles.name}>
                            {tenant.name}
                        </Text>
                        <Badge variant={tenant.user_role === "member" ? "secondary" : "primary"}>
                            {tenant.user_role === "member" ? "Member" : "Owner"}
                        </Badge>
                    </div>
                    <div style={{ marginTop: "5px" }}>
                        <Badge variant="secondary">{verticalLabel}</Badge>
                    </div>
                </div>
            </div>

            <div className={styles.footer}>
                <span className={styles.stat}>
                    <MapPin size={13} />
                    {locationCount} {locationCount === 1 ? "sede" : "sedi"}
                </span>
                <span className={styles.stat}>
                    <Archive size={13} />
                    {productCount} prodotti
                </span>
                <span className={styles.stat}>
                    <BookOpen size={13} />
                    {catalogCount} cataloghi
                </span>
            </div>
        </div>
    );
}
