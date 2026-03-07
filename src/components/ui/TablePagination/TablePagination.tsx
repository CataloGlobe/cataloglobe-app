import React from "react";
import styles from "./TablePagination.module.scss";
import Text from "@/components/ui/Text/Text";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

interface TablePaginationProps {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
}

const PAGE_SIZE_OPTIONS = [20, 50, 100];

export function TablePagination({
    page,
    pageSize,
    total,
    onPageChange,
    onPageSizeChange
}: TablePaginationProps) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const canPrev = page > 1;
    const canNext = page < totalPages;

    return (
        <div className={styles.pagination}>
            <div className={styles.sizeSelector}>
                <Text variant="body-sm" colorVariant="muted">
                    Righe per pagina:
                </Text>
                <select
                    className={styles.select}
                    value={pageSize}
                    onChange={e => {
                        onPageSizeChange(Number(e.target.value));
                        onPageChange(1);
                    }}
                >
                    {PAGE_SIZE_OPTIONS.map(size => (
                        <option key={size} value={size}>
                            {size}
                        </option>
                    ))}
                </select>
            </div>

            <div className={styles.controls}>
                <button
                    className={styles.navButton}
                    onClick={() => onPageChange(page - 1)}
                    disabled={!canPrev}
                    aria-label="Pagina precedente"
                >
                    <IconChevronLeft size={16} />
                </button>
                <Text variant="body-sm" colorVariant="muted">
                    Pagina {page} di {totalPages}
                </Text>
                <button
                    className={styles.navButton}
                    onClick={() => onPageChange(page + 1)}
                    disabled={!canNext}
                    aria-label="Pagina successiva"
                >
                    <IconChevronRight size={16} />
                </button>
            </div>
        </div>
    );
}
