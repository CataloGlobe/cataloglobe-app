import React from "react";
import Text from "@components/ui/Text/Text";
import styles from "./Divider.module.scss";

interface DividerProps {
    label?: string;
}

export const Divider: React.FC<DividerProps> = ({ label }) => {
    return (
        <div className={styles.divider}>
            <span />
            {label && (
                <Text as="span" variant="caption" className={styles.label}>
                    {label}
                </Text>
            )}
            <span />
        </div>
    );
};
