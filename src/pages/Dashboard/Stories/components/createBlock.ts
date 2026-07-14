import { StoryBlock } from "@/services/supabase/stories";
import { FRAMING_DEFAULTS } from "@/components/ui/ImageReframeEditor/types";

function makeBlockId() {
    return crypto.randomUUID();
}

/** Fabbrica blocco vuoto per tipo — usata dal menu "Aggiungi" nell'header sezione Contenuto. */
export function createBlock(type: StoryBlock["type"]): StoryBlock {
    if (type === "text") return { id: makeBlockId(), type: "text", content: "" };
    if (type === "image")
        return {
            id: makeBlockId(),
            type: "image",
            url: "",
            caption: "",
            // Framing obbligatorio: default orizzontale 3:2, inquadratura neutra.
            // mediaAspectRatio è assente finché non si carica un file (scritto in ImageBlock).
            frame: "3:2",
            framing: FRAMING_DEFAULTS
        };
    return { id: makeBlockId(), type: "video", provider: "youtube", ref: "" };
}
