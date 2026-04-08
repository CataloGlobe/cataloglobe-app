import { useEffect, useRef } from "react";
import { IconCheck, IconHistory } from "@tabler/icons-react";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import type { V2StyleVersion } from "@/services/supabase/styles";
import popoverStyles from "./StyleVersionsPopover.module.scss";

type StyleVersionsPopoverProps = {
    versions: V2StyleVersion[];
    isLoading: boolean;
    currentVersionId: string | null;
    selectedVersionId: string | null;
    isRollingBack: boolean;
    onSelectVersion: (v: V2StyleVersion) => void;
    onRollback: () => void;
    onClose: () => void;
};

export function StyleVersionsPopover({
    versions,
    isLoading,
    currentVersionId,
    selectedVersionId,
    isRollingBack,
    onSelectVersion,
    onRollback,
    onClose
}: StyleVersionsPopoverProps) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        const handleClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        document.addEventListener("mousedown", handleClick);
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            document.removeEventListener("mousedown", handleClick);
        };
    }, [onClose]);

    const canRollback =
        selectedVersionId !== null && selectedVersionId !== currentVersionId;

    return (
        <div className={popoverStyles.popover} ref={ref}>
            <div className={popoverStyles.header}>
                <IconHistory size={13} />
                <span>Cronologia versioni</span>
            </div>

            <div className={popoverStyles.list}>
                {isLoading ? (
                    <div className={popoverStyles.loadingRow}>
                        <Text variant="caption" colorVariant="muted">
                            Caricamento…
                        </Text>
                    </div>
                ) : versions.length === 0 ? (
                    <div className={popoverStyles.emptyRow}>
                        <Text variant="caption" colorVariant="muted">
                            Nessuna versione trovata.
                        </Text>
                    </div>
                ) : (
                    versions.map(v => {
                        const isCurrent = v.id === currentVersionId;
                        const isSelected = v.id === selectedVersionId;
                        return (
                            <button
                                key={v.id}
                                type="button"
                                className={`${popoverStyles.versionRow} ${isSelected ? popoverStyles.versionRowSelected : ""}`}
                                onClick={() => onSelectVersion(v)}
                            >
                                <span className={popoverStyles.versionNum}>
                                    v{v.version}
                                </span>
                                <span className={popoverStyles.versionDate}>
                                    {new Date(v.created_at).toLocaleString("it-IT", {
                                        day: "2-digit",
                                        month: "short",
                                        year: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit"
                                    })}
                                </span>
                                {isCurrent && (
                                    <span className={popoverStyles.currentBadge}>
                                        attiva
                                    </span>
                                )}
                                {isSelected && !isCurrent && (
                                    <IconCheck size={12} className={popoverStyles.selectedIcon} />
                                )}
                            </button>
                        );
                    })
                )}
            </div>

            {canRollback && (
                <div className={popoverStyles.footer}>
                    <Button
                        variant="secondary"
                        size="sm"
                        loading={isRollingBack}
                        onClick={onRollback}
                        className={popoverStyles.rollbackBtn}
                    >
                        Ripristina questa versione
                    </Button>
                </div>
            )}
        </div>
    );
}
