import React, { useMemo } from "react";
import { IconClock, IconX, IconPlus } from "@tabler/icons-react";
import { Card, Button } from "@/components/ui";
import Text from "@/components/ui/Text/Text";
import type { V2ActivityClosure, ClosureSlot } from "@/types/activity-closures";
import pageStyles from "../../ActivityDetailPage.module.scss";
import styles from "./HoursServices.module.scss";

// ── Date helpers ─────────────────────────────────────────────────────────────

const IT_MONTH_LONG = [
    "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
    "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"
];
const IT_MONTH_SHORT = [
    "gen", "feb", "mar", "apr", "mag", "giu",
    "lug", "ago", "set", "ott", "nov", "dic"
];

function parseDateStr(s: string): Date {
    return new Date(s + "T12:00:00");
}

function formatDateLong(dateStr: string): string {
    const d = parseDateStr(dateStr);
    return `${d.getDate()} ${IT_MONTH_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

function formatDateShort(dateStr: string): string {
    const d = parseDateStr(dateStr);
    return `${d.getDate()} ${IT_MONTH_SHORT[d.getMonth()]}`;
}

function formatSlots(slots: ClosureSlot[]): string {
    return slots.map(s => `${s.start_time} – ${s.end_time}`).join(", ");
}

function buildSubtitle(c: V2ActivityClosure): string {
    let dateStr: string;
    if (c.end_date) {
        dateStr = `${parseDateStr(c.closure_date).getDate()} – ${formatDateShort(c.end_date)} ${parseDateStr(c.closure_date).getFullYear()}`;
    } else {
        dateStr = formatDateLong(c.closure_date);
    }
    if (c.is_closed) {
        return `${dateStr} · Chiusura totale`;
    }
    const slotsStr = c.slots ? formatSlots(c.slots) : "";
    return `${dateStr} · Orario ridotto: ${slotsStr}`;
}

function getTodayISO(): string {
    return new Date().toISOString().slice(0, 10);
}

function isPast(c: V2ActivityClosure, today: string): boolean {
    return (c.end_date ?? c.closure_date) < today;
}

// ── Component ────────────────────────────────────────────────────────────────

interface ActivityClosuresSectionProps {
    closures: V2ActivityClosure[];
    onCreateRequest: () => void;
    onEditRequest: (closure: V2ActivityClosure) => void;
    onDeleteRequest: (closure: V2ActivityClosure) => void;
}

export const ActivityClosuresSection: React.FC<ActivityClosuresSectionProps> = ({
    closures,
    onCreateRequest,
    onEditRequest,
    onDeleteRequest,
}) => {
    const today = getTodayISO();

    const sorted = useMemo(() => {
        const future = closures.filter(c => !isPast(c, today));
        const past = closures.filter(c => isPast(c, today));
        future.sort((a, b) => a.closure_date.localeCompare(b.closure_date));
        past.sort((a, b) => b.closure_date.localeCompare(a.closure_date));
        return [...future, ...past];
    }, [closures, today]);

    return (
        <Card className={pageStyles.card}>
            <div className={styles.cardHeader}>
                <div className={styles.headerLeft}>
                    <h3 className={styles.sectionTitle}>Chiusure straordinarie</h3>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<IconPlus size={16} />}
                    onClick={onCreateRequest}
                >
                    Nuova chiusura
                </Button>
            </div>
            <div className={pageStyles.cardContent}>
                {sorted.length === 0 ? (
                    <div className={styles.closuresEmptyState}>
                        <Text variant="body-sm" colorVariant="muted">
                            Nessuna chiusura programmata.
                        </Text>
                        <Button variant="ghost" size="sm" leftIcon={<IconPlus size={14} />} onClick={onCreateRequest}>
                            Nuova chiusura
                        </Button>
                    </div>
                ) : (
                    <div className={styles.closureCardList}>
                        {sorted.map((c) => {
                            const past = isPast(c, today);
                            const title = c.label ?? (c.is_closed ? "Chiusura" : "Orario speciale");
                            return (
                                <div
                                    key={c.id}
                                    className={`${styles.closureCardItem}${past ? ` ${styles.closureCardItemPast}` : ""}`}
                                    onClick={() => onEditRequest(c)}
                                >
                                    {/* Icon */}
                                    <div className={`${styles.closureIconWrap} ${c.is_closed ? styles.closureIconWrapDanger : styles.closureIconWrapWarning}`}>
                                        {c.is_closed
                                            ? <IconX size={18} />
                                            : <IconClock size={18} />
                                        }
                                    </div>

                                    {/* Body */}
                                    <div className={styles.closureCardBody}>
                                        <span className={styles.closureCardTitle}>{title}</span>
                                        <span className={styles.closureCardSubtitle}>{buildSubtitle(c)}</span>
                                    </div>

                                    {/* Right: badge + delete */}
                                    <div className={styles.closureCardRight}>
                                        {past ? (
                                            <span className={`${styles.closureBadge} ${styles.closureBadgePast}`}>
                                                Passata
                                            </span>
                                        ) : c.is_closed ? (
                                            <span className={`${styles.closureBadge} ${styles.closureBadgeClosed}`}>
                                                Chiuso
                                            </span>
                                        ) : (
                                            <span className={`${styles.closureBadge} ${styles.closureBadgeSpecial}`}>
                                                Orario speciale
                                            </span>
                                        )}
                                        <button
                                            type="button"
                                            className={`${styles.closuresActionBtn} ${styles.closuresActionBtnDanger}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDeleteRequest(c);
                                            }}
                                            aria-label="Elimina"
                                        >
                                            <IconX size={14} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </Card>
    );
};
