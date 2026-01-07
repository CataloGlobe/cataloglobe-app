import { useId, useState } from "react";
import Text from "@/components/ui/Text/Text";
import styles from "./Tooltip.module.scss";

type TooltipProps = {
    content: string;
    children: React.ReactNode;
    placement?: "top" | "bottom" | "left" | "right";
};

export default function Tooltip({ content, children, placement = "top" }: TooltipProps) {
    const id = useId();
    const [open, setOpen] = useState(false);

    return (
        <div
            className={styles.wrapper}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
        >
            <div aria-describedby={id} tabIndex={0} className={styles.trigger}>
                {children}
            </div>

            {open && (
                <div id={id} role="tooltip" className={`${styles.tooltip} ${styles[placement]}`}>
                    <Text variant="caption" color="white">
                        {content}
                    </Text>
                </div>
            )}
        </div>
    );
}
