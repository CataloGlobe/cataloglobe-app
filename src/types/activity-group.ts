export interface V2ActivityGroup {
    id: string;
    tenant_id: string;
    name: string;
    description: string | null;
    is_system: boolean;
    created_at: string;
    updated_at: string;
}

export interface V2ActivityGroupMember {
    id: string;
    tenant_id: string;
    group_id: string;
    activity_id: string;
    created_at: string;
}

export interface V2ActivityGroupWithCounts extends V2ActivityGroup {
    member_count: number;
}

export type V2ActivityGroupInsert = Omit<
    V2ActivityGroup,
    "id" | "created_at" | "updated_at" | "is_system"
>;
export type V2ActivityGroupUpdate = Partial<
    Omit<V2ActivityGroup, "id" | "tenant_id" | "created_at" | "updated_at" | "is_system">
>;
