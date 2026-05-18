import React, { ReactNode } from "react";
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
    isOpen: boolean;
    onToggle: () => void;
    publicToggle?: PublicToggle;
    draft?: DraftActions;
    children: ReactNode;
    isLast?: boolean;
}

const MAX_PREVIEW = 4;

export const ConfigAccordionSection: React.FC<ConfigAccordionSectionProps> = ({
    title,
    previewBadges,
    isOpen,
    onToggle,
    publicToggle,
    draft,
    children,
    isLast = false
}) => {
    const hasBadges = !!previewBadges && previewBadges.length > 0;
    const previewVisible = !isOpen && hasBadges;
    const showDirtyDot = !isOpen && !!draft?.isDirty;

    return (
        <div
            className={`${styles.item} ${isOpen ? styles.open : ""} ${
                isLast ? styles.last : ""
            }`}
        >
            <button
                type="button"
                className={styles.header}
                onClick={onToggle}
                aria-expanded={isOpen}
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
                    className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}
                />
            </button>
            {isOpen && (
                <div className={styles.body}>
                    {publicToggle && (
                        <div className={styles.publicToggleInline}>
                            <Switch
                                label="Mostra nella pagina pubblica"
                                checked={publicToggle.value}
                                onChange={publicToggle.onChange}
                            />
                        </div>
                    )}
                    <div className={styles.bodyContent}>{children}</div>
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
