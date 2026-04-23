import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { AiMenuImportWizard } from "./AiMenuImportWizard";

interface AiMenuImportDrawerProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function AiMenuImportDrawer({ open, onClose, onSuccess }: AiMenuImportDrawerProps) {
    return (
        <SystemDrawer open={open} onClose={onClose} width={720}>
            <AiMenuImportWizard onClose={onClose} onSuccess={onSuccess} />
        </SystemDrawer>
    );
}
