/* eslint-disable react-refresh/only-export-components -- galleria dev: componenti di sezione + elenco nello stesso file, niente fast refresh da preservare */
import { useMemo, useState } from "react";
import { Home, MapPin, UtensilsCrossed, BarChart3, Plus, Grid2X2, List, Languages, CalendarCheck } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { SearchInput } from "@/components/ui/Input/SearchInput";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { AppSidebar, type AppSidebarNavGroup } from "@/components/layout/AppSidebar/AppSidebar";
import { PageHeaderSlot } from "@/components/layout/PageHeaderSlot";
import { PageHeaderProvider } from "@/context/PageHeaderProvider";
import { usePageHeader } from "@/context/usePageHeader";
import { State, noop, type GallerySection } from "../gallery";
import styles from "../DevUiPage.module.scss";

const GROUPS: AppSidebarNavGroup[] = [
    {
        items: [
            { to: "/dev/ui#appsidebar", label: "Panoramica", icon: <Home size={20} />, end: true },
            { to: "/dev/ui/sedi", label: "Sedi", icon: <MapPin size={20} /> }
        ]
    },
    {
        title: "Contenuti",
        items: [
            { to: "/dev/ui/menu", label: "Menù", icon: <UtensilsCrossed size={20} />, showDot: true, dotLabel: "2 da rivedere" },
            { to: "/dev/ui/lingue", label: "Lingue", icon: <Languages size={20} />, loading: true, loadingLabel: "Traduzioni in corso", badge: 12 },
            { to: "/dev/ui/prenotazioni", label: "Prenotazioni", icon: <CalendarCheck size={20} />, badge: 3, badgeTone: "brand", locked: true }
        ]
    },
    {
        title: "Insight",
        items: [
            { to: "/dev/ui/analitiche", label: "Analitiche", icon: <BarChart3 size={20} />, disabled: true, disabledHint: "In arrivo" }
        ]
    }
];

function AppSidebarSection() {
    const [collapsed, setCollapsed] = useState(false);
    return (
        <>
            <State label="espansa: titoli di gruppo, voce attiva, puntino, spinner + contatore, contatore brand + lucchetto «Pro», disabilitata" column>
                <div className={`${styles.box} ${styles.boxSidebar}`}>
                    <AppSidebar
                        groups={GROUPS}
                        isMobile={false}
                        mobileOpen={false}
                        collapsed={false}
                        onRequestClose={noop}
                        onToggleCollapse={noop}
                        footerSlot={
                            <Text variant="caption" colorVariant="muted" align="center">
                                footerSlot
                            </Text>
                        }
                    />
                </div>
            </State>
            <State label="collassata (toggle funzionante): restano icona, spinner e puntino; contatore e lucchetto vanno nel tooltip" column>
                <div className={`${styles.box} ${styles.boxSidebar}`}>
                    <AppSidebar
                        groups={GROUPS}
                        isMobile={false}
                        mobileOpen={false}
                        collapsed={collapsed}
                        onRequestClose={noop}
                        onToggleCollapse={() => setCollapsed(c => !c)}
                    />
                </div>
            </State>
        </>
    );
}

/** Dichiara la header band come farebbe una pagina dentro MainLayout. */
function PageHeaderConfigurator() {
    const [view, setView] = useState<"grid" | "list">("grid");
    const leading = useMemo(
        () => (
            <SegmentedControl
                value={view}
                onChange={setView}
                size="sm"
                options={[
                    { value: "grid", label: "Griglia", icon: <Grid2X2 size={16} /> },
                    { value: "list", label: "Lista", icon: <List size={16} /> }
                ]}
            />
        ),
        [view]
    );
    const actions = useMemo(
        () => (
            <>
                <SearchInput placeholder="Cerca una sede" allowClear />
                <Button variant="primary" leftIcon={<Plus size={16} />} onClick={noop}>
                    Nuova sede
                </Button>
            </>
        ),
        []
    );
    usePageHeader({ leading, actions });
    return null;
}

function PageHeaderSlotSection() {
    return (
        <State label="header band: leading + actions" column>
            <div className={styles.box}>
                <PageHeaderProvider>
                    <PageHeaderSlot />
                    <PageHeaderConfigurator />
                </PageHeaderProvider>
            </div>
        </State>
    );
}

export const layoutSections: GallerySection[] = [
    { id: "appsidebar", title: "AppSidebar", sheet: "AppSidebar", Component: AppSidebarSection },
    { id: "pageheaderslot", title: "PageHeaderSlot", sheet: "PageHeader", Component: PageHeaderSlotSection }
];
