import React from "react";
import type { V2Activity } from "@/types/activity";

interface ActivityProfileTabProps {
    activity: V2Activity;
    tenantId: string;
    onReload: () => Promise<void>;
}

export const ActivityProfileTab: React.FC<ActivityProfileTabProps> = () => {
    return <div>Tab Profilo — placeholder</div>;
};
