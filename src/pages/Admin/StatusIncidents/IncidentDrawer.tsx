import { useEffect, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Textarea } from "@/components/ui/Textarea/Textarea";
import { Select } from "@/components/ui/Select/Select";
import {
    createIncident,
    updateIncident,
    SERVICE_KEYS,
    SERVICE_LABELS,
    type IncidentSeverity,
    type IncidentStatus,
    type ServiceKey,
    type StatusIncident
} from "@/services/supabase/statusPage";
import styles from "./StatusIncidentsPage.module.scss";

const SEVERITY_OPTIONS = [
    { value: "minor", label: "Minore" },
    { value: "major", label: "Importante" },
    { value: "critical", label: "Critico" }
];

const STATUS_OPTIONS = [
    { value: "investigating", label: "In analisi" },
    { value: "identified", label: "Identificato" },
    { value: "monitoring", label: "In monitoraggio" },
    { value: "resolved", label: "Risolto" }
];

type Mode = "create" | "edit";

type IncidentDrawerProps = {
    open: boolean;
    mode: Mode;
    incident: StatusIncident | null;
    onClose: () => void;
    onSaved: () => void;
};

export function IncidentDrawer({ open, mode, incident, onClose, onSaved }: IncidentDrawerProps) {
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [status, setStatus] = useState<IncidentStatus>("investigating");
    const [severity, setSeverity] = useState<IncidentSeverity>("minor");
    const [affected, setAffected] = useState<ServiceKey[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        if (mode === "edit" && incident) {
            setTitle(incident.title);
            setDescription(incident.description ?? "");
            setStatus(incident.status);
            setSeverity(incident.severity);
            setAffected(
                incident.affected_services.filter((s): s is ServiceKey =>
                    SERVICE_KEYS.includes(s as ServiceKey)
                )
            );
        } else {
            setTitle("");
            setDescription("");
            setStatus("investigating");
            setSeverity("minor");
            setAffected([]);
        }
        setError(null);
        setSubmitting(false);
    // Re-init solo all'apertura o quando cambia l'entità target (per id).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, mode, incident?.id]);

    function toggleAffected(key: ServiceKey) {
        setAffected((prev) =>
            prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
        );
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!title.trim()) {
            setError("Titolo obbligatorio.");
            return;
        }
        setError(null);
        setSubmitting(true);
        try {
            if (mode === "create") {
                await createIncident({
                    title: title.trim(),
                    description: description.trim() ? description.trim() : null,
                    status,
                    severity,
                    affected_services: affected
                });
            } else if (incident) {
                await updateIncident(incident.id, {
                    title: title.trim(),
                    description: description.trim() ? description.trim() : null,
                    status,
                    severity,
                    affected_services: affected
                });
            }
            onSaved();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setSubmitting(false);
        }
    }

    return (
        <SystemDrawer open={open} onClose={onClose} width={560}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        {mode === "create" ? "Nuovo incident" : "Modifica incident"}
                    </Text>
                }
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={onClose}
                            disabled={submitting}
                        >
                            Annulla
                        </Button>
                        <Button
                            variant="primary"
                            type="submit"
                            form="incident-form"
                            loading={submitting}
                        >
                            {mode === "create" ? "Crea incident" : "Salva Modifiche"}
                        </Button>
                    </>
                }
            >
                <form id="incident-form" className={styles.drawerForm} onSubmit={handleSubmit}>
                    <TextInput
                        label="Titolo"
                        required
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Es. Menu pubblico non risponde"
                        disabled={submitting}
                    />

                    <Textarea
                        label="Descrizione"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Cosa sta succedendo e cosa stiamo facendo."
                        disabled={submitting}
                        rows={4}
                    />

                    <Select
                        label="Stato"
                        value={status}
                        onChange={(e) => setStatus(e.target.value as IncidentStatus)}
                        disabled={submitting}
                        options={STATUS_OPTIONS}
                    />

                    <Select
                        label="Severità"
                        value={severity}
                        onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
                        disabled={submitting}
                        options={SEVERITY_OPTIONS}
                    />

                    <div className={styles.field}>
                        <span className={styles.fieldLabel}>Servizi impattati</span>
                        <div className={styles.checkboxRow}>
                            {SERVICE_KEYS.map((key) => {
                                const active = affected.includes(key);
                                return (
                                    <label
                                        key={key}
                                        className={`${styles.checkboxItem} ${
                                            active ? styles.checkboxItem_active : ""
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={active}
                                            onChange={() => toggleAffected(key)}
                                            disabled={submitting}
                                        />
                                        {SERVICE_LABELS[key]}
                                    </label>
                                );
                            })}
                        </div>
                    </div>

                    {error && <div className={styles.errorMsg}>{error}</div>}
                </form>
            </DrawerLayout>
        </SystemDrawer>
    );
}
