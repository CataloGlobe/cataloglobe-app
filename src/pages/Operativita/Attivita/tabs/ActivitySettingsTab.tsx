import React from "react";
import type { V2Activity } from "@/types/activity";

interface ActivitySettingsTabProps {
    activity: V2Activity;
    tenantId: string;
    onReload: () => Promise<void>;
}

export const ActivitySettingsTab: React.FC<ActivitySettingsTabProps> = () => {
    return <div>Tab Impostazioni — placeholder</div>;
};
