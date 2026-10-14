import type { ReactNode } from "react";
import { LazyMotion } from "framer-motion";

const loadFeatures = () => import("./motionFeatures").then(mod => mod.default);

/**
 * LazyMotion per i componenti che usano `m` al posto di `motion`: il codice
 * delle animazioni non entra nel bundle iniziale e arriva in un chunk lazy.
 * Finché non è arrivato, un `m.div` si disegna fermo nel suo stato `initial`
 * (anche in SSR, uguale a `motion.div`). I `motion.*` del back office restano
 * completi e funzionano anche qui dentro.
 */
export default function MotionProvider({ children }: { children: ReactNode }) {
    return <LazyMotion features={loadFeatures}>{children}</LazyMotion>;
}
