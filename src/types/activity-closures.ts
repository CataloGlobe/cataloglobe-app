export interface V2ActivityClosure {
    id: string;
    tenant_id: string;
    activity_id: string;
    closure_date: string; // "YYYY-MM-DD"
    label: string | null;
    is_closed: boolean;
    opens_at: string | null;  // "HH:MM:SS" from DB, use .slice(0,5) for display
    closes_at: string | null; // "HH:MM:SS" from DB, use .slice(0,5) for display
    created_at: string;
    updated_at: string;
}
