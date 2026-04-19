import { useEffect } from 'react';

const SUFFIX = 'CataloGlobe';

export function usePageTitle(title?: string): void {
    useEffect(() => {
        document.title = title ? `${title} | ${SUFFIX}` : SUFFIX;
        return () => {
            document.title = SUFFIX;
        };
    }, [title]);
}
