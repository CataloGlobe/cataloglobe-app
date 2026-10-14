import { useEffect, useRef, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { ChipGroupSingle } from "@/components/ui/Chip/ChipGroup";
import { FilterFit } from "@/components/ui/FilterFit/FilterFit";
import { FamilyName } from "@/components/ui/FamilyName/FamilyName";
import type { Family } from "@/components/ui/FamilyName/family";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { VETRINA_SORT, type LeadPart, type OnAirFilter, type VetrinaSort } from "./vetrinaModel";
import s from "./Vetrina.module.scss";

export type VetrinaView = "fogli" | "elenco";

type Props = {
    family: Family;
    lead: LeadPart[] | null;
    filter: OnAirFilter;
    onFilter: (f: OnAirFilter) => void;
    counts: Record<OnAirFilter, number>;
    sort: VetrinaSort;
    onSort: (v: VetrinaSort) => void;
    query: string;
    onQuery: (q: string) => void;
    placeholder: string;
    /** Fogli o Elenco: solo Menù e Stili, e mai al telefono. */
    view?: { value: VetrinaView; onChange: (v: VetrinaView) => void };
    /** Il pulsante «Crea» con la sua tendina. */
    crea?: ReactNode;
    compact: boolean;
    setTop: (el: HTMLDivElement | null) => void;
};

/** La frase in cima: i nomi col colore della famiglia, le sedi vuote in caldo. */
export function Lead({ parts, family }: { parts: LeadPart[]; family: Family }) {
    return (
        <p className={s.lead}>
            {parts.map((part, i) =>
                "name" in part ? (
                    <FamilyName key={i} family={family}>
                        {part.name}
                    </FamilyName>
                ) : "down" in part ? (
                    <b key={i} className={s.down}>
                        {part.down}
                    </b>
                ) : (
                    <span key={i}>{part.text}</span>
                )
            )}
        </p>
    );
}

/**
 * La testata di Menù e vetrina nella D (Visual Redesign 2, `mvTop`): la
 * frase di chi è in onda adesso, poi la riga dei comandi con i filtri, Cerca,
 * Fogli o Elenco e «Crea». Scorrendo la frase si ritira e la riga resta ferma
 * in alto (v34).
 */
export function VetrinaHead(p: Props) {
    const wide = useMediaQuery("(min-width: 1024px)");
    const [searchOpen, setSearchOpen] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (searchOpen) searchRef.current?.focus();
    }, [searchOpen]);

    const options = [
        { value: "all" as const, label: "Tutti", count: p.counts.all },
        { value: "on" as const, label: "In onda", count: p.counts.on },
        { value: "off" as const, label: "Non in onda", count: p.counts.off }
    ];

    // Al computer il campo c'è sempre; sotto i 1024 è una lente che lo apre.
    const search =
        wide || searchOpen || p.query ? (
            <div className={s.search} onBlur={() => !wide && setSearchOpen(false)}>
                <ToolbarSearch ref={searchRef} value={p.query} onChange={p.onQuery} placeholder={p.placeholder} width="min" />
            </div>
        ) : (
            <Button
                variant="secondary"
                size="sm"
                className={s.lens}
                aria-label={p.placeholder}
                leftIcon={<Search size={16} aria-hidden />}
                onClick={() => setSearchOpen(true)}
            >
                <span className={s.sr}>Cerca</span>
            </Button>
        );

    return (
        <>
            <div ref={p.setTop} className={s.top} aria-hidden />
            <div className={s.head} data-compact={p.compact ? "" : undefined}>
                {p.lead && <Lead parts={p.lead} family={p.family} />}
                <div className={s.bar}>
                    <div className={s.filters}>
                        <FilterFit
                            active={p.filter !== "all" ? 1 : 0}
                            onClear={() => p.onFilter("all")}
                            short={p.compact}
                            sort={{ label: "Ordine", value: p.sort, options: VETRINA_SORT, onChange: p.onSort }}
                        >
                            <ChipGroupSingle ariaLabel="Quali mostrare" layout="auto" value={p.filter} onChange={p.onFilter} options={options} />
                        </FilterFit>
                    </div>
                    {search}
                    {p.view && (
                        <div className={s.view}>
                            <SegmentedControl<VetrinaView>
                                size="sm"
                                label="Come mostrarli"
                                value={p.view.value}
                                onChange={p.view.onChange}
                                options={[
                                    { value: "fogli", label: "Fogli" },
                                    { value: "elenco", label: "Elenco" }
                                ]}
                            />
                        </div>
                    )}
                    {p.crea}
                </div>
            </div>
        </>
    );
}
