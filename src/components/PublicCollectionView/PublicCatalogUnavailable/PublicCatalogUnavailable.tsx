import { useTranslation } from "react-i18next";
import { IconChefHat } from "@tabler/icons-react";
import { Avatar } from "@/components/ui/Avatar/Avatar";
import PublicThemeScope from "@/features/public/components/PublicThemeScope";
import type { PublicBusiness } from "@/types/publicCatalog";
import styles from "./PublicCatalogUnavailable.module.scss";

type Props = {
    business: PublicBusiness;
    tenantLogoUrl: string | null;
};

/**
 * Schermata chrome-less per lo stato `catalog_empty` della pagina pubblica:
 * una regola di programmazione ha agganciato un catalogo ma questo non ha
 * prodotti visibili ORA. Niente header/search/···/hub — solo branding minimo
 * della sede (logo + nome) e un messaggio sobrio. Non è un errore/404: vedi
 * `NotFound` per quello (link rotto, sede inesistente).
 *
 * `PublicThemeScope` senza `style`: in questo stato il resolver non ha
 * risolto alcun token di stile, la scope applica i default
 * (`parseTokens(null)`) — coerente col resto del pubblico, niente hardcode.
 */
export default function PublicCatalogUnavailable({ business, tenantLogoUrl }: Props) {
    const { t } = useTranslation("public");

    return (
        <PublicThemeScope className={styles.scope}>
            <main className={styles.container} role="main">
                <div className={styles.card}>
                    <Avatar
                        name={business.name}
                        imageUrl={tenantLogoUrl ?? undefined}
                        size="lg"
                        className={styles.avatar}
                    />
                    <p className={styles.businessName}>{business.name}</p>
                    <div className={styles.icon} aria-hidden="true">
                        <IconChefHat size={40} stroke={1.5} />
                    </div>
                    <h1 className={styles.title}>{t("page.catalog_empty_title")}</h1>
                    <p className={styles.description}>{t("page.catalog_empty_description")}</p>
                </div>
            </main>
        </PublicThemeScope>
    );
}
