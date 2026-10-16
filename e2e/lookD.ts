import { lookDFromEnv } from "../src/styles/lookDFromEnv";

/** La grafica D è accesa negli e2e con la stessa regola dell'app (`lookDFromEnv`). */
export const D_ON = lookDFromEnv(process.env.VITE_BACKOFFICE_D);
