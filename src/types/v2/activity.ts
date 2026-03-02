export interface V2Activity {
    id: string;
    tenant_id: string;
    name: string;
    slug: string;
    activity_type: string | null;
    address: string | null;
    city: string | null;
    cover_image: string | null;
    description: string | null;
    status: "active" | "inactive";
    created_at: string;
    updated_at: string;
}

export type V2ActivityType = string; // can be refined later if there are fixed types
