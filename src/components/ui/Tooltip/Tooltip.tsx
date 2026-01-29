import * as RadixTooltip from "@radix-ui/react-tooltip";
import Text from "@/components/ui/Text/Text";
import styles from "./Tooltip.module.scss";

type TooltipProps = {
    content: string;
    children: React.ReactNode;
    side?: "top" | "right" | "bottom" | "left";
};

export function Tooltip({ content, children, side = "right" }: TooltipProps) {
    return (
        <RadixTooltip.Root>
            <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>

            <RadixTooltip.Portal>
                <RadixTooltip.Content side={side} sideOffset={12} className={styles.tooltip}>
                    <Text variant="caption" color="white">
                        {content}
                    </Text>

                    <RadixTooltip.Arrow className={styles.arrow} />
                </RadixTooltip.Content>
            </RadixTooltip.Portal>
        </RadixTooltip.Root>
    );
}
