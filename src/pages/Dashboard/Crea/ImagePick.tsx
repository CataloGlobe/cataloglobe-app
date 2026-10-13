// La foto di un contenuto o di una storia: si sceglie, si vede, si toglie.
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/Button/Button";
import s from "./Crea.module.scss";

export function ImagePick({ url, id, onPick, label = "Aggiungi una foto" }: { url: string | null; id: string; onPick: (f: File | null) => void; label?: string }) {
    return (
        <div className={s.pic}>
            {url && <img src={url} alt="" />}
            <label htmlFor={id} className={s.picBtn}>
                <ImagePlus size={14} aria-hidden />
                {url ? "Cambia la foto" : label}
            </label>
            <input
                id={id}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className={s.vh}
                onChange={e => {
                    const f = e.target.files?.[0] ?? null;
                    if (f) onPick(f);
                    e.target.value = "";
                }}
            />
            {url && (
                <Button variant="ghost" size="sm" onClick={() => onPick(null)}>
                    Togli
                </Button>
            )}
        </div>
    );
}
