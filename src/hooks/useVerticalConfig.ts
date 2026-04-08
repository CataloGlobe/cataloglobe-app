import { useTenant } from "@/context/useTenant";
import { VERTICAL_CONFIG, DEFAULT_VERTICAL } from "@/constants/verticalTypes";
import type { VerticalConfig } from "@/constants/verticalTypes";

export function useVerticalConfig(): VerticalConfig {
    const { selectedTenant } = useTenant();
    const vertical = selectedTenant?.vertical_type ?? DEFAULT_VERTICAL;
    return VERTICAL_CONFIG[vertical];
}
