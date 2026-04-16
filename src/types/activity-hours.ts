export interface V2ActivityHours {
    id: string;
    tenant_id: string;
    activity_id: string;
    day_of_week: number; // 0=Lun ... 6=Dom
    slot_index: number;
    opens_at: string | null; // "HH:MM"
    closes_at: string | null; // "HH:MM"
    is_closed: boolean;
    created_at: string;
    updated_at: string;
}
