import { Maximize2, Minimize2 } from "lucide-react";
import { IconButton } from "@/components/ui/Button/IconButton";

export type HomeTile = "todo" | "agenda" | "hot" | "agents";

/** Il tasto «Ingrandisci»/«Riduci» di un riquadro della Home del CRM. */
export function TileToggle({ tile, expanded, label, onToggle }: { tile: HomeTile; expanded: HomeTile | null; label: string; onToggle: (t: HomeTile) => void }) {
    const isOpen = expanded === tile;
    return (
        <IconButton
            variant="ghost"
            size="sm"
            icon={isOpen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            aria-label={isOpen ? `Riduci ${label}` : `Ingrandisci ${label}`}
            aria-expanded={isOpen}
            onClick={() => onToggle(tile)}
        />
    );
}
