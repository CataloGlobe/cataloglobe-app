import React, { ReactNode, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Switch } from "@/components/ui/Switch/Switch";
import { UnsavedChangesBar } from "@/components/ui/UnsavedChangesBar/UnsavedChangesBar";
import styles from "./ConfigAccordionSection.module.scss";

export interface DraftActions {
    isDirty: boolean;
    onSave: () => void | Promise<void>;
    onCancel: () => void;
    isSaving?: boolean;
}

export interface PublicToggle {
    value: boolean;
    onChange: (next: boolean) => void;
}

interface ConfigAccordionSectionProps {
    title: string;
    previewBadges?: string[];
    defaultOpen?: boolean;
    publicToggle?: PublicToggle;
    draft?: DraftActions;
    children: ReactNode;
    isLast?: boolean;
}

const MAX_PREVIEW = 4;

export const ConfigAccordionSection: React.FC<ConfigAccordionSectionProps> = ({
    title,
    previewBadges,
    defaultOpen = false,
    publicToggle,
    draft,
    children,
    isLast = false
}) => {
    const [open, setOpen] = useState(defaultOpen);
    const hasBadges = !!previewBadges && previewBadges.length > 0;
    const previewVisible = !open && hasBadges;
    const showDirtyDot = !open && !!draft?.isDirty;

    return (
        <div
            className={`${styles.item} ${open ? styles.open : ""} ${
                isLast ? styles.last : ""
            }`}
        >
            <button
                type="button"
                className={styles.header}
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
            >
                <span className={styles.titleWrap}>
                    <span className={styles.title}>{title}</span>
                    {showDirtyDot && (
                        <span
                            className={styles.dirtyDot}
                            title="Modifiche non salvate"
                            aria-label="Modifiche non salvate"
                        />
                    )}
                </span>
                {previewVisible && (
                    <span className={styles.previewBadges}>
                        {previewBadges!.slice(0, MAX_PREVIEW).map((badge, i) => (
                            <span key={i} className={styles.previewBadge}>
                                {badge}
                            </span>
                        ))}
                        {previewBadges!.length > MAX_PREVIEW && (
                            <span className={styles.previewBadgeMore}>
                                +{previewBadges!.length - MAX_PREVIEW}
                            </span>
                        )}
                    </span>
                )}
                <ChevronDown
                    size={16}
                    className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}
                />
            </button>
            {open && (
                <div className={styles.body}>
                    <div className={styles.bodyContent}>{children}</div>
                    {publicToggle && (
                        <div className={styles.publicRow}>
                            <Switch
                                label="Mostra nella pagina pubblica"
                                checked={publicToggle.value}
                                onChange={publicToggle.onChange}
                            />
                        </div>
                    )}
                    {draft && draft.isDirty && (
                        <UnsavedChangesBar
                            isSaving={!!draft.isSaving}
                            onCancel={draft.onCancel}
                            onSave={() => {
                                void draft.onSave();
                            }}
                        />
                    )}
                </div>
            )}
        </div>
    );
};
