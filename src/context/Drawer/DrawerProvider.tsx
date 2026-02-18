import { ReactNode, useState, useCallback, useMemo, useRef, useEffect, useId } from "react";
import { DrawerContext, DrawerOptions, DrawerSize } from "./DrawerContext";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";

const SIZE_MAP: Record<DrawerSize, number> = {
    sm: 420,
    md: 520,
    lg: 720
};

export const DrawerProvider = ({ children }: { children: ReactNode }) => {
    const [isOpen, setIsOpen] = useState(false);

    // Stable ID for this provider instance
    const baseId = useId();
    const generatedTitleId = `${baseId}-drawer-title`;

    // Internal state to hold active drawer config
    const [drawerState, setDrawerState] = useState<{
        content: ReactNode | null;
        title?: string;
        footer?: ReactNode;
        size: DrawerSize;
        ariaLabelledBy?: string;
        ariaDescribedBy?: string;
    }>({
        content: null,
        title: undefined,
        footer: undefined,
        size: "md"
    });

    const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const openDrawer = useCallback((options: DrawerOptions) => {
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
        }

        setDrawerState({
            content: options.content,
            title: options.title,
            footer: options.footer,
            size: options.size || "md",
            ariaLabelledBy: options.ariaLabelledBy,
            ariaDescribedBy: options.ariaDescribedBy
        });
        setIsOpen(true);
    }, []);

    const closeDrawer = useCallback(() => {
        setIsOpen(false);

        // Clear content after animation completes to avoid unmounting during exit transition
        if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
        }

        closeTimeoutRef.current = setTimeout(() => {
            setDrawerState(prev => ({
                ...prev,
                content: null,
                title: undefined,
                footer: undefined
            }));
        }, 250); // Matches typical animation duration
    }, []);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (closeTimeoutRef.current) {
                clearTimeout(closeTimeoutRef.current);
            }
        };
    }, []);

    const contextValue = useMemo(
        () => ({
            openDrawer,
            closeDrawer
        }),
        [openDrawer, closeDrawer]
    );

    // Derived props
    const width = SIZE_MAP[drawerState.size];

    // ARIA Logic
    const titleId = drawerState.title ? drawerState.ariaLabelledBy || generatedTitleId : undefined;

    const finalAriaLabelledBy = drawerState.title ? titleId : drawerState.ariaLabelledBy;

    return (
        <DrawerContext.Provider value={contextValue}>
            {children}
            <SystemDrawer
                open={isOpen}
                onClose={closeDrawer}
                width={width}
                aria-labelledby={finalAriaLabelledBy}
                aria-describedby={drawerState.ariaDescribedBy}
            >
                <DrawerLayout
                    header={
                        drawerState.title ? (
                            <h3 id={titleId} style={{ margin: 0 }}>
                                {drawerState.title}
                            </h3>
                        ) : undefined
                    }
                    footer={drawerState.footer}
                >
                    {drawerState.content}
                </DrawerLayout>
            </SystemDrawer>
        </DrawerContext.Provider>
    );
};
