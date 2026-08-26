import React, { useEffect, useRef, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { Select } from "@/components/ui/Select/Select";
import { TextInput } from "@/components/ui/Input/TextInput";
import { Switch } from "@/components/ui/Switch/Switch";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { listCatalogs, type V2Catalog } from "@/services/supabase/catalogs";
import { listStyles, type V2Style } from "@/services/supabase/styles";
import { getActivityById } from "@/services/supabase/activities";
import type { MenuPdfAllergenCoverage, MenuPdfData } from "@/services/pdf/menuPdfTypes";
import { useToast } from "@/context/Toast/ToastContext";
import {
  buildAllergenCoverageMessage,
  pdfDataCacheKey,
} from "./exportCatalogMessages";
import styles from "./ExportCatalogDrawer.module.scss";

type ExportCatalogDrawerProps = {
  open: boolean;
  onClose: () => void;
  activityId: string;
  activityName: string;
  tenantId: string;
};

export function ExportCatalogDrawer({
  open,
  onClose,
  activityId,
  activityName,
  tenantId,
}: ExportCatalogDrawerProps) {
  const { showToast } = useToast();
  const [catalogs, setCatalogs] = useState<V2Catalog[]>([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>("");
  // Preselezionato = stile corrente della sede (per nome). "" solo se il tenant
  // non ha stili con config → download ricade sulla catena stile (nessuna regressione).
  const [availableStyles, setAvailableStyles] = useState<V2Style[]>([]);
  const [selectedStyleId, setSelectedStyleId] = useState<string>("");
  // Id dello stile corrente della sede: marca la sua label con " (attuale)".
  const [currentStyleId, setCurrentStyleId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(false);
  const [isLoadingStyles, setIsLoadingStyles] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [includePhotos, setIncludePhotos] = useState(false);
  // Menù compatto: default off. Il PDF va in stampa — nessuno deve ritrovarsi
  // l'impaginato cambiato senza averlo chiesto.
  const [compactMenu, setCompactMenu] = useState(false);
  // Toggle cover mostrato solo se la sede ha un'immagine di copertina.
  const [hasCoverImage, setHasCoverImage] = useState(false);
  const [includeCoverImage, setIncludeCoverImage] = useState(true);
  // Copertura allergeni del catalogo selezionato: informazione accessoria,
  // null = niente da mostrare (non caricata, fallita, o copertura sufficiente).
  const [allergenCoverage, setAllergenCoverage] =
    useState<MenuPdfAllergenCoverage | null>(null);
  // Payload già caricati, riusati al download. Ref e non state: non deve
  // triggerare render.
  const pdfDataCacheRef = useRef<Map<string, MenuPdfData>>(new Map());
  // Lo stile non entra nelle deps del preload (la copertura non dipende dallo
  // stile: cambiarlo non deve far ripartire il caricamento) ma serve al momento
  // della richiesta per la chiave di cache → letto via ref.
  const selectedStyleIdRef = useRef(selectedStyleId);
  selectedStyleIdRef.current = selectedStyleId;
  // "Gli stili di QUESTA apertura sono risolti". Ref e non state perché va
  // azzerato in modo sincrono all'apertura: un reset via setState arriverebbe
  // solo al commit successivo, e nel frattempo il preload partirebbe leggendo il
  // valore della sessione precedente (→ fetch sprecata sul vecchio catalogo).
  const stylesResolvedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setSelectedCatalogId("");
    setSelectedStyleId("");
    setCurrentStyleId(null);
    setFileName("");
    setIncludePhotos(false);
    setCompactMenu(false);
    setHasCoverImage(false);
    setIncludeCoverImage(true);
    setAllergenCoverage(null);
    // Riapertura = dati freschi: il catalogo può essere stato modificato dopo
    // l'ultima apertura del drawer.
    pdfDataCacheRef.current.clear();
    stylesResolvedRef.current = false;

    async function loadActivityCover() {
      try {
        const activity = await getActivityById(activityId, tenantId);
        setHasCoverImage(!!activity?.cover_image);
      } catch {
        // Silenzioso: senza info cover il toggle resta nascosto (default on).
        setHasCoverImage(false);
      }
    }

    async function loadCatalogsList() {
      setIsLoadingCatalogs(true);
      try {
        const result = await listCatalogs(tenantId);
        setCatalogs(result);
        if (result.length > 0) {
          const first = result[0];
          setSelectedCatalogId(first.id);
          setFileName(`${first.name ?? "Catalogo"} - ${activityName}`);
        }
      } catch {
        showToast({
          message: "Errore nel caricamento dei cataloghi.",
          type: "error",
        });
      } finally {
        setIsLoadingCatalogs(false);
      }
    }

    async function loadStylesList() {
      setIsLoadingStyles(true);
      try {
        // resolveCurrentStyleId vive nel chunk lazy del PDF (deps data
        // layer): import() dinamico come per loadMenuPdfData, resta fuori
        // dal bundle principale.
        const [{ resolveCurrentStyleId }, result] = await Promise.all([
          import("@/services/pdf/loadMenuPdfData"),
          listStyles(tenantId),
        ]);
        // Solo stili con config valida: quelli senza current_version non
        // sono tematizzabili (parseTokens richiede la config).
        const usable = result.filter((s) => s.current_version?.config);
        setAvailableStyles(usable);

        const currentId = await resolveCurrentStyleId(tenantId, activityId);
        setCurrentStyleId(currentId);
        // Preseleziona il corrente per nome. Difensivo: se l'id risolto
        // non è tra le opzioni usabili → stile system → primo con config.
        const preselect =
          (currentId && usable.find((s) => s.id === currentId)?.id) ||
          usable.find((s) => s.is_system)?.id ||
          usable[0]?.id ||
          "";
        setSelectedStyleId(preselect);
      } catch {
        showToast({
          message: "Errore nel caricamento degli stili.",
          type: "error",
        });
      } finally {
        // Anche in caso di errore: lo stile resta "" e il preload procede con
        // quella chiave (il click userà la stessa) invece di restare bloccato.
        stylesResolvedRef.current = true;
        setIsLoadingStyles(false);
      }
    }

    void loadActivityCover();
    void loadCatalogsList();
    void loadStylesList();
  }, [open, tenantId, activityId, activityName, showToast]);

  // Precarica il payload PDF del catalogo selezionato per ricavarne la
  // copertura allergeni. Stessa funzione del download → stesso numero che
  // finirà nel documento (override di visibilità di sede inclusi), zero query
  // aggiuntive. Effetto collaterale voluto: al click i dati sono già pronti.
  //
  // Deps volutamente senza selectedStyleId: la copertura non dipende dallo
  // stile, cambiarlo non deve far ripartire il caricamento. C'è invece
  // isLoadingStyles, che serve solo a far avvenire il PRIMO preload a stile già
  // noto (vedi guard sotto).
  useEffect(() => {
    if (!open || !selectedCatalogId) {
      setAllergenCoverage(null);
      return;
    }

    // Attendi che gli stili siano risolti: la chiave di cache include lo stile,
    // e precaricare a stile ancora vuoto garantirebbe un cache miss al click →
    // loadMenuPdfData due volte nel percorso più comune. Il flag va a true anche
    // quando il caricamento stili FALLISCE o la sede non ha stili usabili: in
    // quel caso si precarica con styleId "" e il click, che usa lo stesso "",
    // fa comunque cache hit. Nessun blocco permanente.
    // `isLoadingStyles` è nelle deps solo per far ri-scattare l'effetto quando
    // il flag diventa true (un ref non provoca render da sé).
    if (!stylesResolvedRef.current) return;

    // Reset immediato: mai mostrare i numeri del catalogo precedente mentre
    // arriva la risposta del nuovo.
    setAllergenCoverage(null);

    const styleId = selectedStyleIdRef.current;
    const cached = pdfDataCacheRef.current.get(
      pdfDataCacheKey(selectedCatalogId, styleId),
    );
    if (cached) {
      setAllergenCoverage(cached.allergenCoverage);
      return;
    }

    // `cancelled` (idiom del progetto): una risposta in volo su un catalogo
    // ormai deselezionato viene scartata invece di sovrascrivere la corrente.
    let cancelled = false;

    async function loadCoverage(catalogId: string) {
      try {
        const { loadMenuPdfData } = await import("@/services/pdf/loadMenuPdfData");
        const data = await loadMenuPdfData(
          tenantId,
          activityId,
          catalogId,
          styleId || undefined,
        );
        // La cache si popola anche se la risposta è stale: il payload è valido
        // per la sua chiave e serve comunque a un eventuale ritorno.
        pdfDataCacheRef.current.set(pdfDataCacheKey(catalogId, styleId), data);
        if (cancelled) return;
        setAllergenCoverage(data.allergenCoverage);
      } catch (error: unknown) {
        // Informazione accessoria: se non si riesce a calcolarla si tace.
        // Nessun toast, nessun blocco: il download al click gestisce i propri
        // errori per conto suo.
        console.warn("Allergen coverage preload failed:", error);
      }
    }

    void loadCoverage(selectedCatalogId);
    return () => {
      cancelled = true;
    };
  }, [open, selectedCatalogId, isLoadingStyles, tenantId, activityId]);

  const handleCatalogChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedCatalogId(id);
    const catalog = catalogs.find((c) => c.id === id);
    setFileName(`${catalog?.name ?? "Catalogo"} - ${activityName}`);
  };

  const handleDownload = async () => {
    if (!selectedCatalogId) return;
    setIsDownloading(true);
    try {
      // Import dinamici: react-pdf resta nel chunk lazy, fuori dal
      // bundle principale.
      const [{ loadMenuPdfData }, { renderMenuPdfBlob }] = await Promise.all([
        import("@/services/pdf/loadMenuPdfData"),
        import("@/services/pdf/renderMenuPdf"),
      ]);
      // Payload già precaricato per (catalogo, stile) correnti → riuso, niente
      // seconda fetch. Chiave con lo stile: riusare un payload risolto su un
      // altro stile produrrebbe un PDF con la tematizzazione sbagliata.
      const cacheKey = pdfDataCacheKey(selectedCatalogId, selectedStyleId);
      const data =
        pdfDataCacheRef.current.get(cacheKey) ??
        (await loadMenuPdfData(
          tenantId,
          activityId,
          selectedCatalogId,
          selectedStyleId || undefined,
        ));
      pdfDataCacheRef.current.set(cacheKey, data);
      const blob = await renderMenuPdfBlob(data, {
        includePhotos,
        includeCoverImage,
        // Ridondante col gate a valle nel documento, ma tiene l'intenzione
        // esplicita anche nel payload: con le foto attive niente affiancamento.
        compact: compactMenu && !includePhotos,
      });

      const base =
        fileName.trim() ||
        `${data.meta.catalogName} - ${data.meta.activityName}`;
      const finalName = base.toLowerCase().endsWith(".pdf")
        ? base
        : `${base}.pdf`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = finalName;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      onClose();
    } catch (error: unknown) {
      console.error("Menu PDF generation failed:", error);
      showToast({
        message: "Errore durante la generazione del PDF.",
        type: "error",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const catalogOptions = catalogs.map((c) => ({
    value: c.id,
    label: c.name ?? "Catalogo senza nome",
  }));

  const allergenCoverageMessage = allergenCoverage
    ? buildAllergenCoverageMessage(allergenCoverage)
    : null;

  // Solo gli stili reali del tenant; il corrente è preselezionato per nome e
  // marcato " (attuale)" nella sola label (value/id invariati).
  const styleOptions = availableStyles.map((s) => ({
    value: s.id,
    label: s.id === currentStyleId ? `${s.name} (attuale)` : s.name,
  }));

  return (
    <SystemDrawer open={open} onClose={onClose} width={420}>
      <DrawerLayout
        header={
          <div>
            <Text variant="title-sm" weight={600}>
              Esporta catalogo PDF
            </Text>
            <Text variant="body-sm" colorVariant="muted">
              Scegli il catalogo da esportare in formato PDF stampabile.
            </Text>
          </div>
        }
        footer={
          <>
            <Button
              variant="secondary"
              onClick={onClose}
              disabled={isDownloading}
            >
              Annulla
            </Button>
            <Button
              variant="primary"
              onClick={handleDownload}
              loading={isDownloading}
              disabled={
                !selectedCatalogId ||
                isDownloading ||
                isLoadingCatalogs ||
                isLoadingStyles
              }
            >
              {isDownloading ? "Generazione…" : "Scarica PDF"}
            </Button>
          </>
        }
      >
        <div className={styles.fieldStack}>
          <Select
            label="Catalogo"
            options={catalogOptions}
            value={selectedCatalogId}
            onChange={handleCatalogChange}
            disabled={isLoadingCatalogs || isDownloading}
            helperText={
              isLoadingCatalogs
                ? "Caricamento cataloghi…"
                : catalogs.length === 0 && !isLoadingCatalogs
                  ? "Nessun catalogo disponibile."
                  : undefined
            }
          />
          {allergenCoverageMessage ? (
            <InlineBanner variant="info">{allergenCoverageMessage}</InlineBanner>
          ) : null}
          <Select
            label="Stile"
            options={styleOptions}
            value={selectedStyleId}
            onChange={(e) => setSelectedStyleId(e.target.value)}
            disabled={isLoadingStyles || isDownloading}
            helperText={
              isLoadingStyles
                ? "Caricamento stili…"
                : "Applicato solo a questo PDF. Non modifica lo stile pubblicato della sede."
            }
          />
          <TextInput
            label="Nome file"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder="Es. Catalogo Completo - McDonald's Viale Certosa"
            disabled={isDownloading}
            helperText="Senza estensione .pdf"
          />
          {hasCoverImage ? (
            <Switch
              label="Includi immagine di copertina"
              helperText="Mostra l'immagine di copertina nella prima pagina del PDF."
              checked={includeCoverImage}
              onChange={setIncludeCoverImage}
              disabled={isDownloading}
            />
          ) : null}
          <Switch
            label="Includi foto"
            helperText="Mostra le foto caricate direttamente (non i link esterni). I piatti senza foto avranno un segnaposto."
            checked={includePhotos}
            onChange={setIncludePhotos}
            disabled={isDownloading}
          />
          <Switch
            label="Menù compatto"
            // Con le foto attive l'affiancamento non si applica (la miniatura
            // riserva il gutter su ogni riga): il toggle si spegne e lo dice,
            // invece di restare acceso e inerte.
            helperText={
              includePhotos
                ? "Non disponibile con le foto: la miniatura occupa lo spazio della seconda colonna."
                : "Affianca su due colonne i piatti senza descrizione. Utile per liste di bevande, contorni e simili."
            }
            checked={compactMenu && !includePhotos}
            onChange={setCompactMenu}
            disabled={isDownloading || includePhotos}
          />
        </div>
      </DrawerLayout>
    </SystemDrawer>
  );
}
