import { useLocation, useNavigate, useParams } from "react-router-dom";
import { usePermissions } from "@/context/usePermissions";
import { usePlanFeatures } from "@/lib/planFeatures";
import { useSedeScope } from "@/hooks/useSedeScope";
import { useConfrontoOpts, useSediVista } from "@/hooks/useSediVista";
import { SediBottone, type SedeScelta } from "@/components/ui/SediPannello/SediPannello";
import { entryPath, isNavEntryUsable, navPart, seatOf, switchSedePath } from "@/utils/navModel";
import styles from "./PageTitleBar.module.scss";

/** `/business/:businessId/locations/:activityId[/:segment]`: la sede in vista. */
const SEDE_PATH = /^\/business\/[^/]+\/locations\/([^/]+)(?:\/([^/?#]+))?/;

interface SediInAltoProps {
    /** La sezione e la parte aperte (chiavi del modello della navigazione). */
    groupKey?: string;
    entryKey?: string;
}

/**
 * «Sede» e «Confronta con» in alto a destra, accanto alla notifica (D152,
 * Alex 2026-10-09). Il pannello è quello comune (D151). Cosa si può scegliere
 * lo dice la parte aperta (`seatOf`) e quello che gli indirizzi di oggi
 * sanno fare: «Tutte le sedi» è la pagina dell'azienda, una sede la sua
 * pagina; i gruppi solo dove la pagina li legge (per ora il Calendario).
 * «Confronta con» compare solo se la pagina lo dichiara (`useConfrontoQui`)
 * e si guarda una sede.
 *
 * Il Calendario è una pagina sola per tutte le sedi: la scelta non cambia
 * indirizzo, cambia lo stato comune che la pagina legge, con «Tutte», i
 * gruppi e la nota per sede che la pagina passa a `useConfrontoQui`.
 */
export function SediInAlto({ groupKey, entryKey }: SediInAltoProps) {
    const { businessId = "" } = useParams<{ businessId: string }>();
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const { permissions } = usePermissions();
    const { hasFeature } = usePlanFeatures();
    const { readableActivities, isLoaded } = useSedeScope();
    const vista = useSediVista(businessId);

    const part = navPart(groupKey, entryKey);
    // Una sede sola: non c'è niente da scegliere.
    if (!part || !isLoaded || readableActivities.length < 2) return null;
    if (part.group.key === "calendario") {
        // Solo la vista Calendario, quando è montata (le Regole hanno i loro filtri).
        if (part.entry.key !== "calendario" || !vista.confrontoQui) return null;
        return <SediCalendario sedi={readableActivities.map(a => ({ id: a.id, name: a.name }))} businessId={businessId} />;
    }

    const { entry } = part;
    const { seat, confronto } = seatOf(part.group, entry);
    if (seat !== "multi" && seat !== "one") return null;
    const canAll = seat === "multi" && entry.level === "azienda";
    const canOne = entry.level === "sede" || !!entry.sedeSegment;
    // Panoramica di una sede: non c'è ancora.
    if (!canOne) return null;

    const match = SEDE_PATH.exec(pathname);
    const pathId = match?.[1] ?? null;
    const value: SedeScelta = pathId ? { kind: "sede", id: pathId } : { kind: "all" };
    const sedi = readableActivities.map(a => ({ id: a.id, name: a.name }));
    const current = pathId ? sedi.find(a => a.id === pathId) : null;

    const choose = (next: SedeScelta) => {
        if (next.kind === "sede") {
            if (next.id === pathId) return;
            vista.setSede(next);
            // La stessa parte nella sede nuova; se lì non si può usare, si atterra come entrando.
            const usable = permissions && isNavEntryUsable(entry, permissions, hasFeature, next.id);
            navigate(
                usable || !permissions
                    ? entryPath(entry, businessId, next.id)
                    : switchSedePath(match?.[2] ?? null, businessId, next.id, permissions, hasFeature)
            );
            return;
        }
        if (next.kind === "all" && pathId) {
            vista.setSede(next);
            navigate(entryPath(entry, businessId, null));
        }
    };

    const showConfronto = confronto && vista.confrontoQui && value.kind === "sede";
    const altre = sedi.filter(a => a.id !== pathId);
    const confrontate = altre.filter(a => vista.confronta.has(a.id));

    return (
        <div className={styles.sedi}>
            <SediBottone
                mode="one"
                sedi={sedi}
                value={value}
                onChange={choose}
                allowAll={canAll}
                title="Cosa guardi"
                className={styles.sedeBtn}
            >
                <span className={styles.pre}>Sede</span>
                {current ? current.name : "Tutte le sedi"}
            </SediBottone>
            {showConfronto && (
                <SediBottone
                    sedi={altre}
                    value={confrontate.map(a => a.id)}
                    onChange={ids => vista.setConfronta(ids)}
                    allLabel="Tutte le altre sedi"
                    title="Confronta con"
                    className={`${styles.sedeBtn} ${confrontate.length ? styles.confrontoOn : ""}`}
                >
                    <span className={styles.pre}>Confronta con</span>
                    {confrontate.length === 0
                        ? "…"
                        : confrontate.length === altre.length
                          ? "Tutte le altre"
                          : confrontate.length === 1
                            ? confrontate[0].name
                            : `${confrontate[0].name} +${confrontate.length - 1}`}
                </SediBottone>
            )}
        </div>
    );
}

/** «Sede» e «Confronta con» del Calendario: sullo stato comune, senza indirizzo. */
function SediCalendario({ sedi, businessId }: { sedi: { id: string; name: string }[]; businessId: string }) {
    const vista = useSediVista(businessId);
    const { gruppi = [], tag } = useConfrontoOpts();
    // Senza scelta si guarda la prima sede, come fa la pagina.
    const v = vista.sede;
    const value: SedeScelta =
        v?.kind === "all" ||
        (v?.kind === "gruppo" && gruppi.some(g => g.id === v.id)) ||
        (v?.kind === "sede" && sedi.some(a => a.id === v.id))
            ? v
            : { kind: "sede", id: sedi[0]?.id ?? "" };
    const current = value.kind === "sede" ? sedi.find(a => a.id === value.id) : null;
    const label =
        value.kind === "all"
            ? "Tutte le sedi"
            : value.kind === "gruppo"
              ? (gruppi.find(g => g.id === value.id)?.name ?? "Gruppo")
              : (current?.name ?? "");
    const altre = current ? sedi.filter(a => a.id !== current.id) : [];
    const confrontate = altre.filter(a => vista.confronta.has(a.id));
    return (
        <div className={styles.sedi}>
            <SediBottone
                mode="one"
                sedi={sedi}
                gruppi={gruppi}
                value={value}
                onChange={next => vista.setSede(next)}
                allowAll
                title="Cosa guardi"
                className={styles.sedeBtn}
            >
                <span className={styles.pre}>Sede</span>
                {label}
            </SediBottone>
            {current && (
                <SediBottone
                    sedi={altre}
                    gruppi={gruppi}
                    value={confrontate.map(a => a.id)}
                    onChange={ids => vista.setConfronta(ids)}
                    allLabel="Tutte le altre sedi"
                    title="Confronta con"
                    tag={tag}
                    className={`${styles.sedeBtn} ${confrontate.length ? styles.confrontoOn : ""}`}
                >
                    <span className={styles.pre}>Confronta con</span>
                    {confrontate.length === 0
                        ? "…"
                        : confrontate.length === altre.length
                          ? "Tutte le altre"
                          : confrontate.length === 1
                            ? confrontate[0].name
                            : `${confrontate[0].name} +${confrontate.length - 1}`}
                </SediBottone>
            )}
        </div>
    );
}
