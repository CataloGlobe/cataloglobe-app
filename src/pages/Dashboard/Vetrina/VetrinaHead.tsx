import { useEffect, useRef, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import { ChipGroupSingle, type ChipOption } from "@/components/ui/Chip/ChipGroup";
import { FilterFit } from "@/components/ui/FilterFit/FilterFit";
import { FamilyName } from "@/components/ui/FamilyName/FamilyName";
import type { Family } from "@/components/ui/FamilyName/family";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { ToolbarSearch } from "@/components/ui/ToolbarSearch";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { VETRINA_SORT, type LeadPart, type OnAirFilter, type VetrinaSort } from "./vetrinaModel";
import s from "./Vetrina.module.scss";

export type VetrinaView = "fogli" | "elenco";

type Props<F extends string = OnAirFilter, S extends string = VetrinaSort> = {
    family: Family;
    lead: LeadPart[] | null;
    filter: F;
    onFilter: (f: F) => void;
    /** Tutti, In onda, Non in onda coi numeri; Prodotti passa i suoi. */
    filterOptions: ChipOption<F>[];
    /** Il valore di «Tutti»: il filtro spento. */
    filterAll: F;
    /** Altri filtri accesi oltre alle pill (es. il gruppo in Prodotti). */
    filterMore?: number;
    onClear?: () => void;
    /** Una tendina in più nella riga, pill nel pannello (es. «Tutti i gruppi»). */
    aside?: ReactNode;
    panelExtra?: ReactNode;
    /** Senza, niente «Ordina» (Tutte le sedi). */
    sort?: S;
    sortOptions?: readonly { value: S; label: string }[];
    onSort?: (v: S) => void;
    /** Prima dei filtri: l'interruttore «Sedi · Gruppi di sedi». */
    before?: ReactNode;
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
                    <FamilyName key={i} family={part.family ?? family}>
                        {part.name}
                    </FamilyName>
                ) : "down" in part ? (
                    <b key={i} className={s.down}>
                        {part.down}
                    </b>
                ) : "strong" in part ? (
                    <b key={i} className={s.strong}>
                        {part.strong}
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
export function VetrinaHead<F extends string = OnAirFilter, S extends string = VetrinaSort>(p: Props<F, S>) {
    const wide = useMediaQuery("(min-width: 1024px)");
    const [searchOpen, setSearchOpen] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (searchOpen) searchRef.current?.focus();
    }, [searchOpen]);

    // L'altezza della testata ferma: sotto di lei si fermano le intestazioni
    // delle tabelle (Prodotti, v34).
    const headRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const head = headRef.current;
        const page = head?.parentElement;
        if (!head || !page) return;
        const ro = new ResizeObserver(() => page.style.setProperty("--mv-head", `${head.offsetHeight}px`));
        ro.observe(head);
        return () => ro.disconnect();
    }, []);

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
            <div ref={headRef} className={s.head} data-compact={p.compact ? "" : undefined}>
                {p.lead && <Lead parts={p.lead} family={p.family} />}
                <div className={s.bar}>
                    {p.before}
                    {p.filterOptions.length > 0 && (
                        <div className={s.filters}>
                            <FilterFit
                                active={(p.filter !== p.filterAll ? 1 : 0) + (p.filterMore ?? 0)}
                                onClear={p.onClear ?? (() => p.onFilter(p.filterAll))}
                                aside={p.aside}
                                panelExtra={p.panelExtra}
                                short={p.compact}
                                sort={
                                    p.sort !== undefined && p.onSort
                                        ? {
                                              label: "Ordina",
                                              value: p.sort,
                                              options: p.sortOptions ?? (VETRINA_SORT as unknown as readonly { value: S; label: string }[]),
                                              onChange: p.onSort
                                          }
                                        : undefined
                                }
                            >
                                <ChipGroupSingle<F> ariaLabel="Quali mostrare" layout="auto" value={p.filter} onChange={p.onFilter} options={p.filterOptions} />
                            </FilterFit>
                        </div>
                    )}
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
