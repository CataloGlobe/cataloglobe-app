// Le feature di framer-motion (animazioni, gesti, trascinamento, layout) in un
// chunk a parte: le carica MotionProvider dopo il primo disegno. domMax e non
// domAnimation perché i fogli pubblici si trascinano (drag).
import { domMax } from "framer-motion";

export default domMax;
