import React from "react";
import type { V2Activity } from "@/types/activity";

interface ActivityAvailabilityTabProps {
    activity: V2Activity;
    tenantId: string;
    onReload: () => Promise<void>;
}

export const ActivityAvailabilityTab: React.FC<ActivityAvailabilityTabProps> = () => {
    return <div>Tab Disponibilità — placeholder</div>;
};
