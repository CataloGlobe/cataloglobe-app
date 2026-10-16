import { useMediaQuery } from "@/hooks/useMediaQuery";
import { LOOK_D } from "@/styles/lookD";

/**
 * «A destra» del tunnel (v55): al computer l'anteprima sta nella colonna a
 * destra; con la D al tablet e al telefono si apre con «Anteprima», e il
 * testo lo dice.
 */
export function Destra({ wide, narrow }: { wide: string; narrow: string }) {
    const small = useMediaQuery("(max-width: 1100px)");
    return <>{LOOK_D && small ? narrow : wide}</>;
}
