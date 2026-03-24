import { Info } from "lucide-react";
import { Tooltip } from "./Tooltip";

type InfoTooltipProps = {
    content: React.ReactNode;
    side?: "top" | "right" | "bottom" | "left";
    className?: string;
    ariaLabel?: string;
    withSpacing?: boolean;
};

export function InfoTooltip({
    content,
    side = "top",
    className,
    ariaLabel = "Maggiori informazioni",
    withSpacing = true,
}: InfoTooltipProps) {
    return (
        <Tooltip content={content} side={side}>
            <span
                aria-label={ariaLabel}
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    verticalAlign: "middle",
                    cursor: "help",
                    ...(withSpacing && { marginLeft: "0.25rem" }),
                }}
                className={className}
            >
                <Info size={14} />
            </span>
        </Tooltip>
    );
}
