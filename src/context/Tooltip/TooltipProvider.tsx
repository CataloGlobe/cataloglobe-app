import * as RadixTooltip from "@radix-ui/react-tooltip";

type TooltipProviderProps = {
    children: React.ReactNode;
};

export function TooltipProvider({ children }: TooltipProviderProps) {
    return <RadixTooltip.Provider delayDuration={50}>{children}</RadixTooltip.Provider>;
}
