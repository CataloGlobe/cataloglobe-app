import { Switch } from "@/components/ui/Switch/Switch";
import { useActivityDetail } from "../ActivityDetailContext";

type FlagField = "payment_methods_public" | "services_public" | "fees_public";

/** L'interruttore «Visibili» di pagamenti, servizi e voci al conto, nella bozza della Scheda. */
export function VisibilitySwitch({ field, label }: { field: FlagField; label: string }) {
    const { canManage, draft } = useActivityDetail();
    return (
        <Switch
            size="sm"
            label={label}
            checked={Boolean(draft.draft[field])}
            onChange={value => draft.set(field, value)}
            disabled={!canManage}
        />
    );
}
