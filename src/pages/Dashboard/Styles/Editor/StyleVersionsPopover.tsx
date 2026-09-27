import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconCheck, IconHistory } from "@tabler/icons-react";
import { Button } from "@/components/ui/Button/Button";
import { Badge } from "@/components/ui/Badge/Badge";
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
    /** Trigger (controllo versione) da cui derivare la posizione del popover.
     *  Portalato su document.body → esce dal doppio overflow:hidden del pannello. */
    anchorEl: HTMLElement | null;
    /** Chi non può scrivere guarda le versioni ma non ne ripristina una. */
    readOnly?: boolean;
};

export function StyleVersionsPopover({
    versions,
    isLoading,
    currentVersionId,
    selectedVersionId,
    isRollingBack,
    onSelectVersion,
    onRollback,
    onClose,
    anchorEl,
    readOnly = false
}: StyleVersionsPopoverProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

    // Posizione fixed derivata dal rect del trigger; ricalcolata su scroll/resize
    // mentre il popover è aperto (scroll in capture per intercettare i container interni).
    useLayoutEffect(() => {
        if (!anchorEl) return;
        const update = () => {
            const r = anchorEl.getBoundingClientRect();
            setPos({ top: r.bottom + 6, left: r.left, width: r.width });
        };
        update();
        window.addEventListener("resize", update);
        window.addEventListener("scroll", update, true);
        return () => {
            window.removeEventListener("resize", update);
            window.removeEventListener("scroll", update, true);
        };
    }, [anchorEl]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        const handleClick = (e: MouseEvent) => {
            const target = e.target as Node;
            // Click sul trigger: lo gestisce il suo onClick (toggle) → non chiudere qui.
            if (anchorEl && anchorEl.contains(target)) return;
            if (ref.current && !ref.current.contains(target)) {
                onClose();
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        document.addEventListener("mousedown", handleClick);
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            document.removeEventListener("mousedown", handleClick);
        };
    }, [onClose, anchorEl]);

    const canRollback =
        !readOnly && selectedVersionId !== null && selectedVersionId !== currentVersionId;

    if (!pos) return null;

    return createPortal(
        <div
            className={popoverStyles.popover}
            ref={ref}
            style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
            <div className={popoverStyles.header}>
                <IconHistory size={13} />
                <Text as="span" variant="caption-xs" weight={600}>Cronologia versioni</Text>
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
                                <Text as="span" variant="caption" weight={600} className={popoverStyles.versionNum}>
                                    v{v.version}
                                </Text>
                                <Text as="span" variant="caption-xs" colorVariant="muted" className={popoverStyles.versionDate}>
                                    {new Date(v.created_at).toLocaleString("it-IT", {
                                        day: "2-digit",
                                        month: "short",
                                        year: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit"
                                    })}
                                </Text>
                                {isCurrent && (
                                    <Badge variant="brand" className={popoverStyles.currentBadge}>
                                        attiva
                                    </Badge>
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
        </div>,
        document.body
    );
}
