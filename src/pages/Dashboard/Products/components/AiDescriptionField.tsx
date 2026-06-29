import React from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import type { AiDescriptionState } from "../hooks/useAiDescription";

export interface AiDescriptionFieldProps {
    /** Header label rendered beside the generate button. */
    label?: string;
    aiState: AiDescriptionState;
    isGenerating: boolean;
    canGenerate: boolean;
    onGenerate: () => void;
    /** The description field itself (a controlled <Textarea>), owned by the caller. */
    children: React.ReactNode;
}

/**
 * Presentational wrapper for a product description field with the AI enrichment
 * affordance: header (label + "Genera con AI"/"Rigenera" button), the field
 * (passed as children), and the status chip / empty-name hint below it. Single
 * source of the Italian UI strings; state comes from useAiDescription.
 */
export function AiDescriptionField({
    label = "Descrizione",
    aiState,
    isGenerating,
    canGenerate,
    onGenerate,
    children
}: AiDescriptionFieldProps) {
    // name is filled whenever we can generate, or while a generation is in flight
    // (generation cannot start with an empty name).
    const nameFilled = canGenerate || isGenerating;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <Text variant="body-sm" weight={600}>
                    {label}
                </Text>
                <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<Sparkles size={14} />}
                    loading={isGenerating}
                    disabled={!canGenerate}
                    onClick={onGenerate}
                >
                    {isGenerating
                        ? "Generazione…"
                        : aiState !== "none"
                            ? "Rigenera"
                            : "Genera con AI"}
                </Button>
            </div>
            {children}
            {!nameFilled && (
                <Text variant="body-sm" colorVariant="muted">
                    Inserisci il nome del prodotto per abilitare la generazione AI.
                </Text>
            )}
            {aiState === "generated" && nameFilled && (
                <Text variant="body-sm" colorVariant="muted">
                    ✨ Generato con AI · puoi modificarlo liberamente
                </Text>
            )}
            {aiState === "edited" && (
                <Text variant="body-sm" colorVariant="muted">
                    Modificato manualmente
                </Text>
            )}
        </div>
    );
}
