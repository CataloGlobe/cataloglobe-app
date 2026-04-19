export interface ClosureSlot {
    opens_at: string; // "HH:MM"
    closes_at: string; // "HH:MM"
    closes_next_day: boolean;
}

export interface V2ActivityClosure {
    id: string;
    tenant_id: string;
    activity_id: string;
    closure_date: string;       // "YYYY-MM-DD"
    end_date: string | null;    // "YYYY-MM-DD" or null
    label: string | null;
    is_closed: boolean;
    slots: ClosureSlot[] | null; // null if is_closed=true, array if is_closed=false
    created_at: string;
    updated_at: string;
}
