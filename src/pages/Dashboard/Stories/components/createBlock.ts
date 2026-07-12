import { StoryBlock } from "@/services/supabase/stories";

function makeBlockId() {
    return crypto.randomUUID();
}

/** Fabbrica blocco vuoto per tipo — usata dal menu "Aggiungi" nell'header sezione Contenuto. */
export function createBlock(type: StoryBlock["type"]): StoryBlock {
    if (type === "text") return { id: makeBlockId(), type: "text", content: "" };
    if (type === "image") return { id: makeBlockId(), type: "image", url: "", caption: "" };
    return { id: makeBlockId(), type: "video", provider: "youtube", ref: "" };
}
