import * as RadixTooltip from "@radix-ui/react-tooltip";
import styles from "./Tooltip.module.scss";

type TooltipProps = {
    content: React.ReactNode;
    children: React.ReactNode;
    side?: "top" | "right" | "bottom" | "left";
    align?: "start" | "center" | "end";
    sideOffset?: number;
};

export function Tooltip({ content, children, side = "top", align = "center", sideOffset = 8 }: TooltipProps) {
    return (
        <RadixTooltip.Root>
            <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>

            <RadixTooltip.Portal>
                <RadixTooltip.Content side={side} align={align} sideOffset={sideOffset} className={styles.tooltip}>
                    {content}
                    <RadixTooltip.Arrow className={styles.arrow} />
                </RadixTooltip.Content>
            </RadixTooltip.Portal>
        </RadixTooltip.Root>
    );
}
