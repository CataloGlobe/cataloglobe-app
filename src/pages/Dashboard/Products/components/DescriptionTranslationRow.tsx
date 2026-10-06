import { Fragment, useCallback, useEffect, useState } from "react";
import Text from "@/components/ui/Text/Text";
import {
    getFieldTranslationStatus,
    retryFailedTranslation,
    type FieldLanguageStatus
} from "@/services/supabase/translationStatus";
import { listAvailableLanguages } from "@/services/supabase/tenantLanguages";
import styles from "./DescriptionTranslationRow.module.scss";

const POLLING_INTERVAL_MS = 5000;

/** «l'inglese», «lo spagnolo», «il francese». */
function withArticle(name: string): string {
    if (/^[aeiou]/i.test(name)) return `l'${name}`;
    if (/^(s[^aeiou]|z|gn|ps|x|y)/i.test(name)) return `lo ${name}`;
    return `il ${name}`;
}

/** «inglese», «inglese e tedesco», «inglese, francese e tedesco». */
function joinNames(names: string[]): string {
    if (names.length <= 1) return names.join("");
    return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

type DescriptionTranslationRowProps = {
    tenantId: string;
    productId: string;
    /** Cambia con la descrizione: la riga si ricarica dopo il salvataggio. */
    refreshKey: string;
    onOpenTranslations: () => void;
};

/**
 * La riga traduzioni sotto la descrizione (correzioni UI PS3): prima le lingue
 * tradotte, poi una voce per lingua che manca, è in corso o non è riuscita
 * (con «Riprova»); a destra «Apri Traduzioni →». Senza lingue attive o senza
 * descrizione la riga non c'è.
 */
export function DescriptionTranslationRow({
    tenantId,
    productId,
    refreshKey,
    onOpenTranslations
}: DescriptionTranslationRowProps) {
    const [languages, setLanguages] = useState<FieldLanguageStatus[] | null>(null);
    const [names, setNames] = useState<Record<string, string>>({});
    const [retrying, setRetrying] = useState<string | null>(null);

    const fetchStatus = useCallback(async () => {
        try {
            const status = await getFieldTranslationStatus(tenantId, "product", productId, "description");
            setLanguages(status.sourceHash === null ? [] : (status.languages ?? []));
        } catch (err) {
            console.error("[DescriptionTranslationRow] fetch failed:", err);
        }
    }, [tenantId, productId]);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus, refreshKey]);

    useEffect(() => {
        let cancelled = false;
        listAvailableLanguages()
            .then(list => {
                if (cancelled) return;
                setNames(Object.fromEntries(list.map(l => [l.code, (l.name_it || l.name_native).toLowerCase()])));
            })
            .catch(err => console.error("[DescriptionTranslationRow] languages failed:", err));
        return () => {
            cancelled = true;
        };
    }, []);

    // Si ricarica ogni 5 secondi solo finché c'è una lingua in corso.
    const hasPending = languages?.some(l => l.state === "pending") ?? false;
    useEffect(() => {
        if (!hasPending) return;
        const interval = setInterval(fetchStatus, POLLING_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [hasPending, fetchStatus]);

    const handleRetry = async (code: string) => {
        setRetrying(code);
        try {
            await retryFailedTranslation(tenantId, "product", productId, "description", code);
            await fetchStatus();
        } catch (err) {
            console.error("[DescriptionTranslationRow] retry failed:", err);
        } finally {
            setRetrying(null);
        }
    };

    if (!languages || languages.length === 0) return null;

    const nameOf = (code: string) => names[code] ?? code.toUpperCase();
    const done = languages.filter(l => l.state === "done").map(l => nameOf(l.code));
    const open = languages.filter(l => l.state !== "done");

    return (
        <div className={styles.row}>
            <Text as="p" variant="body-sm" colorVariant="muted" className={styles.summary}>
                {done.length > 0 ? `Descrizione tradotta in ${joinNames(done)}` : "Descrizione non ancora tradotta"}
                {open.map(l => (
                    <Fragment key={l.code}>
                        {" · "}
                        <Text as="span" variant="body-sm" colorVariant="warning">
                            {l.state === "missing" && `manca ${withArticle(nameOf(l.code))}`}
                            {l.state === "stale" && `${nameOf(l.code)} da rivedere`}
                            {l.state === "pending" && `${nameOf(l.code)} in corso`}
                            {l.state === "failed" && `${nameOf(l.code)} non riuscita · `}
                        </Text>
                        {l.state === "failed" && (
                            <button
                                type="button"
                                className={styles.link}
                                onClick={() => handleRetry(l.code)}
                                disabled={retrying !== null}
                                aria-label={`Riprova la traduzione in ${nameOf(l.code)}`}
                            >
                                Riprova
                            </button>
                        )}
                    </Fragment>
                ))}
            </Text>
            <button type="button" className={styles.link} onClick={onOpenTranslations}>
                <Text as="span" variant="body-sm" weight={500} colorVariant="primary">
                    Apri Traduzioni →
                </Text>
            </button>
        </div>
    );
}
