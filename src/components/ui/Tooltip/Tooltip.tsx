import * as RadixTooltip from "@radix-ui/react-tooltip";
import styles from "./Tooltip.module.scss";

type TooltipProps = {
    content: React.ReactNode;
    children: React.ReactNode;
    side?: "top" | "right" | "bottom" | "left";
    align?: "start" | "center" | "end";
    sideOffset?: number;
    /**
     * `panel`: il nome di una voce della sidebar chiusa, con l'aspetto del
     * pannello delle sezioni (fondo chiaro, senza freccia), così le voci
     * dirette e le sezioni parlano la stessa lingua. Default `dark`.
     */
    variant?: "dark" | "panel";
    /** Ritardo prima di aprire; senza, quello del `TooltipProvider`. */
    delayDuration?: number;
    /** Aperto da fuori: il clic che lo apre anche al telefono, dove il passaggio del mouse non c'è. */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
};

export function Tooltip({
    content,
    children,
    side = "top",
    align = "center",
    sideOffset = 8,
    variant = "dark",
    delayDuration,
    open,
    onOpenChange
}: TooltipProps) {
    const panel = variant === "panel";
    return (
        <RadixTooltip.Root delayDuration={delayDuration} open={open} onOpenChange={onOpenChange}>
            <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>

            <RadixTooltip.Portal>
                <RadixTooltip.Content
                    side={side}
                    align={align}
                    sideOffset={sideOffset}
                    className={panel ? `${styles.tooltip} ${styles.panel}` : styles.tooltip}
                >
                    {content}
                    {!panel && <RadixTooltip.Arrow className={styles.arrow} />}
                </RadixTooltip.Content>
            </RadixTooltip.Portal>
        </RadixTooltip.Root>
    );
}
