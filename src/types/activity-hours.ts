export interface V2ActivityHours {
    id: string;
    tenant_id: string;
    activity_id: string;
    day_of_week: number; // 0=Lun ... 6=Dom
    opens_at: string | null; // "HH:MM"
    closes_at: string | null; // "HH:MM"
    is_closed: boolean;
    hours_public: boolean;
    created_at: string;
    updated_at: string;
}
